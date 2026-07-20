import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadAndStoreVideo } from "@/lib/utils/store-video";
import { isExpiredHeygenUrl } from "@/lib/utils/video-url";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const HEYGEN_API = "https://api.heygen.com";

/**
 * POST /api/video/refresh-url
 * Permanently stores a video in Supabase Storage.
 * If the current video_url is still valid, uses it directly.
 * If it has expired, re-fetches a fresh URL from HeyGen first.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = await req.json();
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, render_job_id, video_url")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // If the stored URL is still valid, download it directly without hitting HeyGen API.
  if (video.video_url && !isExpiredHeygenUrl(video.video_url)) {
    const permanentUrl = await downloadAndStoreVideo(video.video_url, video.id);
    if (permanentUrl) return NextResponse.json({ videoUrl: permanentUrl });
    // Fall through to try HeyGen API if direct download failed.
  }

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "HeyGen not configured" }, { status: 500 });

  // render_job_id may be a video_id or a session_id — try video endpoint first,
  // then fall back to the agent session endpoint to get the real video_id.
  let freshUrl: string | null = null;
  let heygenVideoId = video.render_job_id;

  const videoRes = await fetch(`${HEYGEN_API}/v3/videos/${heygenVideoId}`, {
    headers: { "x-api-key": apiKey },
  });

  if (videoRes.ok) {
    const data = await videoRes.json();
    freshUrl = data.data?.video_url || null;
  } else {
    // render_job_id might be a session_id — resolve to video_id via agent endpoint
    const sessionRes = await fetch(`${HEYGEN_API}/v3/video-agents/${heygenVideoId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      heygenVideoId = sessionData.data?.video_id;
      if (heygenVideoId) {
        const v2 = await fetch(`${HEYGEN_API}/v3/videos/${heygenVideoId}`, {
          headers: { "x-api-key": apiKey },
        });
        if (v2.ok) {
          const d = await v2.json();
          freshUrl = d.data?.video_url || null;
        }
      }
    }
  }

  if (!freshUrl) {
    return NextResponse.json({ error: "Could not retrieve video from HeyGen" }, { status: 502 });
  }

  // Download and store permanently
  const permanentUrl = await downloadAndStoreVideo(freshUrl, video.id);
  return NextResponse.json({ videoUrl: permanentUrl || freshUrl });
}
