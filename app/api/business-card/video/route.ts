import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCard } from "@/lib/card/card";
import { makeVideoCard } from "@/lib/card/video-card";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/business-card/video — makes the video card from the card's video
 * (2026-10-30): name strip, end card with a QR code to the card page. FFmpeg
 * only, so nothing is used from the plan. Replaces the last one.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const card = await loadCard(admin, user.id);
  if (!card.video) return NextResponse.json({ error: "Make your Agent Intro first, or pick a video for your card.", code: "no_video" }, { status: 400 });
  if (!card.profile.full_name) return NextResponse.json({ error: "Add your name in Settings first." }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await makeVideoCard(card, card.video.url);
  } catch (err) {
    console.error("[business-card/video]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't make your video card. Try again." }, { status: 502 });
  }
  const path = `${user.id}/business-card-${Date.now()}.mp4`;
  const { error } = await admin.storage.from("videos").upload(path, buf, { contentType: "video/mp4", upsert: false });
  if (error) return NextResponse.json({ error: "Couldn't save your video card. Try again." }, { status: 500 });
  const url = admin.storage.from("videos").getPublicUrl(path).data.publicUrl;

  // The previous one goes, so only the newest is kept.
  const old = card.videoCardUrl?.split("/storage/v1/object/public/videos/")[1]?.split("?")[0];
  if (old && old !== path) await admin.storage.from("videos").remove([decodeURIComponent(old)]).catch(() => {});

  const madeAt = new Date().toISOString();
  await admin.from("business_cards").update({ video_card_url: url, video_card_made_at: madeAt }).eq("user_id", user.id);
  return NextResponse.json({ url, madeAt });
}
