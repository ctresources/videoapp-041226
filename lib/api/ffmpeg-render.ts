/**
 * FFmpeg video rendering engine.
 * Replaces Creatomate — assembles stock b-roll, voiceover, captions, logo, PiP
 * into a final MP4 using FFmpeg with fluent-ffmpeg.
 *
 * Zero monthly cost. Runs server-side.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { generateASS, type WordTimestamp } from "./whisper";

// Point fluent-ffmpeg to the installed binary
ffmpeg.setFfmpegPath(ffmpegPath.path);

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoType = "blog_long" | "youtube_16x9" | "reel_9x16" | "short_1x1";

export interface RenderParams {
  title: string;
  audioUrl: string;                // Supabase public URL to voiceover MP3
  stockVideoUrls: string[];       // Pixabay MP4 URLs
  wordTimestamps: WordTimestamp[];
  logoUrl?: string;
  avatarUrl?: string;              // static headshot image (fallback)
  avatarVideoUrl?: string;         // HeyGen talking avatar MP4 (preferred)
  agentName?: string;
  primaryColor?: string;           // hex like "#3B82F6"
  captionColor?: string;           // hex like "#FFFFFF"
  captionHighlightColor?: string;  // hex like "#FACC15"
}

interface FormatConfig {
  width: number;
  height: number;
  titleFontSize: number;
  captionFontSize: number;
  captionYPercent: number;        // 0–1 from top
  logoSize: number;
  avatarSize: number;
  avatarX: number;                // pixels from left
  avatarY: number;                // pixels from top
  nameY: number;
  sceneDuration: number;          // seconds per b-roll clip
}

const FORMAT_CONFIGS: Record<VideoType, FormatConfig> = {
  blog_long: {
    width: 1920, height: 1080,
    titleFontSize: 64, captionFontSize: 42,
    captionYPercent: 0.88,
    logoSize: 130, avatarSize: 150,
    avatarX: 1690, avatarY: 885,
    nameY: 960, sceneDuration: 8,
  },
  youtube_16x9: {
    width: 1920, height: 1080,
    titleFontSize: 72, captionFontSize: 40,
    captionYPercent: 0.88,
    logoSize: 130, avatarSize: 150,
    avatarX: 1690, avatarY: 885,
    nameY: 960, sceneDuration: 8,
  },
  reel_9x16: {
    width: 1080, height: 1920,
    titleFontSize: 68, captionFontSize: 52,
    captionYPercent: 0.72,
    logoSize: 100, avatarSize: 200,
    avatarX: 540, avatarY: 1056,
    nameY: 1180, sceneDuration: 6,
  },
  short_1x1: {
    width: 1080, height: 1080,
    titleFontSize: 58, captionFontSize: 44,
    captionYPercent: 0.80,
    logoSize: 110, avatarSize: 160,
    avatarX: 950, avatarY: 885,
    nameY: 970, sceneDuration: 7,
  },
};

// ─── Utility functions ────────────────────────────────────────────────────────

async function downloadFile(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buffer);
    return true;
  } catch (err) {
    console.warn(`[ffmpeg-render] Download failed (${url}): ${err}`);
    return false;
  }
}

/**
 * How long the audio is, without ffprobe.
 *
 * @ffmpeg-installer ships one binary — ffmpeg — and nothing in this project
 * installs ffprobe, so `ffmpeg.ffprobe()` fails with "Cannot find ffprobe" on
 * the first call. Every render here begins by measuring its audio, so that
 * alone was enough to stop this module ever producing a video, quite apart
 * from the missing xfade filter.
 *
 * FFmpeg reports the duration itself when asked to open a file with no output.
 * It exits non-zero doing so, which is expected rather than a failure — the
 * line we want is on stderr either way.
 */
async function probeAudioDuration(filePath: string): Promise<number> {
  const stderr = await new Promise<string>((resolve) => {
    let buf = "";
    ffmpeg(filePath)
      .on("stderr", (line: string) => { buf += line + "\n"; })
      .on("error", () => resolve(buf))
      .on("end", () => resolve(buf))
      // No output file: FFmpeg prints what it found and stops.
      .addOption("-f", "null")
      .save(process.platform === "win32" ? "NUL" : "/dev/null");
  });

  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (m) {
    const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  // Better a usable default than a failed render: the caller's own -t bounds
  // the output, so an over-long guess costs a trim rather than a broken video.
  console.warn("[ffmpeg-render] Could not read audio duration; assuming 60s.");
  return 60;
}

/** Escape text for FFmpeg drawtext filter (colons, backslashes, single quotes). */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")   // replace smart apostrophe — avoids shell quoting issues
    .replace(/\n/g, " ");
}

/** Convert a filesystem path to FFmpeg-compatible forward-slash path.
 *  On Windows: C:\foo\bar → C\:/foo/bar  (colon in drive letter must be escaped)
 */
function toFFmpegPath(p: string): string {
  // Normalize to forward slashes
  let fwd = p.replace(/\\/g, "/");
  // Escape the drive-letter colon on Windows (e.g. C: → C\:)
  fwd = fwd.replace(/^([A-Za-z]):\//, "$1\\:/");
  return fwd;
}

// Cache of which font files actually exist (checked once per process)
const _fontExists: Record<string, boolean> = {};

/** Get FFmpeg fontfile attribute — returns empty string if file is missing. */
/**
 * The `fontfile=` fragment for drawtext, or null when the font did not ship.
 *
 * Null rather than an empty string, and the difference is the whole bug: with
 * no fontfile, drawtext falls back to the font family "Sans" and asks
 * fontconfig to resolve it. A serverless container has no fonts and no
 * fontconfig — "Cannot load default config file", "Cannot find a valid font
 * for the family Sans" — so the filter fails to initialise and takes the
 * entire render with it. An empty string was never a fallback here; it was a
 * guaranteed crash wearing the shape of one. Callers must now skip the text
 * rather than draw it in a font that cannot exist.
 */
async function fontAttr(weight: string): Promise<string | null> {
  const key = weight;
  if (_fontExists[key] === undefined) {
    const p = join(process.cwd(), "public", "fonts", `Montserrat-${weight}.ttf`);
    try {
      await fs.access(p);
      _fontExists[key] = true;
    } catch {
      _fontExists[key] = false;
      console.warn(`[ffmpeg-render] Font not found: Montserrat-${weight}.ttf — using default font`);
    }
  }
  if (!_fontExists[key]) return null;
  const p = join(process.cwd(), "public", "fonts", `Montserrat-${weight}.ttf`);
  return `fontfile='${toFFmpegPath(p)}':`;
}

/**
 * Copy a font into the render's own temp directory and point FFmpeg at that.
 *
 * Because handing FFmpeg the path under the deployment root does not work, and
 * the logs are emphatic about it: Node's fs.access resolves
 * /var/task/public/fonts/Montserrat-ExtraBold.ttf happily, drawtext is handed
 * the identical string, and FFmpeg comes back with ENOENT. Whatever the
 * deployment does to that directory — an overlay, a lazily materialised
 * asset — a separate process spawned from ours cannot open what we can read.
 *
 * /tmp has no such argument about it. Photos, audio and the output all already
 * live there, so a font copied alongside them is a path both processes agree
 * exists. Reading it through Node is also the honest test of availability: an
 * access check that passes and a read that fails is exactly the trap above.
 *
 * Null when the font genuinely is not there, and the caller then draws no
 * text — see fontAttr for why an empty fontfile is worse than no text at all.
 */
/**
 * Is this actually a font, or something that merely ends in .ttf?
 *
 * Not a paranoid check — it is the bug. Three of the four Montserrat files in
 * this repo are HTML pages saved with a .ttf extension: 302 KB beginning
 * "\n\n\n\n<!DOCTYPE html>" rather than the four bytes every TrueType file
 * starts with. Someone saved a download page instead of the download.
 *
 * FreeType rejects them, drawtext falls back to asking fontconfig for the
 * family "Sans", and a serverless container has no fontconfig and no fonts —
 * so the filter fails to initialise and the whole render dies. A developer
 * machine hides this completely: it has system fonts, the fallback succeeds,
 * and the render passes locally while failing in production every time.
 */
function looksLikeFont(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  const magic = bytes.subarray(0, 4).toString("hex");
  return (
    magic === "00010000" || // TrueType
    magic === "74727565" || // 'true'
    magic === "74746366" || // 'ttcf' — TrueType Collection
    magic === "4f54544f"    // 'OTTO' — OpenType/CFF
  );
}

/**
 * Copy a usable font into the render's own temp directory, and point FFmpeg
 * there.
 *
 * Two problems, one function. FFmpeg cannot open files under the deployment
 * root that Node reads happily — fs.access resolves
 * /var/task/public/fonts/..., the spawned process gets ENOENT — so the bytes
 * are staged into /tmp beside the photos and audio, which both processes agree
 * exists. And the file is checked for being a font at all before it is used.
 *
 * The weight is a preference rather than a requirement. A title set in
 * Montserrat Variable instead of Montserrat ExtraBold is a slightly lighter
 * title; a title in a font that will not load is no video.
 */
async function stageFont(weight: string, dir: string): Promise<string | null> {
  const candidates = [
    join(process.cwd(), "public", "fonts", `Montserrat-${weight}.ttf`),
    join(process.cwd(), "public", "fonts", "Montserrat-Variable.ttf"),
    join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"),
    join(process.cwd(), "fonts", "Anton-Regular.ttf"),
  ];

  for (const src of candidates) {
    try {
      const bytes = await fs.readFile(src);
      if (!looksLikeFont(bytes)) {
        console.warn(`[ffmpeg-render] ${src} is not a font file — skipping it.`);
        continue;
      }
      const dest = join(dir, `font-${weight}.ttf`);
      await fs.writeFile(dest, bytes);
      return `fontfile='${toFFmpegPath(dest)}':`;
    } catch {
      // Missing is ordinary — try the next one.
    }
  }

  console.warn(`[ffmpeg-render] No usable font for ${weight} — that text will be skipped.`);
  return null;
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Render a video using FFmpeg. Downloads all assets, composes them, and returns
 * the final MP4 as a Buffer.
 */
export async function renderVideo(
  params: RenderParams,
  videoType: VideoType,
): Promise<Buffer> {
  const cfg = FORMAT_CONFIGS[videoType];
  // Use OS temp dir — works on both Linux (/tmp) and Windows
  const renderTmpDir = join(tmpdir(), `render-${randomUUID()}`);
  await fs.mkdir(renderTmpDir, { recursive: true });

  console.log(`[ffmpeg-render] Temp dir: ${renderTmpDir}`);
  console.log(`[ffmpeg-render] FFmpeg binary: ${ffmpegPath.path}`);

  try {
    // ── 1. Download assets ───────────────────────────────────────────────────
    const audioPath = join(renderTmpDir, "voiceover.mp3");
    const outputPath = join(renderTmpDir, "output.mp4");

    // Audio is required
    const audioOk = await downloadFile(params.audioUrl, audioPath);
    if (!audioOk) throw new Error("Failed to download voiceover audio");

    // Stock video clips (non-fatal individually)
    const clipPaths: string[] = [];
    for (let i = 0; i < params.stockVideoUrls.length; i++) {
      const p = join(renderTmpDir, `clip${i}.mp4`);
      const ok = await downloadFile(params.stockVideoUrls[i], p);
      if (ok) clipPaths.push(p);
    }

    // Logo (non-fatal)
    let logoPath: string | null = null;
    if (params.logoUrl) {
      const lp = join(renderTmpDir, "logo.png");
      const ok = await downloadFile(params.logoUrl, lp);
      if (ok) logoPath = lp;
    }

    // Avatar — prefer talking video, fall back to static photo
    let avatarVideoPath: string | null = null;
    let avatarImagePath: string | null = null;
    if (params.avatarVideoUrl) {
      const ap = join(renderTmpDir, "avatar_talking.mp4");
      const ok = await downloadFile(params.avatarVideoUrl, ap);
      if (ok) avatarVideoPath = ap;
    }
    if (!avatarVideoPath && params.avatarUrl) {
      const ap = join(renderTmpDir, "avatar.jpg");
      const ok = await downloadFile(params.avatarUrl, ap);
      if (ok) avatarImagePath = ap;
    }

    console.log(`[ffmpeg-render] Assets ready — clips:${clipPaths.length} logo:${!!logoPath} avatarVideo:${!!avatarVideoPath} avatarImage:${!!avatarImagePath}`);

    // ── 2. Probe audio duration ─────────────────────────────────────────────
    const audioDuration = await probeAudioDuration(audioPath);
    console.log(`[ffmpeg-render] Audio duration: ${audioDuration.toFixed(1)}s`);

    // ── 3. Generate ASS subtitle file ───────────────────────────────────────
    const assPath = join(renderTmpDir, "captions.ass");
    const assContent = generateASS(params.wordTimestamps, {
      width: cfg.width,
      height: cfg.height,
      fontSize: cfg.captionFontSize,
      fontColor: (params.captionColor || "#FFFFFF").replace("#", ""),
      highlightColor: (params.captionHighlightColor || "#FACC15").replace("#", ""),
      yPosition: Math.round(cfg.height * cfg.captionYPercent),
    });
    await fs.writeFile(assPath, assContent, "utf8");

    // ── 4. Build + run FFmpeg ───────────────────────────────────────────────
    // Try with ASS subtitles first; if the binary lacks libass, retry without.
    try {
      await buildAndRun(
        renderTmpDir, outputPath, audioPath, clipPaths, assPath,
        logoPath, avatarVideoPath, avatarImagePath, params, cfg, audioDuration, videoType,
        true,
      );
    } catch (renderErr) {
      const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
      if (msg.toLowerCase().includes("ass") || msg.toLowerCase().includes("subtitle") || msg.toLowerCase().includes("libass")) {
        console.warn("[ffmpeg-render] ASS captions failed (libass not available?), retrying without captions...");
        await buildAndRun(
          renderTmpDir, outputPath, audioPath, clipPaths, assPath,
          logoPath, avatarVideoPath, avatarImagePath, params, cfg, audioDuration, videoType,
          false,
        );
      } else {
        throw renderErr;
      }
    }

    // ── 5. Read output ──────────────────────────────────────────────────────
    const result = await fs.readFile(outputPath);
    console.log(`[ffmpeg-render] Output: ${(result.length / 1024 / 1024).toFixed(1)} MB`);
    return result;

  } finally {
    await fs.rm(renderTmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── FFmpeg command builder ───────────────────────────────────────────────────

async function buildAndRun(
  tmpDir: string,
  outputPath: string,
  audioPath: string,
  clipPaths: string[],
  assPath: string,
  logoPath: string | null,
  avatarVideoPath: string | null,
  avatarImagePath: string | null,
  params: RenderParams,
  cfg: FormatConfig,
  audioDuration: number,
  videoType: VideoType,
  withCaptions = true,
): Promise<void> {
  const { width, height } = cfg;

  // If no stock clips, generate a solid color background
  if (clipPaths.length === 0) {
    const bgPath = join(tmpDir, "bg_color.mp4");
    await generateColorBackground(bgPath, width, height, audioDuration, params.primaryColor || "#0F172A");
    clipPaths = [bgPath];
  }

  const filterParts: string[] = [];
  const inputs: string[] = [];

  // Inputs 0..N-1: stock video clips
  for (const p of clipPaths) inputs.push(p);
  const audioInputIdx = inputs.length;
  inputs.push(audioPath);

  const logoInputIdx = audioInputIdx + 1;
  if (logoPath) inputs.push(logoPath);

  let avatarInputIdx = -1;
  if (avatarVideoPath) {
    avatarInputIdx = inputs.length;
    inputs.push(avatarVideoPath);
  } else if (avatarImagePath) {
    avatarInputIdx = inputs.length;
    inputs.push(avatarImagePath);
  }

  // ── Scale each clip ───────────────────────────────────────────────────────
  for (let i = 0; i < clipPaths.length; i++) {
    const dur = Math.min(cfg.sceneDuration, audioDuration);
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setpts=PTS-STARTPTS,` +
      `trim=duration=${dur},setpts=PTS-STARTPTS,` +
      `fps=30[clip${i}]`
    );
  }

  // ── Concatenate clips ─────────────────────────────────────────────────────
  let bgLabel: string;
  if (clipPaths.length === 1) {
    bgLabel = "clip0";
  } else {
    const concatInputs = clipPaths.map((_, i) => `[clip${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${clipPaths.length}:v=1:a=0[bgconcat]`);
    bgLabel = "bgconcat";
  }

  // ── Loop to fill audio duration ───────────────────────────────────────────
  const totalClipDur = clipPaths.length * cfg.sceneDuration;
  if (totalClipDur < audioDuration) {
    const loopFrames = Math.ceil(audioDuration * 30);
    filterParts.push(
      `[${bgLabel}]loop=loop=-1:size=${loopFrames}:start=0,` +
      `trim=duration=${audioDuration},setpts=PTS-STARTPTS[bgloop]`
    );
    bgLabel = "bgloop";
  }

  // ── Dark overlay ─────────────────────────────────────────────────────────
  filterParts.push(
    `[${bgLabel}]drawbox=x=0:y=0:w=${width}:h=${height}:color=black@0.50:t=fill[bgdark]`
  );

  // ── Preload font attributes (async) ──────────────────────────────────────
  //
  // Coerced to empty strings here, which keeps this function exactly as it was.
  // renderVideo has no callers, and the slideshow path is the one being brought
  // into use — but if this one ever is, its drawtext sites need the same
  // treatment as the slideshow's: skip the text when there is no font, because
  // falling back to the family "Sans" fails outright in a container that has no
  // fontconfig, and takes the render with it.
  const [titleFontRaw, nameFontRaw, ctaFontRaw] = await Promise.all([
    fontAttr("ExtraBold"),
    fontAttr("SemiBold"),
    fontAttr("Bold"),
  ]);
  const titleFontAttr = titleFontRaw ?? "";
  const nameFontAttr = nameFontRaw ?? "";
  const ctaFontAttr = ctaFontRaw ?? "";

  // ── Title card ────────────────────────────────────────────────────────────
  const escapedTitle = escapeDrawtext(params.title);
  const titleX = `(w-text_w)/2`;
  const titleY = videoType === "reel_9x16"
    ? `${Math.round(height * 0.12)}`
    : `(h-text_h)/2-40`;

  filterParts.push(
    `[bgdark]drawtext=` +
    `text='${escapedTitle}':` +
    `${titleFontAttr}` +
    `fontsize=${cfg.titleFontSize}:fontcolor=white:` +
    `borderw=2:bordercolor=black:` +
    `x=${titleX}:y=${titleY}:` +
    `enable='between(t\\,0\\,4)'` +
    `[titled]`
  );

  // ── ASS Captions ─────────────────────────────────────────────────────────
  if (withCaptions) {
    const assFFmpegPath = toFFmpegPath(assPath);
    filterParts.push(`[titled]ass='${assFFmpegPath}'[captioned]`);
  } else {
    // No captions — pass through unchanged
    filterParts.push(`[titled]copy[captioned]`);
  }

  // ── Logo overlay ─────────────────────────────────────────────────────────
  let currentLabel = "captioned";
  if (logoPath) {
    filterParts.push(`[${logoInputIdx}:v]scale=${cfg.logoSize}:-1[logosc]`);
    // currentLabel, not [captioned]: the photo-reel renderer had this exact
    // line hardcoded, and adding a stage in front of it silently produced a
    // filtergraph that used one label twice. Nothing sits in front of it here
    // yet — this is so nothing breaks when something does.
    filterParts.push(`[${currentLabel}][logosc]overlay=x=20:y=20:format=auto[logoed]`);
    currentLabel = "logoed";
  }

  // ── Avatar PiP ───────────────────────────────────────────────────────────
  const aSize = cfg.avatarSize;
  const aRadius = Math.floor(aSize / 2);
  const avX = cfg.avatarX - aRadius;
  const avY = cfg.avatarY - aRadius;
  const borderSize = aSize + 8;
  const borderX = cfg.avatarX - Math.floor(borderSize / 2);
  const borderY = cfg.avatarY - Math.floor(borderSize / 2);

  if (avatarVideoPath && avatarInputIdx >= 0) {
    // Talking avatar: scale, circular mask, loop, overlay
    filterParts.push(
      `[${avatarInputIdx}:v]scale=${aSize}:${aSize},format=rgba,` +
      `geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':` +
      `a='if(lte(pow(X-${aRadius}\\,2)+pow(Y-${aRadius}\\,2)\\,pow(${aRadius - 2}\\,2))\\,255\\,0)',` +
      `loop=loop=-1:size=${Math.ceil(audioDuration * 25)}:start=0,` +
      `trim=duration=${audioDuration},setpts=PTS-STARTPTS` +
      `[avatarcirc]`
    );
    filterParts.push(
      `[${currentLabel}]drawbox=x=${borderX}:y=${borderY}:w=${borderSize}:h=${borderSize}:color=white@1:t=fill[bordered]`
    );
    filterParts.push(`[bordered][avatarcirc]overlay=x=${avX}:y=${avY}:format=auto:shortest=1[avatared]`);
    currentLabel = "avatared";

  } else if (avatarImagePath && avatarInputIdx >= 0) {
    // Static photo: scale, circular mask, overlay
    filterParts.push(
      `[${avatarInputIdx}:v]scale=${aSize}:${aSize},format=rgba,` +
      `geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':` +
      `a='if(lte(pow(X-${aRadius}\\,2)+pow(Y-${aRadius}\\,2)\\,pow(${aRadius - 2}\\,2))\\,255\\,0)'` +
      `[avatarcirc]`
    );
    filterParts.push(
      `[${currentLabel}]drawbox=x=${borderX}:y=${borderY}:w=${borderSize}:h=${borderSize}:color=white@1:t=fill[bordered]`
    );
    filterParts.push(`[bordered][avatarcirc]overlay=x=${avX}:y=${avY}:format=auto[avatared]`);
    currentLabel = "avatared";
  }

  // ── Agent name badge ──────────────────────────────────────────────────────
  if (params.agentName && (avatarVideoPath || avatarImagePath)) {
    const escapedName = escapeDrawtext(params.agentName);
    filterParts.push(
      `[${currentLabel}]drawtext=` +
      `text='${escapedName}':` +
      `${nameFontAttr}fontsize=20:fontcolor=white:` +
      `borderw=1:bordercolor=black@0.6:` +
      `box=1:boxcolor=black@0.45:boxborderw=6:` +
      `x=${cfg.avatarX}-text_w/2:y=${cfg.nameY}` +
      `[named]`
    );
    currentLabel = "named";
  }

  // ── YouTube end card ──────────────────────────────────────────────────────
  if (videoType === "youtube_16x9") {
    const ctaStart = Math.max(0, audioDuration - 4);
    filterParts.push(
      `[${currentLabel}]drawtext=` +
      `text='Like & Subscribe for more!':` +
      `${ctaFontAttr}fontsize=36:fontcolor=#FACC15:` +
      `box=1:boxcolor=black@0.6:boxborderw=10:` +
      `x=(w-text_w)/2:y=${Math.round(height * 0.14)}:` +
      `enable='between(t\\,${ctaStart}\\,${audioDuration})'` +
      `[ytfinal]`
    );
    currentLabel = "ytfinal";
  }

  // ── Run FFmpeg ────────────────────────────────────────────────────────────
  const filterGraph = filterParts.join(";\n");
  console.log(`[ffmpeg-render] ${filterParts.length} filter stages, output: ${outputPath}`);

  return new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    for (const inp of inputs) cmd.input(inp);

    cmd
      .complexFilter(filterGraph)
      .outputOptions([
        `-map [${currentLabel}]`,
        `-map ${audioInputIdx}:a`,
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        `-t ${audioDuration}`,
        "-y",
      ])
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log(`[ffmpeg-render] cmd: ${cmdLine.slice(0, 300)}...`);
      })
      .on("progress", (p) => {
        if (p.percent) console.log(`[ffmpeg-render] ${Math.round(p.percent)}%`);
      })
      .on("error", (err, _stdout, stderr) => {
        console.error(`[ffmpeg-render] FAILED:`, err.message);
        console.error(`[ffmpeg-render] stderr:`, stderr?.slice(-1000));
        reject(new Error(`FFmpeg failed: ${err.message}\n${stderr?.slice(-500) ?? ""}`));
      })
      .on("end", () => {
        console.log(`[ffmpeg-render] Done`);
        resolve();
      })
      .run();
  });
}

// ─── Photo Slideshow ──────────────────────────────────────────────────────────

export interface SlideshowParams {
  title: string;
  audioBuffer: Buffer;
  photoUrls: string[];
  wordTimestamps: WordTimestamp[];
  logoUrl?: string;
  avatarUrl?: string;        // static profile headshot for PiP
  agentName?: string;
  captionColor?: string;
  captionHighlightColor?: string;
  musicUrl?: string | null;  // background music (looped, mixed under voiceover)
  musicVolume?: number;      // 0–1, default 0.15
  /**
   * A line of text per photo, shown while that photo is on screen.
   *
   * Aligned to photoUrls by index, and sparse — most reels caption some photos
   * and not others, so an empty entry means "no card on this one" rather than
   * an empty card.
   */
  photoCaptions?: (string | null | undefined)[];
  /**
   * A closing card over the last few seconds — the ask, once the pictures have
   * done their work. Omitted entirely when absent, rather than drawn empty.
   */
  endCard?: {
    headline?: string;
    address?: string;
    market?: string;
    phone?: string;
  } | null;
}

/**
 * Render a Ken Burns photo slideshow using FFmpeg.
 * Accepts listing photos, ElevenLabs audio, and word timestamps.
 * Returns the final MP4 as a Buffer. Zero HeyGen cost.
 */
export async function renderPhotoSlideshow(
  params: SlideshowParams,
  videoType: VideoType,
): Promise<Buffer> {
  const cfg = FORMAT_CONFIGS[videoType];
  const renderTmpDir = join(tmpdir(), `slideshow-${randomUUID()}`);
  await fs.mkdir(renderTmpDir, { recursive: true });

  console.log(`[ffmpeg-slideshow] Temp dir: ${renderTmpDir}`);

  try {
    // ── 1. Write audio buffer ────────────────────────────────────────────────
    const audioPath = join(renderTmpDir, "voiceover.mp3");
    await fs.writeFile(audioPath, params.audioBuffer);

    // ── 2. Download listing photos ───────────────────────────────────────────
    const photoPaths: string[] = [];
    for (let i = 0; i < params.photoUrls.length; i++) {
      const p = join(renderTmpDir, `photo${i}.jpg`);
      if (await downloadFile(params.photoUrls[i], p)) photoPaths.push(p);
    }
    if (photoPaths.length === 0) throw new Error("No listing photos could be downloaded");

    // ── 3. Download logo and avatar ──────────────────────────────────────────
    let logoPath: string | null = null;
    if (params.logoUrl) {
      const p = join(renderTmpDir, "logo.png");
      if (await downloadFile(params.logoUrl, p)) logoPath = p;
    }

    let avatarPath: string | null = null;
    if (params.avatarUrl) {
      const p = join(renderTmpDir, "avatar.jpg");
      if (await downloadFile(params.avatarUrl, p)) avatarPath = p;
    }

    // ── 4. Download background music (optional) ──────────────────────────────
    let musicPath: string | null = null;
    if (params.musicUrl) {
      const ext = params.musicUrl.split(".").pop()?.split("?")[0] || "mp3";
      const mp = join(renderTmpDir, `music.${ext}`);
      if (await downloadFile(params.musicUrl, mp)) musicPath = mp;
    }

    // ── 5. Probe audio duration ──────────────────────────────────────────────
    const audioDuration = await probeAudioDuration(audioPath);
    console.log(`[ffmpeg-slideshow] ${photoPaths.length} photos, audio: ${audioDuration.toFixed(1)}s, music: ${!!musicPath}`);

    // ── 6. Generate ASS captions ─────────────────────────────────────────────
    const assPath = join(renderTmpDir, "captions.ass");
    const assContent = generateASS(params.wordTimestamps, {
      width: cfg.width,
      height: cfg.height,
      fontSize: cfg.captionFontSize,
      fontColor: (params.captionColor || "#FFFFFF").replace("#", ""),
      highlightColor: (params.captionHighlightColor || "#FACC15").replace("#", ""),
      yPosition: Math.round(cfg.height * cfg.captionYPercent),
    });
    await fs.writeFile(assPath, assContent, "utf8");

    const outputPath = join(renderTmpDir, "output.mp4");

    // ── 7. Render (retry without captions if libass is missing) ─────────────
    try {
      await buildSlideshowAndRun(
        photoPaths, audioPath, assPath, logoPath, avatarPath, musicPath,
        outputPath, params, cfg, audioDuration, videoType, true,
      );
    } catch (renderErr) {
      const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
      if (msg.toLowerCase().includes("ass") || msg.toLowerCase().includes("libass") || msg.toLowerCase().includes("subtitle")) {
        console.warn("[ffmpeg-slideshow] ASS captions unavailable, retrying without...");
        await buildSlideshowAndRun(
          photoPaths, audioPath, assPath, logoPath, avatarPath, musicPath,
          outputPath, params, cfg, audioDuration, videoType, false,
        );
      } else {
        throw renderErr;
      }
    }

    // ── 7. Return output buffer ──────────────────────────────────────────────
    const result = await fs.readFile(outputPath);
    console.log(`[ffmpeg-slideshow] Output: ${(result.length / 1024 / 1024).toFixed(1)} MB`);
    return result;

  } finally {
    await fs.rm(renderTmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function buildSlideshowAndRun(
  photoPaths: string[],
  audioPath: string,
  assPath: string,
  logoPath: string | null,
  avatarPath: string | null,
  musicPath: string | null,
  outputPath: string,
  params: SlideshowParams,
  cfg: FormatConfig,
  audioDuration: number,
  videoType: VideoType,
  withCaptions: boolean,
): Promise<void> {
  const { width, height } = cfg;
  const N = photoPaths.length;

  /**
   * The dissolve is a fraction of the hold, not a fixed half-second.
   *
   * Twelve photos in twelve seconds gives each one a second on screen, and a
   * half-second dissolve would then be half of every photo's life spent
   * half-transparent — the reel reads as permanently mid-transition. A quarter
   * of the hold keeps the same feel whether a photo holds for five seconds or
   * for one, and the half-second ceiling stops a long hold drifting into a
   * languid dissolve nobody asked for.
   */
  const roughSeg = audioDuration / Math.max(1, N);
  const FADE_DUR = Math.max(0.12, Math.min(0.5, roughSeg * 0.25));
  // Per-photo duration accounting for crossfade overlap
  const segDur = N > 1 ? (audioDuration + (N - 1) * FADE_DUR) / N : audioDuration;
  const frames = Math.ceil(segDur * 30);

  const filterParts: string[] = [];

  // ── Fonts, staged first ───────────────────────────────────────────────────
  // Copied into the render's temp directory rather than referenced where they
  // live — see stageFont. Every other input to this graph is already a file in
  // that directory; the fonts were the one exception and the one thing FFmpeg
  // could not open. Done up here because the caption cards below need to know
  // whether there is a font before deciding to exist.
  const stageDir = dirname(outputPath);
  const [titleFontAttr, nameFontAttr] = await Promise.all([
    stageFont("ExtraBold", stageDir),
    stageFont("SemiBold", stageDir),
  ]);

  // ── Input index bookkeeping ───────────────────────────────────────────────
  // Inputs: 0..N-1 = photos, N = audio, then optional logo, avatar, music, and
  // last the generated black ground the dissolves are built on. Declared up
  // here because the dissolve chain below needs the ground's index, and the
  // order these are added to the command has to match this exactly.
  const audioInputIdx = N;
  let nextInputIdx = N + 1;
  const logoInputIdx = logoPath ? nextInputIdx++ : -1;
  const avatarInputIdx = avatarPath ? nextInputIdx++ : -1;
  const musicInputIdx = musicPath ? nextInputIdx++ : -1;
  const bgInputIdx = nextInputIdx++;

  /**
   * Per-photo caption cards.
   *
   * Each photo can carry a line that shows only while it is on screen — the
   * "AFTER · Kitchen" card that turns a slideshow into a before-and-after.
   * Timed off the same segment arithmetic the dissolves use, so a card appears
   * with its photo and leaves with it rather than drifting a half-second out.
   */
  const captions = (params.photoCaptions ?? []).slice(0, N).map((c) => (c ?? "").trim());
  const captionWindows = captions
    .map((text, i) => {
      if (!text) return null;
      // Held from the moment this photo starts arriving to the moment the next
      // one has finished covering it, matching the overlay windows exactly.
      const from = i * (segDur - FADE_DUR);
      const to = i === N - 1 ? audioDuration : (i + 1) * (segDur - FADE_DUR) + FADE_DUR;
      return { text, from, to };
    })
    .filter((c): c is { text: string; from: number; to: number } => c !== null);

  const panelW = Math.round(width * 0.86);
  const panelH = Math.round(Math.min(width, height) * 0.115);
  const panelX = Math.round((width - panelW) / 2);
  const panelY = Math.round(height * 0.055);
  const capFontSize = Math.round(Math.min(width, height) * 0.05);

  // One panel for all of them, shown across the union of their windows —
  // FFmpeg's expression parser treats a sum of between() as "any of these".
  const panelPath = join(dirname(outputPath), "caption-panel.png");
  const hasPanel = captionWindows.length > 0 && titleFontAttr
    ? await captionPanel(panelW, panelH, panelPath)
    : false;
  const panelInputIdx = hasPanel ? nextInputIdx++ : -1;

  // ── Ken Burns (zoompan) per photo ────────────────────────────────────────
  // Scale each photo to 2× target first so zoompan has room to crop
  for (let i = 0; i < N; i++) {
    const zoomExpr = i % 2 === 0
      ? `'min(zoom+0.0004,1.15)'`                                       // zoom in
      : `'if(lte(zoom,1.0),1.15,max(1.0,zoom-0.0004))'`;               // zoom out
    filterParts.push(
      `[${i}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,` +
      `crop=${width * 2}:${height * 2},` +
      `zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${width}x${height}:fps=30[photo${i}]`,
    );
  }

  /**
   * ── Dissolves, without xfade ───────────────────────────────────────────
   *
   * This is the reason a finished renderer has never had a caller: the
   * bundled FFmpeg is 4.2, xfade arrived in 4.3, and a probe against
   * production confirms it — `No such filter: 'xfade'`, and the filter list
   * comes back with 340 entries and none of them that one. Any multi-photo
   * render would have failed on the first transition.
   *
   * So the dissolve is built the way everyone built them before 4.3: give
   * each photo an alpha channel, fade that alpha up, shift it to start where
   * the one before it is ending, and overlay them.
   *
   * The base is a black canvas spanning the whole reel rather than the first
   * photo. Overlay takes its output length from its base, so chaining onto
   * photo 0 would end the video when photo 0 ended — the alternative is
   * making photo 0 run the full duration, which means its Ken Burns move
   * renders for thirty seconds to be visible for five. A solid colour costs
   * almost nothing to generate and every photo then renders only its own
   * segment.
   */
  const dissolveBase = `[${bgInputIdx}:v]`;
  let overlayChain = dissolveBase;
  for (let i = 0; i < N; i++) {
    const start = i * (segDur - FADE_DUR);
    // Photo 0 is already on the black ground, so it needs no fade — the reel
    // opens on the picture rather than dissolving up out of nothing.
    const alphaFade = i === 0 ? "" : `fade=t=in:st=0:d=${FADE_DUR}:alpha=1,`;
    filterParts.push(
      `[photo${i}]format=yuva420p,${alphaFade}setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[ph${i}]`,
    );

    /**
     * Each layer is switched off once the next one has finished covering it.
     *
     * Without this the graph is quadratic and it shows: twelve photos over a
     * minute took more than ten minutes to render locally, because every one
     * of 1,800 output frames was dragged through all twelve overlay stages
     * whether or not anything was visible in them. FFmpeg's timeline support
     * makes a disabled filter pass its input straight through, so bounding
     * each overlay to its own span turns that back into linear work — every
     * frame now passes through the one or two layers actually on screen.
     *
     * The window runs to the end of the NEXT photo's dissolve, not to the end
     * of this photo's slot: until that dissolve completes, this photo is still
     * partly what you are looking at.
     */
    const end = i === N - 1
      ? audioDuration
      : (i + 1) * (segDur - FADE_DUR) + FADE_DUR;
    const window = `:enable=between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;

    const outLabel = i === N - 1 ? "slideshow" : `ov${i}`;
    filterParts.push(
      `${overlayChain}[ph${i}]overlay=format=auto:eof_action=repeat${window}[${outLabel}]`,
    );
    overlayChain = `[${outLabel}]`;
  }
  // Back to a plain plane before anything is drawn on top: the overlays leave
  // an alpha channel behind, and drawbox/drawtext on yuva reads differently.
  filterParts.push(`[slideshow]format=yuv420p[slideshowflat]`);
  const slideshowLabel = "slideshowflat";

  /**
   * ── Dark wash, only under the title ────────────────────────────────────
   *
   * This used to cover the whole reel for its whole length: 40% black over
   * every frame, which is right for stock footage carrying captions and
   * ruinous for somebody's listing photos. A grey wash over a white kitchen
   * reads as a black-and-white video, and the photos are the entire point of
   * this format.
   *
   * The title still needs something to sit on, so the wash is kept and
   * confined to the four seconds the title is up. Everything after that is the
   * photograph as it was taken.
   */
  filterParts.push(
    `[${slideshowLabel}]drawbox=x=0:y=0:w=${width}:h=${height}:color=black@0.35:t=fill:` +
    `enable=between(t\\,0\\,4)[bgdark]`,
  );

  // ── Title card (first 4 seconds) ─────────────────────────────────────────
  // Skipped outright without a font, rather than drawn in one the container
  // does not have. A reel with no title over the opening shot is a small loss;
  // a filter graph that will not initialise is the whole video.
  if (titleFontAttr && params.title.trim()) {
    const escapedTitle = escapeDrawtext(params.title);
    const titleX = `(w-text_w)/2`;
    const titleY = videoType === "reel_9x16"
      ? `${Math.round(height * 0.12)}`
      : `(h-text_h)/2-40`;
    filterParts.push(
      `[bgdark]drawtext=text='${escapedTitle}':` +
      `${titleFontAttr}fontsize=${cfg.titleFontSize}:fontcolor=white:` +
      `borderw=2:bordercolor=black:x=${titleX}:y=${titleY}:` +
      `enable='between(t\\,0\\,4)'[titled]`,
    );
  } else {
    if (!titleFontAttr) console.warn("[ffmpeg-slideshow] No title font available — rendering without a title card.");
    filterParts.push(`[bgdark]copy[titled]`);
  }

  /**
   * ── Per-photo caption cards ────────────────────────────────────────────
   *
   * The panel first, then a line of text per captioned photo. Each is switched
   * on for its own photo's window, so a card belongs to a picture rather than
   * to a moment in the reel — reorder the photos and the words follow them.
   *
   * The panel is a single overlay across the union of those windows. FFmpeg's
   * expression parser reads a sum of between() as "any of these", which keeps
   * twelve possible cards down to one overlay rather than twelve.
   */
  let cardLabel = "titled";
  if (hasPanel && panelInputIdx >= 0) {
    const anyWindow = captionWindows
      .map((c) => `between(t\\,${c.from.toFixed(3)}\\,${c.to.toFixed(3)})`)
      .join("+");
    filterParts.push(
      `[titled][${panelInputIdx}:v]overlay=x=${panelX}:y=${panelY}:format=auto:` +
      `enable='${anyWindow}'[panelled]`,
    );
    cardLabel = "panelled";

    captionWindows.forEach((c, i) => {
      const out = i === captionWindows.length - 1 ? "carded" : `card${i}`;
      filterParts.push(
        `[${cardLabel}]drawtext=text='${escapeDrawtext(c.text)}':` +
        `${titleFontAttr}fontsize=${capFontSize}:fontcolor=white:` +
        `x=(w-text_w)/2:y=${panelY}+${Math.round(panelH / 2)}-text_h/2:` +
        `enable='between(t\\,${c.from.toFixed(3)}\\,${c.to.toFixed(3)})'[${out}]`,
      );
      cardLabel = out;
    });
  }

  // ── Captions ─────────────────────────────────────────────────────────────
  if (withCaptions && params.wordTimestamps.length > 0) {
    filterParts.push(`[${cardLabel}]ass='${toFFmpegPath(assPath)}'[captioned]`);
  } else {
    filterParts.push(`[${cardLabel}]copy[captioned]`);
  }

  /**
   * ── Closing card ───────────────────────────────────────────────────────
   *
   * The ask, held over the last few seconds once the photographs have done
   * their work. It dims the final shot rather than cutting to a colour: the
   * picture is what earned the attention, and throwing it away to show a phone
   * number is how a reel loses people in its last second.
   *
   * Drawn after the burned-in captions so the wash covers those too — a
   * caption still legible under the closing card reads as two videos at once —
   * and before the logo and badge, which stay on top where the branding
   * belongs.
   */
  let currentLabel = "captioned";
  const end = params.endCard;
  const endLines = end
    ? [end.headline, end.address, end.market, end.phone].filter((l): l is string => !!l?.trim())
    : [];
  if (endLines.length > 0 && titleFontAttr) {
    // Long enough to read a phone number aloud, short enough not to be the
    // video — and never more than a third of a very short reel.
    const ctaDur = Math.min(4, Math.max(2.5, audioDuration * 0.3));
    const from = Math.max(0, audioDuration - ctaDur).toFixed(3);
    const to = audioDuration.toFixed(3);
    const when = `enable='between(t\\,${from}\\,${to})'`;

    filterParts.push(
      `[${currentLabel}]drawbox=x=0:y=0:w=${width}:h=${height}:color=black@0.68:t=fill:` +
      `enable=between(t\\,${from}\\,${to})[ctabg]`,
    );

    // Stacked from a third of the way down, with the headline given twice the
    // room of the lines under it.
    const S = Math.min(width, height);
    const headSize = Math.round(S * 0.062);
    const bodySize = Math.round(S * 0.042);
    let y = Math.round(height * 0.34);
    let label = "ctabg";

    endLines.forEach((line, i) => {
      const isHead = i === 0 && !!end?.headline?.trim();
      const size = isHead ? headSize : bodySize;
      const out = i === endLines.length - 1 ? "ctad" : `cta${i}`;
      filterParts.push(
        `[${label}]drawtext=text='${escapeDrawtext(line)}':` +
        `${isHead ? titleFontAttr : nameFontAttr ?? titleFontAttr}fontsize=${size}:` +
        `fontcolor=white:borderw=2:bordercolor=black@0.5:` +
        `x=(w-text_w)/2:y=${y}:${when}[${out}]`,
      );
      label = out;
      y += Math.round(size * (isHead ? 1.9 : 1.55));
    });
    currentLabel = label;
  }
  if (logoPath && logoInputIdx >= 0) {
    /**
     * Reads currentLabel, like every other stage in this chain.
     *
     * It used to hardcode [captioned], which was correct until the closing
     * card was added in front of it. After that, a reel with BOTH a logo and
     * an end card built a filtergraph that used [captioned] twice — once by
     * the end card's drawbox, once here — and left the end card's own output
     * connected to nothing. FFmpeg refuses both, so the render died with exit
     * code 1 and a wall of filtergraph in the error.
     *
     * It only ever failed on that combination, which is why it survived: a
     * reel with no logo, or with the closing card switched off, renders fine.
     */
    filterParts.push(`[${logoInputIdx}:v]scale=${cfg.logoSize}:-1[logosc]`);
    filterParts.push(`[${currentLabel}][logosc]overlay=x=20:y=20:format=auto[logoed]`);
    currentLabel = "logoed";
  }

  /**
   * ── Headshot badge, bottom left ────────────────────────────────────────
   *
   * Not cfg.avatarX/avatarY. Those put it at 540 across a 1080-wide reel —
   * dead centre — because they were laid out for the avatar video, where the
   * presenter IS the picture. On a photo reel the presenter is a credit, and a
   * two-hundred-pixel square of somebody's face in the middle of the frame
   * covers the kitchen the video is about.
   *
   * Sized and placed off the short edge so all three shapes agree, and low
   * enough to stay clear of the captions above it.
   */
  if (avatarPath && avatarInputIdx >= 0) {
    const S = Math.min(width, height);
    const aSize = Math.round(S * 0.11);
    const aRadius = Math.floor(aSize / 2);
    const margin = Math.round(S * 0.05);
    const avX = margin;
    const avY = height - margin - aSize;
    // The ring is drawn inside the same pass that crops the circle: a filled
    // white square behind it used to stand in for a border, and on a photo it
    // read as exactly that — a white square with a face in it.
    const ring = aRadius - Math.max(2, Math.round(aSize * 0.03));
    const dist = `pow(X-${aRadius}\\,2)+pow(Y-${aRadius}\\,2)`;
    const white = `if(gte(${dist}\\,pow(${ring}\\,2))\\,255\\,`;
    filterParts.push(
      `[${avatarInputIdx}:v]scale=${aSize}:${aSize},format=rgba,` +
      `geq=r='${white}r(X\\,Y))':g='${white}g(X\\,Y))':b='${white}b(X\\,Y))':` +
      `a='if(lte(${dist}\\,pow(${aRadius - 1}\\,2))\\,255\\,0)'` +
      `[avatarcirc]`,
    );
    filterParts.push(`[${currentLabel}][avatarcirc]overlay=x=${avX}:y=${avY}:format=auto[avatared]`);
    currentLabel = "avatared";

    // ── Agent name, beside the badge ────────────────────────────────────────
    // To the right of the circle rather than under it: under it would sit
    // below the frame edge now the badge is in the corner.
    if (params.agentName && nameFontAttr) {
      const escapedName = escapeDrawtext(params.agentName);
      filterParts.push(
        `[${currentLabel}]drawtext=text='${escapedName}':` +
        `${nameFontAttr}fontsize=${Math.round(S * 0.026)}:fontcolor=white:` +
        `borderw=1:bordercolor=black@0.6:` +
        `box=1:boxcolor=black@0.45:boxborderw=8:` +
        `x=${avX + aSize + Math.round(S * 0.015)}:y=${avY + aRadius}-text_h/2[named]`,
      );
      currentLabel = "named";
    }
  }

  // ── Background music mix ─────────────────────────────────────────────────
  const musicVol = (params.musicVolume ?? 0.15).toFixed(2);
  let audioMapFlag = `${audioInputIdx}:a`;
  if (musicPath && musicInputIdx >= 0) {
    filterParts.push(
      `[${audioInputIdx}:a]volume=1.0[voice]`,
      `[${musicInputIdx}:a]volume=${musicVol},aloop=loop=-1:size=2000000000,atrim=duration=${audioDuration}[musictrack]`,
      `[voice][musictrack]amix=inputs=2:duration=first:dropout_transition=2[mixaudio]`,
    );
    audioMapFlag = "[mixaudio]";
  }

  // ── Run FFmpeg ────────────────────────────────────────────────────────────
  const filterGraph = filterParts.join(";\n");
  console.log(`[ffmpeg-slideshow] ${filterParts.length} filter stages`);

  return new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();

    // Photo inputs — loop each still image for slightly longer than segDur
    for (const photoPath of photoPaths) {
      cmd.input(photoPath).inputOptions(["-loop", "1", "-t", `${Math.ceil(segDur) + 2}`]);
    }
    cmd.input(audioPath);
    if (logoPath) cmd.input(logoPath);
    if (avatarPath) cmd.input(avatarPath);
    if (musicPath) cmd.input(musicPath);
    // The ground the dissolves sit on. Added last so the indices above stay
    // put, and generated rather than loaded — a solid colour costs nothing.
    cmd
      .input(`color=c=black:s=${width}x${height}:d=${audioDuration.toFixed(3)}:r=30`)
      .inputFormat("lavfi");
    // Last of all, matching panelInputIdx above. A still image looped for the
    // whole reel, shown only where its enable expression says so.
    if (hasPanel) cmd.input(panelPath).inputOptions(["-loop", "1", "-t", `${Math.ceil(audioDuration) + 1}`]);

    cmd
      .complexFilter(filterGraph)
      .outputOptions([
        `-map [${currentLabel}]`,
        `-map ${audioMapFlag}`,
        "-c:v libx264",
        "-preset fast",
        "-crf 22",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        `-t ${audioDuration}`,
        "-y",
      ])
      .output(outputPath)
      .on("start", (cmdLine) => console.log(`[ffmpeg-slideshow] cmd: ${cmdLine.slice(0, 300)}...`))
      .on("progress", (p) => {
        if (p.percent) console.log(`[ffmpeg-slideshow] ${Math.round(p.percent)}%`);
      })
      .on("error", (err, _stdout, stderr) => {
        console.error("[ffmpeg-slideshow] FAILED:", err.message);
        console.error("[ffmpeg-slideshow] stderr:", stderr?.slice(-1000));
        reject(new Error(`FFmpeg slideshow failed: ${err.message}\n${stderr?.slice(-500) ?? ""}`));
      })
      .on("end", () => {
        console.log("[ffmpeg-slideshow] Done");
        resolve();
      })
      .run();
  });
}

/**
 * A silent MP3 of an exact length.
 *
 * The renderer takes the audio's duration as the video's duration, which is
 * right when someone is talking over the pictures and useless when they are
 * not: a music track is however long it is, and the reel is not. Silence of a
 * chosen length is how a music-only reel gets to be thirty seconds rather than
 * however long the bed happens to run.
 */
/**
 * The rounded panel a caption sits on.
 *
 * Shape only — no text in the SVG. Sharp renders text through the system's
 * font stack, which is the fontconfig dependency that has already cost this
 * feature an afternoon; a rectangle with rounded corners needs none of it, and
 * FFmpeg draws the words on top afterwards.
 *
 * One panel serves every caption. It is a fixed size rather than fitted to
 * each line, which is what makes that possible: measuring text to size a box
 * would mean predicting what FFmpeg is about to do, and a consistent card in
 * the same place every time reads better anyway.
 */
async function captionPanel(width: number, height: number, dest: string): Promise<boolean> {
  try {
    const sharp = (await import("sharp")).default;
    const r = Math.round(height * 0.22);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" ` +
      `fill="rgb(18,22,30)" fill-opacity="0.72"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(dest);
    return true;
  } catch (err) {
    // Captions fall back to FFmpeg's own square box below, which is the same
    // information in a plainer frame.
    console.warn(`[ffmpeg-render] Caption panel unavailable: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function generateSilentAudio(seconds: number): Promise<Buffer> {
  const dir = join(tmpdir(), `silence-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  const out = join(dir, "silence.mp3");
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input("anullsrc=r=44100:cl=stereo")
        .inputFormat("lavfi")
        .outputOptions([`-t ${seconds.toFixed(3)}`, "-c:a libmp3lame", "-b:a 64k", "-y"])
        .output(out)
        .on("error", (err) => reject(new Error(`Silent track failed: ${err.message}`)))
        .on("end", () => resolve())
        .run();
    });
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Generate a solid color video background (used when no stock clips). */
async function generateColorBackground(
  outputPath: string,
  width: number,
  height: number,
  duration: number,
  color: string,
): Promise<void> {
  const hexColor = color.replace("#", "");

  return new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x${hexColor}:s=${width}x${height}:d=${duration}:r=30`)
      .inputFormat("lavfi")
      .outputOptions([
        "-c:v libx264",
        "-preset ultrafast",
        "-crf 28",
        "-pix_fmt yuv420p",
        "-y",
      ])
      .output(outputPath)
      .on("error", (err, _stdout, stderr) => {
        console.error(`[ffmpeg-render] Color bg error:`, stderr?.slice(-300));
        reject(new Error(`Color bg failed: ${err.message}`));
      })
      .on("end", () => resolve())
      .run();
  });
}
