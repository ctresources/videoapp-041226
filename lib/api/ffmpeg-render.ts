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
import { join } from "path";
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

async function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 60);
    });
  });
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
async function fontAttr(weight: string): Promise<string> {
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
  if (!_fontExists[key]) return "";
  const p = join(process.cwd(), "public", "fonts", `Montserrat-${weight}.ttf`);
  return `fontfile='${toFFmpegPath(p)}':`;
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
  const [titleFontAttr, nameFontAttr, ctaFontAttr] = await Promise.all([
    fontAttr("ExtraBold"),
    fontAttr("SemiBold"),
    fontAttr("Bold"),
  ]);

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
    filterParts.push(`[captioned][logosc]overlay=x=20:y=20:format=auto[logoed]`);
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
