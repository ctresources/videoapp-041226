import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";

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

  const success =
    eventType === "avatar_video.success" ||
    eventType === "video.success" ||
    eventType === "video.completed" ||
    eventType === "video_agent.completed" ||
    body.status === "completed";

  const failed =
    eventType === "avatar_video.fail" ||
    eventType === "video.fail" ||
    eventType === "video.failed" ||
    eventType === "video_agent.failed" ||
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
  let video: { id: string; project_id: string | null; user_id: string; video_type: string } | null = null;

  if (callbackId) {
    const { data } = await admin
      .from("generated_videos")
      .update({ render_status: renderStatus, video_url: videoUrl || null })
      .eq("id", callbackId)
      .select("id, project_id, user_id, video_type")
      .single();
    video = data;
  }

  if (!video && videoId) {
    const { data } = await admin
      .from("generated_videos")
      .update({ render_status: renderStatus, video_url: videoUrl || null })
      .eq("render_job_id", videoId)
      .select("id, project_id, user_id, video_type")
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
      .select("id, project_id, user_id, video_type")
      .single();
    video = data;
  }

  if (!video) {
    console.warn(`[webhook] No video row matched for event ${eventType}`);
    return NextResponse.json({ received: true });
  }

  // ── Update parent project status ──────────────────────────────────────────
  if (video.project_id) {
    await admin
      .from("projects")
      .update({ status: success ? "ready" : "error" })
      .eq("id", video.project_id);
  }

  // ── Fire CRM webhooks on video completion ─────────────────────────────────
  if (success && video.user_id && videoUrl) {
    publishWebhookEvent(video.user_id, "video.published", {
      video_id: video.id,
      video_url: videoUrl,
      video_type: video.video_type,
      project_id: video.project_id,
    }).catch(console.error);
  }

  console.log(`[webhook] Processed ${eventType}: row ${video.id} → ${renderStatus}`);
  return NextResponse.json({ received: true });
}
