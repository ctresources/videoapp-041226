/**
 * Move an MP4's index to the front so iPhones can play it.
 *
 * An MP4 carries its table of contents in a `moov` atom — where every frame
 * lives, what the codecs are, how long it runs — and the frames themselves in
 * `mdat`. Nothing in the format says which comes first, and encoders that
 * write `mdat` as they go can only append `moov` once they know the totals, so
 * plenty of files end up with the index behind several megabytes of video.
 *
 * Desktop browsers hide this by downloading the whole file before playing.
 * iOS will not: Safari fetches the front, finds no index, and playback simply
 * never starts. The frame you see is real, the play button does nothing, and
 * seeking forward fixes it — which is what makes the bug so confusing to
 * report. Every HeyGen render we stored had this layout, so no video in the
 * app would start on an iPhone.
 *
 * Remuxing costs about a second on a 6 MB file: `-c copy` moves the existing
 * streams without touching a pixel, so there is no re-encode and no quality
 * loss. The file grows by a handful of bytes.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * True when `mdat` precedes `moov` — the layout iOS refuses to start.
 *
 * Walks only the top-level atoms, which is a handful of 8-byte headers rather
 * than a parse of the file. A truncated or non-MP4 buffer falls out of the
 * loop and reports false: if this cannot make sense of the bytes, remuxing
 * them is not the answer either.
 */
export function needsFaststart(buf: Buffer): boolean {
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    if (type === "moov") return false;
    if (type === "mdat") return true;
    // A size of 0 means "to end of file" and 1 means the real size sits in the
    // following 8 bytes; neither can be stepped over with this arithmetic.
    if (size < 8) return false;
    offset += size;
  }
  return false;
}

/**
 * Returns the same video with its index moved to the front.
 *
 * Never throws and never returns nothing. A video that fails to remux is
 * returned exactly as it came in, on the same reasoning as the rest of the
 * post-processing chain: a render that plays only on desktop still beats a
 * render nobody gets at all.
 */
export async function ensureFaststart(buf: Buffer, label: string): Promise<Buffer> {
  if (!needsFaststart(buf)) return buf;

  const dir = join(tmpdir(), `faststart-${randomUUID()}`);
  const inPath = join(dir, "in.mp4");
  const outPath = join(dir, "out.mp4");

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(inPath, buf);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inPath)
        // Copy both streams untouched; only the container is rewritten.
        .outputOptions(["-c", "copy", "-movflags", "+faststart"])
        .on("error", reject)
        .on("end", () => resolve())
        .save(outPath);
    });

    const out = await fs.readFile(outPath);
    // A remux that produced something implausibly small means ffmpeg wrote a
    // header and gave up. Trust the original over a truncated result.
    if (out.length < buf.length * 0.9) {
      console.warn(`[faststart] ${label}: output shrank ${buf.length}→${out.length}, keeping original`);
      return buf;
    }
    console.log(`[faststart] ${label}: index moved to front (${buf.length}→${out.length} bytes)`);
    return out;
  } catch (err) {
    console.warn(`[faststart] ${label}: skipped —`, err instanceof Error ? err.message : err);
    return buf;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
