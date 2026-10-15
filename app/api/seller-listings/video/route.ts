import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

ffmpeg.setFfmpegPath(ffmpegPath.path);

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The video update on a seller update (2026-10-15, the owner's mock).
 *
 *   POST   { listingId, updateOn, videoId }   puts a camera take on that update
 *   DELETE ?listingId=&updateOn=              takes it off again (the take stays in My Sparks)
 *
 * Email cannot play video, so the email shows a still from the take with a
 * play button drawn on, linked to the video. The still is made here once and
 * kept in the public assets bucket, where an email app can load it.
 */

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

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

/** A still from the take, 1104 wide, with a round play button in the middle. */
async function makePoster(videoUrl: string, seconds: number | null): Promise<Buffer | null> {
  const dest = join(tmpdir(), `seller-poster-${randomUUID()}.jpg`);
  try {
    // A second in, past the first frame's blink; nearer the start for a short take.
    const at = seconds && seconds < 4 ? 0.3 : 1;
    if (!(await grabFrame(videoUrl, at, dest)) && !(await grabFrame(videoUrl, 0, dest))) return null;
    const sharp = (await import("sharp")).default;
    const frame = sharp(await fs.readFile(dest)).rotate();
    const meta = await frame.metadata();
    const w = 1104;
    // Tall takes are shown as a 4:5 crop from the middle, so a phone video
    // does not fill the whole email.
    const h = meta.width && meta.height && meta.height > meta.width ? Math.round(w * 1.25) : Math.round(w * 9 / 16);
    const base = await frame.resize(w, h, { fit: "cover", position: "centre" }).toBuffer();
    const r = 64;
    const play = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#ffffff" fill-opacity="0.92"/>
      <path d="M ${w / 2 - r * 0.32} ${h / 2 - r * 0.45} L ${w / 2 + r * 0.5} ${h / 2} L ${w / 2 - r * 0.32} ${h / 2 + r * 0.45} Z" fill="#A3660F"/>
    </svg>`);
    return await sharp(base).composite([{ input: play }]).jpeg({ quality: 84 }).toBuffer();
  } catch (err) {
    console.error("[seller-video] poster failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.unlink(dest).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId, updateOn, videoId } = (await req.json().catch(() => ({}))) as {
    listingId?: string; updateOn?: string; videoId?: string;
  };
  if (!listingId || !isDate(updateOn) || !videoId) {
    return NextResponse.json({ error: "listingId, updateOn and videoId are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: listing }, { data: video }] = await Promise.all([
    admin.from("seller_listings").select("id").eq("id", listingId).eq("user_id", user.id).maybeSingle(),
    admin.from("generated_videos").select("id, video_url, duration_seconds").eq("id", videoId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const videoUrl = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(videoUrl)) {
    return NextResponse.json({ error: "That video isn't ready yet. Try again in a moment." }, { status: 409 });
  }
  const seconds = (video.duration_seconds as number | null) ?? null;

  let posterUrl: string | null = null;
  const poster = await makePoster(videoUrl, seconds);
  if (poster) {
    const path = `thumbnails/${user.id}/seller_video_${videoId}.jpg`;
    const { error } = await admin.storage.from("assets").upload(path, poster, { contentType: "image/jpeg", upsert: true });
    if (!error) posterUrl = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }

  // The update row normally exists already (its numbers are saved before the
  // camera opens); if not, this makes one with just the video.
  const { error } = await admin.from("seller_listing_updates").upsert({
    listing_id: listingId, user_id: user.id, update_on: updateOn,
    video_id: videoId, video_url: videoUrl, video_poster_url: posterUrl, video_seconds: seconds,
    updated_at: new Date().toISOString(),
  }, { onConflict: "listing_id,update_on" });
  if (error) {
    console.error("[seller-video] save failed:", error.message);
    return NextResponse.json({ error: "Couldn't add the video." }, { status: 500 });
  }
  return NextResponse.json({ video: { id: videoId, url: videoUrl, posterUrl, seconds } });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const listingId = params.get("listingId") ?? "";
  const updateOn = params.get("updateOn") ?? "";
  if (!listingId || !isDate(updateOn)) return NextResponse.json({ error: "listingId and updateOn are required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("seller_listing_updates")
    .update({ video_id: null, video_url: null, video_poster_url: null, video_seconds: null, updated_at: new Date().toISOString() })
    .eq("listing_id", listingId)
    .eq("user_id", user.id)
    .eq("update_on", updateOn);
  if (error) return NextResponse.json({ error: "Couldn't remove the video." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
