/**
 * Composite user-uploaded photos into a finished avatar video.
 *
 * HeyGen's Direct Video renders the avatar full-frame with no b-roll, so for
 * the paste-your-script flow (which renders verbatim via Direct Video) we add
 * the user's photos ourselves: the photos become a full-frame background
 * slideshow and the avatar is shrunk to a picture-in-picture in the corner —
 * the same look as the app's other videos. Runs in the webhook at store time,
 * before the video is uploaded to Supabase.
 *
 * No ffprobe dependency: the caller passes the target width/height (known from
 * the video type), and the avatar's own length drives the final duration — the
 * background slideshow is looped and clipped to the avatar via overlay
 * shortest=1, so we never need to read the avatar's duration.
 *
 * This runs inside a 300-second serverless function, and pass 2 re-encodes the
 * WHOLE avatar video — so encode speed, not quality, is the binding constraint.
 * An 8-minute 1080p render is ~12,000 frames, which libx264 cannot finish in
 * the budget on a single vCPU: it timed out, and because the timeout killed the
 * function before the upload step, the video was never stored permanently
 * either. Hence the 720p cap and ultrafast preset below — a resolution drop is
 * a far better outcome than a lost render.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { ffmpegFitFilter, fitImageBuffer, probeVideoSize } from "@/lib/utils/fit-frame";
import { followCropX, trackSubjectX } from "@/lib/utils/subject-track";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/** Ceiling on background sources — photos and stock clips combined. */
const MAX_SOURCES = 24; // 20 photos (DIRECT_PHOTO_LIMIT) plus a few clips
const SECONDS_PER_PHOTO = 4;
/**
 * How long each stock clip runs.
 *
 * Was 5s, to stop one long take dominating a mix that was mostly photos. That
 * reasoning holds when the user supplied photos; it is backwards when stock is
 * all there is. Four clips at 5s is 20 seconds of footage under a 3-minute
 * video — the same 20 seconds nine times over, which is what "the b-roll just
 * alternated" actually is.
 *
 * 20s costs nothing extra to encode: pass 2 re-encodes the full runtime of the
 * avatar either way, and pass 1 only builds the short background track. The
 * clip count is the expensive axis, because every clip is a separate download
 * inside the same 300s budget. Length is the free one, so it is the one to
 * spend: four clips now make 80 seconds, and a 3-minute video loops them twice
 * instead of nine times.
 */
const SECONDS_PER_CLIP = 20;

/**
 * Longest edge of the composited output. The avatar arrives from HeyGen at
 * 1080p; compositing at that size cannot finish inside the function's time
 * budget for a long video, so the output is capped at 720p.
 */
const MAX_LONG_EDGE = 1280;

/**
 * Caption height as a fraction of the frame's SHORT edge.
 *
 * HeyGen can burn captions itself, but its caption object exposes no font size
 * — `style: "default"` is the only value and it renders too small to read on a
 * phone. So we take the sidecar SRT and burn it here instead, which is also
 * what makes caption colour controllable later.
 *
 * Measuring against the short edge keeps captions the same visual size in
 * landscape and portrait; using height would make them huge in a 9:16 frame.
 */
const CAPTION_SCALE = 0.065;

/**
 * How far captions sit above the bottom edge, as a fraction of height. Larger
 * when an avatar PiP is present so lines clear the corner inset.
 */
const CAPTION_MARGIN = 0.08;

/**
 * Escape a path for use inside a filter-graph argument.
 *
 * ffmpeg splits filter options on `:`, so any colon in the path has to be
 * escaped, and backslashes must become forward slashes. The result is then
 * wrapped in single quotes by the caller.
 *
 * Exactly one backslash. fluent-ffmpeg passes the graph straight to execFile
 * with no shell in between, so shell-style double escaping produces a literal
 * `\\:` and ffmpeg fails with "Error initializing complex filters". Verified
 * against all five escaping forms; only quoted-single-backslash works.
 */
function escapeForFilter(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * The font captions are drawn in, and where it is.
 *
 * The style used to ask for Arial and nothing else. On a laptop that is a
 * font the system has. The server has no fonts and no fontconfig, so the
 * caption filter found nothing to draw with, drew nothing, and reported
 * success: every video through this path came back with no captions and
 * nothing in the log to say why. A font shipped with the app and named to
 * the filter by directory needs neither.
 *
 * The name is the font's own family name, which is what the filter matches
 * on; "Montserrat" alone does not find this file.
 */
const CAPTION_FONT_FILE = "Montserrat-SemiBold.ttf";
const CAPTION_FONT_NAME = "Montserrat SemiBold";

/** Copies the caption font beside the job and returns that directory, or null if it did not ship. */
async function captionFontDir(workDir: string): Promise<string | null> {
  for (const base of [join(process.cwd(), "fonts"), join(process.cwd(), "public", "fonts")]) {
    try {
      const dest = join(workDir, "capfonts");
      await fs.mkdir(dest, { recursive: true });
      await fs.copyFile(join(base, CAPTION_FONT_FILE), join(dest, CAPTION_FONT_FILE));
      return dest;
    } catch { /* not there; try the next */ }
  }
  console.error(`[composite-photos] ${CAPTION_FONT_FILE} is not in this function's bundle — captions will not be drawn`);
  return null;
}

/** The caption filter, pointed at the font. */
function subtitlesFilter(srtPath: string, fontsDir: string | null, style: string): string {
  return `subtitles='${escapeForFilter(srtPath)}'` +
    (fontsDir ? `:fontsdir='${escapeForFilter(fontsDir)}'` : "") +
    `:force_style='${style}'`;
}

/**
 * Which font the filter actually chose, from its own output.
 *
 * Logged on every captioned render, because the failure this guards against
 * is silent: the encode succeeds either way.
 */
function fontReport(stderr: string[]): string {
  const line = stderr.filter((l) => /fontselect/i.test(l)).pop();
  return line ? line.replace(/^\[[^\]]*\]\s*/, "").slice(0, 160) : "the filter did not say which font it used";
}

/** ASS style string for burned captions at a readable size. */
function captionStyle(outW: number, outH: number, hasPip: boolean): string {
  /**
   * Sizes are worked out in pixels and then converted, because the filter
   * does not take pixels.
   *
   * An .srt has no canvas of its own, so the filter lays it out on a nominal
   * 384x288 one and scales that to the video. Every number in this style is
   * read on that canvas. Given as pixels they came out two and a half times
   * too large on a 720p frame: text a seventh of the picture high, sitting a
   * third of the way up it. Nobody saw it, because on the server the captions
   * were not drawing at all.
   */
  const y = 288 / outH;
  const x = 384 / outW;
  const fontPx = Math.min(outW, outH) * CAPTION_SCALE;
  const sidePx = outW * 0.04;
  let bottomPx = outH * CAPTION_MARGIN;
  let rightPx = sidePx;
  if (hasPip) {
    // The speaker's circle is in the bottom right corner: 30% of the width,
    // 3% in from the edges (see pass 2). On a wide frame the captions sit
    // beside it; on a tall one there is no room beside, so they sit above.
    const inset = outW * 0.3 + outW * 0.03 * 2;
    if (outW >= outH) rightPx = inset;
    else bottomPx = inset + outH * 0.02;
  }
  return [
    `FontName=${CAPTION_FONT_NAME}`,
    `FontSize=${Math.max(8, Math.round(fontPx * y))}`,
    `Bold=1`,
    `PrimaryColour=&H00FFFFFF`,   // white text
    `OutlineColour=&H00000000`,   // black outline, for legibility over footage
    `BorderStyle=1`,
    `Outline=${Math.max(1, Math.round(fontPx * 0.09 * y))}`,
    `Shadow=1`,
    `Alignment=2`,                // bottom-centre, between the side margins
    `MarginL=${Math.round(sidePx * x)}`,
    `MarginR=${Math.round(rightPx * x)}`,
    `MarginV=${Math.round(bottomPx * y)}`,
  ].join(",");
}

/** Scale a render size down to MAX_LONG_EDGE, keeping both edges even for x264. */
function outputSize(width: number, height: number): { w: number; h: number } {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
  return {
    w: Math.round((width * scale) / 2) * 2,
    h: Math.round((height * scale) / 2) * 2,
  };
}

/**
 * What the background is built from.
 *
 * "photo" — still images, each held for SECONDS_PER_PHOTO, or for `seconds`
 *           when it has been given a stretch of the narration.
 * "clip"  — stock MP4 footage, played at its own length.
 *
 * Only the pass-1 inputs differ; both produce a background track that pass 2
 * loops under the avatar, so the two share everything downstream.
 */
export type BackgroundKind = "photo" | "clip";

/** One entry in the background track. */
export interface BackgroundItem {
  url: string;
  kind: BackgroundKind;
  /**
   * Exactly how long this one is on screen, for a clip chosen for a
   * particular stretch of the narration. Without it a photo holds for
   * SECONDS_PER_PHOTO and a clip plays up to SECONDS_PER_CLIP.
   */
  seconds?: number;
  /** The clip is shorter than `seconds` and has to run again to fill it. */
  loop?: boolean;
  /**
   * Play the clip this many times slower (1.0–1.4) so it fills `seconds`
   * without running again (2026-10-24): a scene restarting from its first
   * frame read as the same picture popping in and out.
   */
  slow?: number;
}

/**
 * Returns a new MP4 buffer with the media as background b-roll and the avatar
 * as a corner PiP, or null on any failure — callers must fall back to the
 * original avatar video so a compositing problem never loses a render.
 */
export async function compositePhotos(
  videoBuffer: Buffer,
  /**
   * The background track, in order. Photos and clips can be mixed: six photos
   * against a three-minute script looped every 24 seconds, so stock footage is
   * appended to lengthen and vary the sequence.
   */
  items: BackgroundItem[],
  width: number,
  height: number,
  /**
   * Local .srt path to burn in during pass 2. Cheap rather than free: measured
   * on a 3:33 render, pass 2 went 22.3s -> 31.4s. Still far better than a
   * separate pass, which costs a whole extra encode.
   */
  srtPath?: string | null,
  /** A Digital Twin: the circle follows the speaker (2026-10-24). */
  opts: { followSubject?: boolean } = {},
): Promise<Buffer | null> {
  const sources = items.filter((it) => it?.url).slice(0, MAX_SOURCES);
  if (sources.length === 0) return null;

  const { w: outW, h: outH } = outputSize(width, height);

  const startedAt = Date.now();
  const dir = join(tmpdir(), `broll-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const videoPath = join(dir, "avatar.mp4");
    const slidePath = join(dir, "slideshow.mp4");
    const outPath = join(dir, "out.mp4");
    await fs.writeFile(videoPath, videoBuffer);

    // Download the media. A source that will not download is skipped rather
    // than failing the render — the rest still make a background.
    //
    // Photos are re-encoded to baseline JPEG rather than written through as
    // they arrive. Scraped listing photos are frequently WebP (and phone
    // uploads can be HEIC), formats whose ffmpeg support depends on how the
    // bundled build was compiled — and they were previously all saved under a
    // generic ".img" name, leaving ffmpeg to sniff a format it may not decode.
    // One undecodable input fails the whole concat, which silently costs the
    // user their b-roll AND their captions. sharp decodes all of these
    // reliably, so normalising here removes the entire class of failure.
    // .rotate() with no argument applies EXIF orientation, which also stops
    // phone photos coming out sideways.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sharp = ((await import("sharp")) as any).default;
    const downloaded: { path: string; kind: BackgroundKind; seconds?: number; loop?: boolean; slow?: number; w?: number; h?: number }[] = [];
    /**
     * Time owed by a timed clip that would not download.
     *
     * A timed sequence is cut to the narration, so dropping one clip would
     * pull every later picture early. Its time goes to the clip before it,
     * which then runs on, or to the next one if it was the first.
     */
    let owed = 0;
    const lost = (i: number) => {
      const t = sources[i].seconds;
      if (!t) return;
      const before = downloaded[downloaded.length - 1];
      if (before?.seconds) { before.seconds += t; before.loop = true; }
      else owed += t;
    };
    for (let i = 0; i < sources.length; i++) {
      const { url, kind } = sources[i];
      try {
        const res = await fetch(url);
        if (!res.ok) { lost(i); continue; }
        const raw = Buffer.from(await res.arrayBuffer());
        if (kind === "clip") {
          const p = join(dir, `clip-${i}.mp4`);
          await fs.writeFile(p, raw);
          // Its shape, so one of the other orientation can be fitted whole
          // over a blurred copy rather than cropped (2026-10-24).
          const { width: w, height: h } = await probeVideoSize(p).catch(() => ({ width: 0, height: 0 }));
          const timed = sources[i].seconds;
          const slow = sources[i].slow && sources[i].slow! > 1.001 ? Math.min(1.4, sources[i].slow!) : undefined;
          downloaded.push(timed
            // Time owed by a lost clip can't be met by slowing further, so it loops.
            ? { path: p, kind, seconds: timed + owed, loop: sources[i].loop || owed > 0, slow: owed > 0 ? undefined : slow, w, h }
            : { path: p, kind, w, h });
          if (timed) owed = 0;
        } else {
          const p = join(dir, `photo-${i}.jpg`);
          // Fitted to the frame first (2026-10-24): a photo of the other
          // orientation is shown whole over a blurred copy, not cropped to a
          // strip. Close in shape it is cropped to fill, as before.
          await fs.writeFile(p, await fitImageBuffer(raw, outW, outH).catch(async () => sharp(raw).rotate().jpeg({ quality: 90 }).toBuffer()));
          // A photo given a sentence of its own is held for that sentence,
          // and picks up time owed exactly as a timed clip does.
          const timed = sources[i].seconds;
          downloaded.push(timed ? { path: p, kind, seconds: timed + owed } : { path: p, kind });
          if (timed) owed = 0;
        }
      } catch (err) {
        // Named so a systematically failing format is visible in the logs
        // instead of showing up as a bare avatar video nobody can explain.
        console.warn(`[composite-photos] skipped ${kind} ${i} (${sources[i].url.slice(-40)}): ${err instanceof Error ? err.message : err}`);
        lost(i);
      }
    }
    if (downloaded.length === 0) throw new Error("No b-roll sources could be downloaded");
    const n = downloaded.length;

    // ── Pass 1: build the background track (video only) ──────────────────────
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      for (const { path: p, kind, seconds: timed, loop, slow } of downloaded) {
        if (kind === "clip" && timed && slow) {
          // Slowed to fill its stretch: read only as much of the clip as that
          // takes (the setpts in the filter below stretches it).
          cmd.input(p).inputOptions(["-t", (timed / slow).toFixed(3)]);
        } else if (kind === "clip" && timed) {
          // On screen for exactly its stretch of the narration. Run again
          // only when it is shorter than that, which is the rare case.
          cmd.input(p).inputOptions([...(loop ? ["-stream_loop", "-1"] : []), "-t", timed.toFixed(3)]);
        } else if (kind === "photo") {
          // A still needs -loop/-t to occupy time.
          cmd.input(p).inputOptions(["-loop", "1", "-t", timed ? timed.toFixed(3) : String(SECONDS_PER_PHOTO)]);
        } else {
          // A clip has its own duration, but stock footage runs to 20s+ and one
          // long clip would dominate the sequence — and every extra second is
          // re-encoded twice. Capped so the mix stays balanced and predictable.
          cmd.input(p).inputOptions(["-t", String(SECONDS_PER_CLIP)]);
        }
      }
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        // Photos arrive already fitted; a clip is fitted here by the same rule.
        const d = downloaded[i];
        parts.push(...ffmpegFitFilter({
          input: `[${i}:v]`, output: `[p${i}]`, width: outW, height: outH,
          srcW: d.kind === "clip" ? d.w ?? 0 : outW, srcH: d.kind === "clip" ? d.h ?? 0 : outH,
          ...(d.kind === "clip" && d.seconds && d.slow && { pre: `setpts=${d.slow.toFixed(4)}*(PTS-STARTPTS)` }),
          post: d.kind === "clip" && d.seconds && d.slow
            // Exactly its stretch after slowing, so every later cut stays on its word.
            ? `setsar=1,format=yuv420p,fps=25,trim=duration=${d.seconds.toFixed(3)},setpts=PTS-STARTPTS`
            : "setsar=1,format=yuv420p,fps=25",
          tag: `c${i}`,
        }));
      }
      parts.push(`${downloaded.map((_, i) => `[p${i}]`).join("")}concat=n=${n}:v=1:a=0[bg]`);
      cmd
        .complexFilter(parts, "bg")
        // Intermediate only — pass 2 re-encodes it, so spend nothing here.
        .outputOptions(["-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "0"])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(slidePath);
    });

    // ── Pass 2: loop the slideshow under the avatar PiP; avatar drives length ─
    const pipW = Math.round((outW * 0.3) / 2) * 2;
    const margin = Math.round(outW * 0.03);

    // Circular mask for the avatar inset, generated once as a still and then
    // alphamerged each frame. Drawing the circle with geq directly on the video
    // would evaluate an expression per pixel per plane for the entire runtime —
    // on a 3:33 render that is billions of evaluations. As a single frame it is
    // free, and alphamerge is a cheap per-frame composite.
    const maskPath = join(dir, "pip-mask.png");
    const radius = pipW / 2;
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(`color=c=black:s=${pipW}x${pipW}`)
        .inputFormat("lavfi")
        .complexFilter(
          [`[0:v]format=gray,geq=lum='if(lte(hypot(X-${radius},Y-${radius}),${radius}),255,0)'[m]`],
          "m",
        )
        .outputOptions(["-frames:v", "1"])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(maskPath);
    });
    const fontsDir = srtPath ? await captionFontDir(dir) : null;
    const pass2Log: string[] = [];

    /**
     * The square cut for the circle. The middle of the picture, as always —
     * except on a Digital Twin, which is real footage of someone who moves:
     * there the square follows them across the frame (2026-10-24, the owner's
     * "not in circle most of the time"). Anything it can't read keeps the middle.
     */
    let squareCut = `[0:v]scale=${pipW}:${pipW}:force_original_aspect_ratio=increase,crop=${pipW}:${pipW},format=rgba[sq]`;
    if (opts.followSubject) {
      try {
        const { width: sw, height: sh } = await probeVideoSize(videoPath);
        const centres = sw > sh * 1.05 ? await trackSubjectX(videoPath) : null;
        if (centres && sh > 0) {
          const scaledW = Math.round((pipW * sw) / sh / 2) * 2;
          squareCut = `[0:v]scale=${scaledW}:${pipW},crop=${pipW}:${pipW}:${followCropX(centres, scaledW, pipW)}:0,format=rgba[sq]`;
          console.log(`[composite-photos] circle follows the speaker (${centres.length} points, ${Math.round(Math.min(...centres) * 100)}–${Math.round(Math.max(...centres) * 100)}% across)`);
        }
      } catch (err) {
        console.warn("[composite-photos] speaker tracking skipped:", err instanceof Error ? err.message : err);
      }
    }
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(slidePath)
        .inputOptions(["-stream_loop", "-1"]) // applies to slidePath (2nd input)
        .input(maskPath)
        .inputOptions(["-loop", "1"]) // still image — overlay's shortest=1 ends it
        .complexFilter([
          // Square-crop the avatar, then punch it to a circle with the mask.
          squareCut,
          `[sq][2:v]alphamerge[av]`,
          // Captions burn last so they sit over the avatar inset, not under it.
          `[1:v][av]overlay=main_w-overlay_w-${margin}:main_h-overlay_h-${margin}:shortest=1` +
            (srtPath
              ? `[comp];[comp]${subtitlesFilter(srtPath, fontsDir, captionStyle(outW, outH, true))}[outv]`
              : `[outv]`),
        ])
        .on("stderr", (line: string) => { if (/fontselect|font provider/i.test(line)) pass2Log.push(line); })
        // This encodes the full length of the avatar video — the one step that
        // has to stay inside the function's time budget.
        //
        // The preset depends on what is behind the avatar, because the two
        // compress nothing alike. A photo slideshow is nearly static, so
        // ultrafast already lands ~7MB. Real stock footage is all motion:
        // measured on a 3:33 render, ultrafast/crf26 produced 125MB while
        // veryfast/crf28 produced 32.6MB for two extra seconds. Paying those
        // seconds is obviously right — the alternative is uploading and then
        // serving a 125MB file.
        .outputOptions([
          "-map", "[outv]",
          "-map", "0:a?",
          "-c:v", "libx264",
          // Any moving footage in the mix pushes the output size up, so the
          // tighter setting applies as soon as one clip is present.
          ...(downloaded.some((d) => d.kind === "clip")
            ? ["-preset", "veryfast", "-crf", "28"]
            : ["-preset", "ultrafast", "-crf", "26"]),
          "-pix_fmt", "yuv420p",
          "-threads", "0",
          "-c:a", "aac",
          "-b:a", "192k",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outPath);
    });

    const out = await fs.readFile(outPath);
    const photoCount = downloaded.filter((d) => d.kind === "photo").length;
    console.log(
      `[composite-photos] Composited ${photoCount} photo(s) + ${n - photoCount} clip(s) ` +
      `into ${outW}x${outH} video in ${Math.round((Date.now() - startedAt) / 1000)}s ` +
      `(${(out.length / 1024 / 1024).toFixed(1)} MB)` +
      (srtPath ? ` · captions: ${fontReport(pass2Log)}` : " · no captions"),
    );
    return out;
  } catch (err) {
    console.error("[composite-photos] Failed, keeping plain avatar video:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Burn captions into a video that has no b-roll.
 *
 * When compositing runs, captions ride along in pass 2 for free — that pass
 * re-encodes every frame anyway. This is the other case: avatar-only renders,
 * where captions mean adding a full re-encode that would not otherwise happen.
 * It keeps the frame at its original size (no b-roll means nothing to downscale
 * for) and uses veryfast, since a talking head compresses well.
 *
 * Returns null on any failure so the caller keeps the un-captioned video.
 */
export async function prependClip(
  videoBuffer: Buffer,
  /** A silent opening shot (its own sound is dropped), downloaded straight away. */
  clipUrl: string,
  clipSeconds: number,
): Promise<Buffer | null> {
  const startedAt = Date.now();
  const dir = join(tmpdir(), `opener-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const inPath = join(dir, "in.mp4");
    const clipPath = join(dir, "clip.mp4");
    const outPath = join(dir, "out.mp4");
    await fs.writeFile(inPath, videoBuffer);
    const res = await fetch(clipUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`opener download HTTP ${res.status}`);
    await fs.writeFile(clipPath, Buffer.from(await res.arrayBuffer()));
    const { width: w, height: h } = await probeVideoSize(inPath);
    if (!w || !h) throw new Error("couldn't read the video's size");
    const W = Math.round(w / 2) * 2, H = Math.round(h / 2) * 2;
    const d = Math.max(1, clipSeconds).toFixed(3);
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(clipPath)
        .input(inPath)
        .complexFilter([
          `[0:v]trim=duration=${d},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=25,format=yuv420p[cv]`,
          `aevalsrc=0:c=stereo:s=48000:d=${d}[ca]`,
          `[1:v]scale=${W}:${H},setsar=1,fps=25,format=yuv420p[mv]`,
          `[1:a]aresample=48000,aformat=channel_layouts=stereo[ma]`,
          `[cv][ca][mv][ma]concat=n=2:v=1:a=1[outv][outa]`,
        ])
        .outputOptions([
          "-map", "[outv]", "-map", "[outa]",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-threads", "0",
          "-c:a", "aac", "-b:a", "192k",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outPath);
    });
    const out = await fs.readFile(outPath);
    console.log(`[composite-photos] Opener put first (${d}s) in ${Math.round((Date.now() - startedAt) / 1000)}s`);
    return out;
  } catch (err) {
    console.error("[composite-photos] Opener skipped, keeping the video as it was:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function burnSubtitles(
  videoBuffer: Buffer,
  srtPath: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const startedAt = Date.now();
  const dir = join(tmpdir(), `subs-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const inPath = join(dir, "in.mp4");
    const outPath = join(dir, "out.mp4");
    await fs.writeFile(inPath, videoBuffer);

    const fontsDir = await captionFontDir(dir);
    const burnLog: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inPath)
        .complexFilter([
          `[0:v]${subtitlesFilter(srtPath, fontsDir, captionStyle(width, height, false))}[outv]`,
        ])
        .on("stderr", (line: string) => { if (/fontselect|font provider/i.test(line)) burnLog.push(line); })
        .outputOptions([
          "-map", "[outv]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "26",
          "-pix_fmt", "yuv420p",
          "-threads", "0",
          "-c:a", "copy",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outPath);
    });

    const out = await fs.readFile(outPath);
    console.log(`[composite-photos] Burned captions into ${width}x${height} video in ${Math.round((Date.now() - startedAt) / 1000)}s (${(out.length / 1024 / 1024).toFixed(1)} MB) · ${fontReport(burnLog)}`);
    return out;
  } catch (err) {
    console.error("[composite-photos] Caption burn failed, keeping plain video:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
