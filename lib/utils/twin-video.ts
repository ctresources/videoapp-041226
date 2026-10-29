import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * Whether a video is taller than wide, rotation included (2026-10-29). Null
 * when it can't be read. Used to record a Digital Twin's real shape, which
 * HeyGen does not report.
 */
export async function videoIsUpright(buffer: Buffer): Promise<boolean | null> {
  const dir = join(tmpdir(), `twin-probe-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const file = join(dir, "in");
    await fs.writeFile(file, buffer);
    const { probeVideoSize } = await import("@/lib/utils/fit-frame");
    const { width, height } = await probeVideoSize(file);
    if (!width || !height) return null;
    return height > width;
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * A Digital Twin's training video, made into something HeyGen takes.
 *
 * HeyGen trains twins from "mp4 or webm" only (its Video to Avatar guide). An
 * iPhone records MOV with HEVC video by default — checked on the owner's own
 * phone, 2026-10-20 — so the commonest recording our customers have was the
 * one format not on the list. Anything that is not already an H.264 MP4 or a
 * WebM is converted here, before it is sent: MP4, H.264, AAC, long edge at
 * most 1920 (HeyGen's recommended 1080p), turned the right way up.
 *
 * Returns the original untouched when it is already fine, and also when the
 * conversion fails: HeyGen may still take it, and its refusal is a clearer
 * failure than ours.
 */
export async function toTwinVideo(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  // WebM starts with the EBML magic number.
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { buffer, contentType: "video/webm" };

  // MP4 and MOV share a box layout; the ftyp brand tells them apart and the
  // sample entry names the codec. The moov box can sit at either end.
  const brand = buffer.toString("latin1", 8, 12);
  const isMov = brand === "qt  " || /quicktime/i.test(contentType);
  const h264 = buffer.includes("avc1");
  if (!isMov && h264) return { buffer, contentType: "video/mp4" };

  const dir = join(tmpdir(), `twin-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  const input = join(dir, "in");
  const output = join(dir, "out.mp4");
  try {
    await fs.writeFile(input, buffer);
    const started = Date.now();
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions([
          // Only the picture and the sound. An iPhone MOV also carries
          // metadata tracks ffmpeg has no decoder for, and without these maps
          // the whole conversion fails on them (tested on the owner's video).
          "-map 0:v:0",
          "-map 0:a:0?",
          // The first 5 minutes. HeyGen's best twin comes from about 2, and
          // converting runs at ~0.7x real time on one core (an iPhone HEVC
          // clip, measured), so this keeps the route inside its time limit.
          "-t 300",
          "-preset veryfast",
          "-crf 20",
          // Long edge at most 1920, either orientation; even sides for x264.
          "-vf", "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'",
          "-pix_fmt yuv420p",
          "-b:a 160k",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (e) => reject(e))
        .save(output);
    });
    const out = await fs.readFile(output);
    console.log(
      `[twin-video] Converted ${isMov ? "MOV" : brand.trim() || "video"}${h264 ? "" : " (not H.264)"} ` +
      `to MP4: ${(buffer.length / 1e6).toFixed(1)} MB → ${(out.length / 1e6).toFixed(1)} MB in ${Math.round((Date.now() - started) / 1000)}s`,
    );
    return { buffer: out, contentType: "video/mp4" };
  } catch (e) {
    console.warn("[twin-video] Conversion failed; sending the original:", e instanceof Error ? e.message : e);
    return { buffer, contentType };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
