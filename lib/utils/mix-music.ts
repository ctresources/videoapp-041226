/**
 * Mix a background music track under a finished video's voiceover.
 *
 * HeyGen's Video Agent rejects audio file attachments, so the user's chosen
 * music cannot be part of the render itself — instead the webhook mixes it in
 * here (video stream copied, audio re-encoded) right before the video is
 * stored to Supabase.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * Returns a new MP4 buffer with the music mixed low under the voiceover, or
 * null on any failure — callers must fall back to the original buffer so a
 * music problem can never lose a finished render.
 */
export async function mixBackgroundMusic(
  videoBuffer: Buffer,
  musicUrl: string,
): Promise<Buffer | null> {
  const dir = join(tmpdir(), `mix-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const videoPath = join(dir, "in.mp4");
    const musicPath = join(dir, "music.audio");
    const outPath = join(dir, "out.mp4");

    await fs.writeFile(videoPath, videoBuffer);

    const res = await fetch(musicUrl);
    if (!res.ok) throw new Error(`Music download failed: ${res.status}`);
    await fs.writeFile(musicPath, Buffer.from(await res.arrayBuffer()));

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(musicPath)
        // Loop the track so it covers videos longer than the music.
        .inputOptions("-stream_loop", "-1")
        // amix halves each input, so pre-set music low and boost the sum back:
        // voiceover ≈ original level, music ≈ 16% under it. The limiter guards
        // the boost against clipping. duration=first ends with the voiceover.
        .complexFilter([
          "[1:a]volume=0.16[m]",
          "[0:a][m]amix=inputs=2:duration=first:dropout_transition=3[mix]",
          "[mix]volume=2.0,alimiter=limit=0.95[a]",
        ])
        .outputOptions([
          "-map", "0:v",
          "-map", "[a]",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outPath);
    });

    const mixed = await fs.readFile(outPath);
    console.log(`[mix-music] Mixed ${(musicUrl.split("?")[0] || "").slice(-40)} into video (${(mixed.length / 1024 / 1024).toFixed(1)} MB)`);
    return mixed;
  } catch (err) {
    console.error("[mix-music] Failed, storing original audio:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
