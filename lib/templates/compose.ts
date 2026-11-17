import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";
import type { Circle, Shape } from "@/lib/templates/designs";
import { SIZE } from "@/lib/templates/designs";
import { ffmpegFitFilter, fitImageBuffer } from "@/lib/utils/fit-frame";

const run = promisify(execFile);

/** One piece of the background: a photo, or a moving clip made from one (with its size). */
export interface TemplateMedia { file: string; clip?: { w: number; h: number } }

/** How long each photo is on screen (3 to 7 seconds), and so how long a moving clip needs to be. */
export function photoTiming(total: number, count: number): { per: number; clipSeconds: number } {
  const per = Math.min(7, Math.max(3, total / Math.max(1, count)));
  return { per, clipSeconds: per + 0.8 };
}

/**
 * Puts a template video together (2026-11-02): the photos (or the intro
 * background) filling the frame, the agent talking in their circle, then the
 * words on top. Made in two steps so the words can be changed later for free:
 * "clean" (everything but the words) is kept, and the words are laid over it.
 */
const ff = (cwd: string, args: string[]) => run(ffmpegPath.path, ["-y", "-hide_banner", "-loglevel", "error", ...args], { cwd, maxBuffer: 16 * 1024 * 1024 });

/** The same video with its index up front, so phones start playing at once. Returns the new file. */
export async function faststart(workDir: string, input: string, output: string): Promise<string> {
  await ff(workDir, ["-i", input, "-c", "copy", "-movflags", "+faststart", output]);
  return path.join(workDir, output);
}

/** How long a video is, in seconds. */
export const secondsOf = async (file: string) => (await probe(file)).dur;

async function probe(file: string): Promise<{ w: number; h: number; dur: number }> {
  try { await run(ffmpegPath.path, ["-hide_banner", "-i", file]); } catch (e) {
    const s = String((e as { stderr?: string }).stderr ?? "");
    const d = s.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const v = s.match(/Video:.*?, (\d{2,5})x(\d{2,5})/);
    return { w: v ? +v[1] : 0, h: v ? +v[2] : 0, dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0 };
  }
  return { w: 0, h: 0, dur: 0 };
}

export async function composeClean(o: {
  workDir: string; shape: Shape; circle: Circle;
  /** HeyGen's render of the agent talking (the audio comes from here). */
  avatar: string;
  /** Local photo files, in order; empty when a still background is used instead. */
  photos: string[];
  /**
   * Moving photos (2026-11-16): the background as photos and clips, in order.
   * A clip plays in its photo's place, fitted by the same rule; when given,
   * it is used instead of `photos`.
   */
  media?: TemplateMedia[];
  /** Seconds each piece is on screen, instead of the usual 3 to 7 (town footage: each clip's length). */
  segment?: number;
  /** A still background (Agent Introduction). */
  still?: string | null;
  threads?: number;
}): Promise<string> {
  const { w: W, h: H } = SIZE[o.shape];
  const t = String(o.threads ?? 1);
  const a = await probe(o.avatar);
  const total = Math.max(3, a.dur);
  const media: TemplateMedia[] = o.media?.length ? o.media : o.photos.map((file) => ({ file }));

  // The background: each photo for an equal share of the video (3 to 7 seconds), repeated if needed.
  // Since 2026-11-03 (owner's ask): a photo of the other shape is shown whole over a blurred copy,
  // each one slowly zooms, and each fades into the next.
  let bg: string;
  if (media.length) {
    const per = o.segment && o.segment >= 2 ? o.segment : photoTiming(total, media.length).per;
    const count = Math.max(media.length, Math.ceil(total / per));
    // Photos fitted once each, a little bigger than the frame so the zoom stays sharp.
    const fitted: string[] = [];
    for (let i = 0; i < media.length; i++) {
      if (media[i].clip) { fitted.push(media[i].file); continue; }
      const buf = await fitImageBuffer(fs.readFileSync(media[i].file), Math.round(W * 1.5), Math.round(H * 1.5));
      const f = `fit${i}.jpg`;
      fs.writeFileSync(path.join(o.workDir, f), buf);
      fitted.push(f);
    }
    const FADE = 0.8, FPS = 25;
    const seq = Array.from({ length: count }, (_, i) => i % media.length);
    const inputs = seq.flatMap((m) => ["-i", fitted[m]]);
    const parts = seq.map((m, i) => {
      const start = i * per;
      const len = Math.max(0.5, Math.min(per + FADE, total - start + FADE));
      const fade = i === 0 ? "" : `,fade=t=in:st=0:d=${FADE}:alpha=1`;
      const clip = media[m].clip;
      if (clip) {
        // The clip fitted to the frame. Clips are asked for at least this long
        // (no tpad to hold a last frame: the server's ffmpeg is a 2018 build).
        return ffmpegFitFilter({
          input: `[${i}:v]`, output: `[p${i}]`, width: W, height: H, srcW: clip.w, srcH: clip.h, tag: `c${i}`,
          pre: `fps=${FPS}`,
          post: `trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS,setsar=1,format=yuva420p${fade},setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`,
        }).join(";");
      }
      const frames = Math.ceil(len * FPS);
      // Alternate zooming in and out, about 10% over the photo's time.
      const step = (0.1 / frames).toFixed(6);
      const z = i % 2 === 0 ? `min(1+${step}*on,1.1)` : `max(1.1-${step}*on,1)`;
      return `[${i}:v]zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1,format=yuva420p${fade},setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[p${i}]`;
    });
    let chain = `color=c=black:s=${W}x${H}:r=${FPS}:d=${total.toFixed(3)}[b0]`;
    seq.forEach((_, i) => { chain += `;[b${i}][p${i}]overlay=0:0:eof_action=pass[b${i + 1}]`; });
    const graph = `${parts.join(";")};${chain};[b${seq.length}]format=yuv420p[bg]`;
    await ff(o.workDir, ["-threads", t, ...inputs, "-filter_complex", graph, "-map", "[bg]", "-t", total.toFixed(3), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "bg.mp4"]);
    bg = "bg.mp4";
  } else {
    bg = o.still ?? "";
  }

  // The circle: a square from the talking video (the middle, or the top of a tall one), cut round.
  const d = Math.round(o.circle.d / 2) * 2;
  // The render's whole height (or width, if tall): twins and headshots are
  // already filmed head and shoulders, so zooming in more crowds the circle (2026-11-03).
  const side = Math.round(Math.min(a.w, a.h) / 2) * 2;
  const cx = Math.round((a.w - side) / 2);
  const cy = Math.round(Math.min(a.h - side, a.h > a.w ? a.h * 0.06 : 0));
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><rect width="${d}" height="${d}" fill="#000"/><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`)).grayscale().png().toBuffer();
  fs.writeFileSync(path.join(o.workDir, "mask.png"), mask);
  const x = Math.round(o.circle.cx - d / 2), y = Math.round(o.circle.cy - d / 2);
  const bgInput = media.length ? ["-i", bg] : ["-loop", "1", "-i", bg];
  await ff(o.workDir, [
    "-threads", t, "-i", o.avatar, ...bgInput, "-loop", "1", "-i", "mask.png",
    "-filter_complex",
    `[0:v]crop=${side}:${side}:${cx}:${cy},scale=${d}:${d},format=rgba[sq];[2:v]format=gray,scale=${d}:${d}[m];[sq][m]alphamerge[av];` +
    `[1:v]scale=${W}:${H},setsar=1,fps=25[b];[b][av]overlay=${x}:${y}:shortest=1,format=yuv420p[v]`,
    "-map", "[v]", "-map", "0:a?", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "clean.mp4",
  ]);
  return path.join(o.workDir, "clean.mp4");
}

/** The words over the clean video. Used for the first version and for every change of words. */
export async function addWords(o: {
  workDir: string; clean: string; words: Buffer; threads?: number; out?: string;
  /** The animated words (a see-through WebM from HyperFrames, 2026-11-03); the still words are used without it. */
  animated?: Buffer | null;
}): Promise<string> {
  const out = o.out ?? "final.mp4";
  if (o.animated) {
    fs.writeFileSync(path.join(o.workDir, "words.webm"), o.animated);
    // Only the libvpx decoder keeps the see-through layer.
    await ff(o.workDir, [
      "-threads", String(o.threads ?? 1), "-i", o.clean, "-c:v", "libvpx-vp9", "-i", "words.webm",
      "-filter_complex", "[1:v]format=rgba[w0];[w0][0:v]scale2ref[w][b];[b][w]overlay=0:0:eof_action=pass,format=yuv420p[v]",
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", "-movflags", "+faststart", out,
    ]);
    return path.join(o.workDir, out);
  }
  fs.writeFileSync(path.join(o.workDir, "words.png"), o.words);
  await ff(o.workDir, [
    "-threads", String(o.threads ?? 1), "-i", o.clean, "-loop", "1", "-i", "words.png",
    "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1,format=yuv420p[v]",
    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", "-movflags", "+faststart", out,
  ]);
  return path.join(o.workDir, out);
}
