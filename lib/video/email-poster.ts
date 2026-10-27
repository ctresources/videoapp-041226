import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import type { SupabaseClient } from "@supabase/supabase-js";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * A still from a video with a round play button drawn on, for an email
 * (2026-10-15). No email app plays video inside the message, so the email
 * shows this picture linked to the video. Used by the seller video update and
 * by Email it in My Sparks. A route that calls this must have
 * @ffmpeg-installer named in next.config's outputFileTracingIncludes.
 */

function grabFrame(video: string, at: number, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg(video)
      .seekInput(Math.max(0, at))
      .outputOptions(["-frames:v", "1", "-q:v", "3"])
      .on("error", () => resolve(false))
      .on("end", () => resolve(true))
      .save(dest);
  });
}

/** 1104 wide; a tall take is cropped to 4:5 from the middle so it doesn't fill the email. */
export async function makeEmailPoster(videoUrl: string, seconds: number | null): Promise<Buffer | null> {
  const dest = join(tmpdir(), `email-poster-${randomUUID()}.jpg`);
  try {
    // A third of the way in (2026-10-18). At 1 second the still caught the
    // opening title card, with the video's own captions drawn across it, and
    // the email showed the two sets of words on top of each other.
    // Length unknown: 8 seconds in, past most title cards; a shorter video
    // falls back to its first frame below.
    const at = !seconds ? 8 : seconds >= 6 ? seconds / 3 : seconds < 4 ? 0.3 : 1;
    if (!(await grabFrame(videoUrl, at, dest)) && !(await grabFrame(videoUrl, 0, dest))) return null;
    const sharp = (await import("sharp")).default;
    const frame = sharp(await fs.readFile(dest)).rotate();
    const meta = await frame.metadata();
    const w = 1104;
    const h = meta.width && meta.height && meta.height > meta.width ? Math.round(w * 1.25) : Math.round(w * 9 / 16);
    const base = await frame.resize(w, h, { fit: "cover", position: "centre" }).toBuffer();
    const r = 64;
    const play = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#ffffff" fill-opacity="0.92"/>
      <path d="M ${w / 2 - r * 0.32} ${h / 2 - r * 0.45} L ${w / 2 + r * 0.5} ${h / 2} L ${w / 2 - r * 0.32} ${h / 2 + r * 0.45} Z" fill="#A3660F"/>
    </svg>`);
    return await sharp(base).composite([{ input: play }]).jpeg({ quality: 84 }).toBuffer();
  } catch (err) {
    console.error("[email-poster] failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.unlink(dest).catch(() => {});
  }
}

/** Makes the still and saves it in the public assets bucket; its address, or null. */
export async function saveEmailPoster(
  admin: SupabaseClient, userId: string, videoId: string, videoUrl: string, seconds: number | null, prefix = "video",
): Promise<string | null> {
  const poster = await makeEmailPoster(videoUrl, seconds);
  if (!poster) return null;
  const path = `thumbnails/${userId}/${prefix}_${videoId}.jpg`;
  const { error } = await admin.storage.from("assets").upload(path, poster, { contentType: "image/jpeg", upsert: true });
  if (error) return null;
  // Versioned: the same path is overwritten when a still is remade, and an
  // email app that has seen the old address would keep showing the old one.
  return `${admin.storage.from("assets").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

/**
 * The video's designed thumbnail with the play button drawn on (2026-10-27,
 * the owner: the email showed a still from the video, not her thumbnail).
 * Kept per thumbnail, so a new thumbnail gets a new picture. Null if the
 * thumbnail can't be read; the caller then uses a still from the video.
 */
export async function saveThumbnailPoster(
  admin: SupabaseClient, userId: string, videoId: string, thumbnailUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(thumbnailUrl);
    if (!res.ok) return null;
    const sharp = (await import("sharp")).default;
    const w = 1104;
    const h = Math.round(w * 9 / 16);
    const base = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(w, h, { fit: "cover", position: "centre" }).toBuffer();
    const r = 64;
    const play = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#ffffff" fill-opacity="0.92"/>
      <path d="M ${w / 2 - r * 0.32} ${h / 2 - r * 0.45} L ${w / 2 + r * 0.5} ${h / 2} L ${w / 2 - r * 0.32} ${h / 2 + r * 0.45} Z" fill="#A3660F"/>
    </svg>`);
    const out = await sharp(base).composite([{ input: play }]).jpeg({ quality: 84 }).toBuffer();
    const { createHash } = await import("crypto");
    const tag = createHash("sha1").update(thumbnailUrl).digest("hex").slice(0, 12);
    const path = `thumbnails/${userId}/thumbposter_${videoId}_${tag}.jpg`;
    const { error } = await admin.storage.from("assets").upload(path, out, { contentType: "image/jpeg", upsert: true });
    if (error) return null;
    return admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.error("[email-poster] thumbnail poster failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The picture an email shows for a video: its thumbnail if it has one, else a still. */
export async function emailPosterFor(
  admin: SupabaseClient, userId: string,
  video: { id: string; video_url: string; duration_seconds: number | null; email_poster_url: string | null },
  thumbnailUrl: string | null,
): Promise<string | null> {
  if (thumbnailUrl && /^https:\/\//.test(thumbnailUrl)) {
    const p = await saveThumbnailPoster(admin, userId, video.id, thumbnailUrl);
    if (p) return p;
  }
  if (video.email_poster_url) return video.email_poster_url;
  const p = await saveEmailPoster(admin, userId, video.id, video.video_url, video.duration_seconds, "video_email");
  if (p) await admin.from("generated_videos").update({ email_poster_url: p }).eq("id", video.id);
  return p;
}
