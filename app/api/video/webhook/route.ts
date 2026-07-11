import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { downloadAndStoreVideo } from "@/lib/utils/store-video";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { renderAndSaveThumbnail } from "@/lib/utils/thumbnail-render";

// Video storage + auto-thumbnail generation can each take ~1 min.
export const maxDuration = 300;

// HeyGen pings GET to verify the endpoint is reachable before registering it
export async function GET() {
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/video/webhook
 *
 * Handles HeyGen video completion webhooks for both v2 and v3 Video Agent.
 *
 * v2 payload:  { event_type, event_data: { video_id, url } }
 * v3 payload:  { event_type, event_data: { session_id, video_id, video_url } }
 *              callback_id is the generated_videos row ID passed at submission time
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  const eventType: string = body.event_type || body.status || "";
  const eventData = body.event_data || body;

  // ── Extract IDs and URL from payload ──────────────────────────────────────
  // v3 agents use session_id + video_id; v2 uses video_id only
  const videoId: string | undefined = eventData.video_id;
  const sessionId: string | undefined = eventData.session_id;
  const callbackId: string | undefined = eventData.callback_id || body.callback_id;
  const videoUrl: string | undefined =
    eventData.video_url || eventData.url || eventData.video_download_url;

  // Failure events carry the reason in event_data — capture it so failed renders
  // can explain themselves (HeyGen uses varying field names across event types).
  const failureDetail: string | undefined =
    eventData.failure_message || eventData.error || eventData.msg ||
    eventData.message || eventData.reason ||
    (eventData.failure_code ? String(eventData.failure_code) : undefined);

  const success =
    eventType === "avatar_video.success" ||
    eventType === "video.success" ||
    eventType === "video.completed" ||
    eventType === "video_agent.success" ||
    body.status === "completed";

  const failed =
    eventType === "avatar_video.fail" ||
    eventType === "video.fail" ||
    eventType === "video.failed" ||
    eventType === "video_agent.fail" ||
    body.status === "failed";

  const renderStatus = success ? "completed" : failed ? "failed" : null;

  console.log(`[webhook] ${eventType} | session=${sessionId} video=${videoId} callback=${callbackId} status=${renderStatus}`);

  if (!renderStatus) {
    // Still processing or unknown event — acknowledge and skip
    console.warn("[webhook] Unhandled event type or unknown payload:", JSON.stringify(body).slice(0, 300));
    return NextResponse.json({ received: true });
  }

  // ── Find the generated_videos row ─────────────────────────────────────────
  // Try to match by: callback_id (most reliable) → video_id → session_id
  let video: { id: string; project_id: string | null; user_id: string; video_type: string; metadata: Record<string, unknown> | null } | null = null;

  if (callbackId) {
    const { data } = await admin
      .from("generated_videos")
      .update({ render_status: renderStatus, video_url: videoUrl || null })
      .eq("id", callbackId)
      .select("id, project_id, user_id, video_type, metadata")
      .single();
    video = data;
  }

  if (!video && videoId) {
    const { data } = await admin
      .from("generated_videos")
      .update({ render_status: renderStatus, video_url: videoUrl || null })
      .eq("render_job_id", videoId)
      .select("id, project_id, user_id, video_type, metadata")
      .single();
    video = data;
  }

  if (!video && sessionId) {
    const { data } = await admin
      .from("generated_videos")
      .update({
        render_status: renderStatus,
        video_url: videoUrl || null,
        // Update render_job_id to the actual video_id for future reference
        ...(videoId && success ? { render_job_id: videoId } : {}),
      })
      .eq("render_job_id", sessionId)
      .select("id, project_id, user_id, video_type, metadata")
      .single();
    video = data;
  }

  if (!video) {
    console.warn(`[webhook] No video row matched for event ${eventType}`);
    return NextResponse.json({ received: true });
  }

  // ── Persist the failure reason so the render can explain itself ───────────
  if (failed) {
    const reason = failureDetail || `${eventType} (no detail in payload)`;
    await admin
      .from("generated_videos")
      .update({ metadata: { ...(video.metadata ?? {}), render_error: reason } })
      .eq("id", video.id);
    console.warn(`[webhook] Render ${video.id} failed: ${reason}`);

    // Give the charged credits back — a failed render should never cost anything
    await refundVideoCredits(admin, video.id);
  }

  // ── Update parent project status ──────────────────────────────────────────
  if (video.project_id) {
    await admin
      .from("projects")
      .update({ status: success ? "ready" : "error" })
      .eq("id", video.project_id);
  }

  // ── Permanently store video in Supabase Storage ───────────────────────────
  // Download from HeyGen's expiring signed URL and upload to our own bucket
  // so the video URL never expires. Fire-and-forget; fallback to HeyGen URL.
  let finalVideoUrl = videoUrl;
  if (success && videoUrl) {
    const permanentUrl = await downloadAndStoreVideo(videoUrl, video.id);
    if (permanentUrl) finalVideoUrl = permanentUrl;
  }

  // ── Fire CRM webhooks on video completion ─────────────────────────────────
  if (success && video.user_id && finalVideoUrl) {
    publishWebhookEvent(video.user_id, "video.published", {
      video_id: video.id,
      video_url: finalVideoUrl,
      video_type: video.video_type,
      project_id: video.project_id,
    }).catch(console.error);
  }

  // ── Auto-generate a YouTube thumbnail once the video is ready ─────────────
  // Only when the project doesn't already have one (the user may have made
  // their own in AI Tools); failures never affect the render result.
  if (success && video.project_id && video.user_id) {
    try {
      const { data: proj } = await admin
        .from("projects")
        .select("thumbnail_url")
        .eq("id", video.project_id)
        .single();
      if (!(proj as { thumbnail_url: string | null } | null)?.thumbnail_url) {
        console.log(`[webhook] auto-generating thumbnail for project ${video.project_id}`);
        await renderAndSaveThumbnail({ userId: video.user_id, projectId: video.project_id });
      }
    } catch (err) {
      console.error("[webhook] auto-thumbnail failed:", err instanceof Error ? err.message : err);
    }
  }

  console.log(`[webhook] Processed ${eventType}: row ${video.id} → ${renderStatus}`);
  return NextResponse.json({ received: true });
}
