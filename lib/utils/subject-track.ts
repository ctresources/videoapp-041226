import { spawn } from "child_process";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

/**
 * Where the speaker is, left to right, through a Digital Twin video
 * (2026-10-24, the owner's ask: "not in circle most of the time").
 *
 * A twin is real footage of a person who moves; Avatar in circle cut the same
 * middle square out of it for the whole video, so whenever she leaned or
 * stepped aside, half her face left the circle. This finds her against the
 * plain backdrop a twin is recorded on, twice a second, so the circle's crop
 * can follow her.
 *
 * Cheap on purpose: frames are read at 64×36. A column is "person" when
 * enough of it differs from the backdrop colour, taken from the top corners,
 * which a head-and-shoulders recording leaves clear.
 */

const W = 64;
const H = 36;
const SAMPLE_FPS = 2;

/** The speaker's centre (0–1 across the frame) once a second, smoothed; null if it can't tell. */
export async function trackSubjectX(videoPath: string): Promise<number[] | null> {
  const raw = await new Promise<Buffer | null>((resolve) => {
    const chunks: Buffer[] = [];
    const p = spawn(ffmpegPath.path, [
      "-v", "error", "-i", videoPath,
      "-vf", `fps=${SAMPLE_FPS},scale=${W}:${H}`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]);
    p.stdout.on("data", (c: Buffer) => chunks.push(c));
    p.on("error", () => resolve(null));
    p.on("close", (code) => resolve(code === 0 ? Buffer.concat(chunks) : null));
  });
  if (!raw) return null;
  const frameBytes = W * H * 3;
  const frames = Math.floor(raw.length / frameBytes);
  if (frames < 2) return null;

  const centres: (number | null)[] = [];
  for (let f = 0; f < frames; f++) {
    const o = f * frameBytes;
    const px = (x: number, y: number) => o + (y * W + x) * 3;
    // The backdrop: the top-left and top-right corners.
    let r = 0, g = 0, b = 0, k = 0;
    for (let y = 0; y < 4; y++) for (const x of [0, 1, 2, 3, W - 4, W - 3, W - 2, W - 1]) {
      const i = px(x, y); r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; k++;
    }
    r /= k; g /= k; b /= k;
    let sum = 0, weight = 0;
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let y = 0; y < H; y++) {
        const i = px(x, y);
        if (Math.abs(raw[i] - r) + Math.abs(raw[i + 1] - g) + Math.abs(raw[i + 2] - b) > 60) n++;
      }
      if (n >= H * 0.25) { sum += (x + 0.5) * n; weight += n; }
    }
    centres.push(weight > 0 ? sum / weight / W : null);
  }

  // Gaps take the last known place; none known at all means it can't tell.
  const known = centres.filter((c): c is number => c !== null);
  if (known.length < frames * 0.5) return null;
  let last = known[0];
  const filled = centres.map((c) => (c === null ? last : (last = c)));

  // Smoothed over about three seconds, so the circle glides rather than jitters.
  const half = 3;
  const smooth = filled.map((_, i) => {
    const from = Math.max(0, i - half), to = Math.min(filled.length - 1, i + half);
    let s = 0;
    for (let j = from; j <= to; j++) s += filled[j];
    return s / (to - from + 1);
  });

  // Once a second.
  const out: number[] = [];
  for (let i = 0; i < smooth.length; i += SAMPLE_FPS) out.push(smooth[i]);
  return out;
}

/**
 * The ffmpeg crop "x" for a square of `size` cut from a frame `width` wide,
 * following `centres` (once a second), moving in straight lines between them.
 * One flat sum of per-second pieces, which every ffmpeg evaluates per frame.
 */
export function followCropX(centres: number[], width: number, size: number): string {
  const max = Math.max(0, width - size);
  const at = centres.map((c) => Math.round(Math.min(max, Math.max(0, c * width - size / 2))));
  if (at.length === 1) return String(at[0]);
  const parts: string[] = [];
  for (let i = 0; i < at.length - 1; i++) {
    const a = at[i], d = at[i + 1] - at[i];
    parts.push(`gte(t\\,${i})*lt(t\\,${i + 1})*(${a}${d ? `+${d}*(t-${i})` : ""})`);
  }
  parts.push(`gte(t\\,${at.length - 1})*${at[at.length - 1]}`);
  return parts.join("+");
}
