/**
 * Getting a stored video's transcript, once.
 *
 * Two routes want the same thing — /api/video/captions serves it as a .srt to
 * attach in YouTube Studio, /api/video/transcript shows it for correcting —
 * and transcription is slow and metered, so both go through here. The cache
 * lives on the video row's metadata, which is also what an edit writes back
 * to: correct the words once and the caption download is corrected too.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeToSrt } from "@/lib/utils/srt";

type Admin = ReturnType<typeof createAdminClient>;

export type VideoSrtResult =
  | { ok: true; srt: string; cached: boolean }
  | { ok: false; status: number; error: string };

/**
 * The video's SRT, transcribing it if this is the first time it has been
 * asked for. Scoped to the caller's own videos.
 *
 * Failures come back as a status and a message rather than an exception: every
 * one of them is a normal outcome the caller has to say something about — the
 * video is still rendering, the clip has no speech, the key is missing.
 */
export async function ensureVideoSrt(
  admin: Admin,
  userId: string,
  videoId: string,
): Promise<VideoSrtResult> {
  if (!process.env.ELEVENLABS_API_KEY) {
    return { ok: false, status: 503, error: "Transcription not configured" };
  }

  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, render_status, metadata")
    .eq("id", videoId)
    .eq("user_id", userId)
    .single();

  if (!video?.video_url || video.render_status !== "completed") {
    return { ok: false, status: 400, error: "Video not ready" };
  }

  const meta = (video.metadata as Record<string, unknown> | null) ?? {};
  if (typeof meta.srt === "string" && meta.srt.length > 0) {
    return { ok: true, srt: meta.srt, cached: true };
  }

  try {
    const videoRes = await fetch(video.video_url as string);
    if (!videoRes.ok) throw new Error("Failed to fetch video file");
    const buffer = await videoRes.arrayBuffer();
    const srt = await transcribeToSrt(buffer, videoRes.headers.get("content-type") || "video/mp4");
    if (!srt) return { ok: false, status: 422, error: "No speech detected in this video" };

    await admin
      .from("generated_videos")
      .update({ metadata: { ...meta, srt } })
      .eq("id", video.id);

    await admin.from("api_usage_log").insert({
      user_id: userId,
      api_provider: "elevenlabs",
      endpoint: "stt-captions",
      credits_used: 0,
      response_status: 200,
    });

    return { ok: true, srt, cached: false };
  } catch (err) {
    console.error("[video-srt] transcription failed:", err);
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Transcription failed",
    };
  }
}

/**
 * Replace a video's stored transcript.
 *
 * `edited` is set so the UI can say the words are the user's rather than the
 * machine's, and so a later feature can tell a corrected transcript from a raw
 * one without diffing it against a transcription it no longer has.
 */
export async function saveVideoSrt(
  admin: Admin,
  userId: string,
  videoId: string,
  srt: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, metadata, project_id")
    .eq("id", videoId)
    .eq("user_id", userId)
    .single();

  if (!video) return { ok: false, status: 404, error: "Video not found" };

  const meta = (video.metadata as Record<string, unknown> | null) ?? {};
  const { error } = await admin
    .from("generated_videos")
    .update({ metadata: { ...meta, srt, srt_edited_at: new Date().toISOString() } })
    .eq("id", video.id);

  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
