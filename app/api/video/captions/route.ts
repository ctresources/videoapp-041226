import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeToSrt } from "@/lib/utils/srt";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // download + transcription of long recordings

/**
 * POST /api/video/captions — { videoId }
 * Generates an SRT caption file for a finished video by transcribing its
 * audio with ElevenLabs STT (word-level timestamps). The result is cached in
 * the video row's metadata so repeat downloads are instant. Returned as
 * text/plain; the client saves it as a .srt file the user can attach in
 * YouTube Studio (accurate captions + caption-text SEO).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Transcription not configured" }, { status: 503 });
  }

  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, render_status, metadata")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video?.video_url || video.render_status !== "completed") {
    return NextResponse.json({ error: "Video not ready" }, { status: 400 });
  }

  const meta = (video.metadata as Record<string, unknown> | null) ?? {};

  // Cached from a previous request — no need to re-transcribe
  if (typeof meta.srt === "string" && meta.srt.length > 0) {
    return new NextResponse(meta.srt, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const videoRes = await fetch(video.video_url as string);
    if (!videoRes.ok) throw new Error("Failed to fetch video file");
    const videoBuffer = await videoRes.arrayBuffer();

    const contentType = videoRes.headers.get("content-type") || "video/mp4";
    const srt = await transcribeToSrt(videoBuffer, contentType);

    if (!srt) {
      return NextResponse.json({ error: "No speech detected in this video" }, { status: 422 });
    }

    await admin
      .from("generated_videos")
      .update({ metadata: { ...meta, srt } })
      .eq("id", video.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "elevenlabs",
      endpoint: "stt-captions",
      credits_used: 0,
      response_status: 200,
    });

    return new NextResponse(srt, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[captions] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Caption generation failed" },
      { status: 500 },
    );
  }
}
