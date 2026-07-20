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
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

const MAX_PHOTOS = 8;
const SECONDS_PER_PHOTO = 4;

/**
 * Returns a new MP4 buffer with the photos as background b-roll and the avatar
 * as a corner PiP, or null on any failure — callers must fall back to the
 * original avatar video so a compositing problem never loses a render.
 */
export async function compositePhotos(
  videoBuffer: Buffer,
  photoUrls: string[],
  width: number,
  height: number,
): Promise<Buffer | null> {
  const photos = photoUrls.filter(Boolean).slice(0, MAX_PHOTOS);
  if (photos.length === 0) return null;

  const dir = join(tmpdir(), `broll-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const videoPath = join(dir, "avatar.mp4");
    const slidePath = join(dir, "slideshow.mp4");
    const outPath = join(dir, "out.mp4");
    await fs.writeFile(videoPath, videoBuffer);

    // Download the photos.
    const photoPaths: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const res = await fetch(photos[i]);
      if (!res.ok) continue;
      const p = join(dir, `photo-${i}.img`);
      await fs.writeFile(p, Buffer.from(await res.arrayBuffer()));
      photoPaths.push(p);
    }
    if (photoPaths.length === 0) throw new Error("No photos could be downloaded");
    const n = photoPaths.length;

    // ── Pass 1: build a fixed-length slideshow (video only) ──────────────────
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      for (const p of photoPaths) {
        cmd.input(p).inputOptions(["-loop", "1", "-t", String(SECONDS_PER_PHOTO)]);
      }
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        parts.push(
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1,format=yuv420p,fps=25[p${i}]`,
        );
      }
      parts.push(`${photoPaths.map((_, i) => `[p${i}]`).join("")}concat=n=${n}:v=1:a=0[bg]`);
      cmd
        .complexFilter(parts, "bg")
        .outputOptions(["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(slidePath);
    });

    // ── Pass 2: loop the slideshow under the avatar PiP; avatar drives length ─
    const pipW = Math.round((width * 0.3) / 2) * 2;
    const margin = Math.round(width * 0.03);
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(slidePath)
        .inputOptions(["-stream_loop", "-1"]) // applies to slidePath (2nd input)
        .complexFilter([
          `[0:v]scale=${pipW}:-2,format=yuv420p[av]`,
          `[1:v][av]overlay=main_w-overlay_w-${margin}:main_h-overlay_h-${margin}:shortest=1[outv]`,
        ])
        .outputOptions([
          "-map", "[outv]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "192k",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outPath);
    });

    const out = await fs.readFile(outPath);
    console.log(`[composite-photos] Composited ${n} photo(s) into ${width}x${height} video (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
    return out;
  } catch (err) {
    console.error("[composite-photos] Failed, keeping plain avatar video:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
