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
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

const MAX_PHOTOS = 12;
const SECONDS_PER_PHOTO = 4;

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
const CAPTION_SCALE = 0.055;

/**
 * How far captions sit above the bottom edge, as a fraction of height. Larger
 * when an avatar PiP is present so lines clear the corner inset.
 */
const CAPTION_MARGIN = 0.08;
const CAPTION_MARGIN_WITH_PIP = 0.12;

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

/** ASS style string for burned captions at a readable size. */
function captionStyle(outW: number, outH: number, hasPip: boolean): string {
  const fontSize = Math.round(Math.min(outW, outH) * CAPTION_SCALE);
  const marginV = Math.round(outH * (hasPip ? CAPTION_MARGIN_WITH_PIP : CAPTION_MARGIN));
  return [
    `FontName=Arial`,
    `FontSize=${fontSize}`,
    `Bold=1`,
    `PrimaryColour=&H00FFFFFF`,   // white text
    `OutlineColour=&H00000000`,   // black outline, for legibility over footage
    `BorderStyle=1`,
    `Outline=3`,
    `Shadow=1`,
    `Alignment=2`,                // bottom-centre
    `MarginV=${marginV}`,
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
 * "photo" — still images, each held for SECONDS_PER_PHOTO.
 * "clip"  — stock MP4 footage, played at its own length.
 *
 * Only the pass-1 inputs differ; both produce a background track that pass 2
 * loops under the avatar, so the two share everything downstream.
 */
export type BackgroundKind = "photo" | "clip";

/**
 * Returns a new MP4 buffer with the media as background b-roll and the avatar
 * as a corner PiP, or null on any failure — callers must fall back to the
 * original avatar video so a compositing problem never loses a render.
 */
export async function compositePhotos(
  videoBuffer: Buffer,
  photoUrls: string[],
  width: number,
  height: number,
  kind: BackgroundKind = "photo",
  /**
   * Local .srt path to burn in during pass 2. Cheap rather than free: measured
   * on a 3:33 render, pass 2 went 22.3s -> 31.4s. Still far better than a
   * separate pass, which costs a whole extra encode.
   */
  srtPath?: string | null,
): Promise<Buffer | null> {
  const photos = photoUrls.filter(Boolean).slice(0, MAX_PHOTOS);
  if (photos.length === 0) return null;

  const { w: outW, h: outH } = outputSize(width, height);

  const startedAt = Date.now();
  const dir = join(tmpdir(), `broll-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const videoPath = join(dir, "avatar.mp4");
    const slidePath = join(dir, "slideshow.mp4");
    const outPath = join(dir, "out.mp4");
    await fs.writeFile(videoPath, videoBuffer);

    // Download the media.
    const photoPaths: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const res = await fetch(photos[i]);
      if (!res.ok) continue;
      const p = join(dir, `${kind}-${i}${kind === "clip" ? ".mp4" : ".img"}`);
      await fs.writeFile(p, Buffer.from(await res.arrayBuffer()));
      photoPaths.push(p);
    }
    if (photoPaths.length === 0) throw new Error(`No ${kind}s could be downloaded`);
    const n = photoPaths.length;

    // ── Pass 1: build the background track (video only) ──────────────────────
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      for (const p of photoPaths) {
        // A still needs -loop/-t to occupy time; a clip already has a duration.
        if (kind === "photo") {
          cmd.input(p).inputOptions(["-loop", "1", "-t", String(SECONDS_PER_PHOTO)]);
        } else {
          cmd.input(p);
        }
      }
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        parts.push(
          `[${i}:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,` +
          `crop=${outW}:${outH},setsar=1,format=yuv420p,fps=25[p${i}]`,
        );
      }
      parts.push(`${photoPaths.map((_, i) => `[p${i}]`).join("")}concat=n=${n}:v=1:a=0[bg]`);
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
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(slidePath)
        .inputOptions(["-stream_loop", "-1"]) // applies to slidePath (2nd input)
        .input(maskPath)
        .inputOptions(["-loop", "1"]) // still image — overlay's shortest=1 ends it
        .complexFilter([
          // Square-crop the avatar, then punch it to a circle with the mask.
          `[0:v]scale=${pipW}:${pipW}:force_original_aspect_ratio=increase,` +
            `crop=${pipW}:${pipW},format=rgba[sq]`,
          `[sq][2:v]alphamerge[av]`,
          // Captions burn last so they sit over the avatar inset, not under it.
          `[1:v][av]overlay=main_w-overlay_w-${margin}:main_h-overlay_h-${margin}:shortest=1` +
            (srtPath
              ? `[comp];[comp]subtitles='${escapeForFilter(srtPath)}':force_style='${captionStyle(outW, outH, true)}'[outv]`
              : `[outv]`),
        ])
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
          ...(kind === "clip"
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
    console.log(`[composite-photos] Composited ${n} ${kind}(s) into ${outW}x${outH} video in ${Math.round((Date.now() - startedAt) / 1000)}s (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
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

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inPath)
        .complexFilter([
          `[0:v]subtitles='${escapeForFilter(srtPath)}':force_style='${captionStyle(width, height, false)}'[outv]`,
        ])
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
    console.log(`[composite-photos] Burned captions into ${width}x${height} video in ${Math.round((Date.now() - startedAt) / 1000)}s (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
    return out;
  } catch (err) {
    console.error("[composite-photos] Caption burn failed, keeping plain video:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
