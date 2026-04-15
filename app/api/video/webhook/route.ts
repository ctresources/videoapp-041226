import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";

/**
 * POST /api/video/webhook
 *
 * Handles HeyGen video completion webhooks.
 * HeyGen sends a callback when the video render finishes or fails.
 *
 * Note: The create-blog route already polls for completion, so this webhook
 * is a secondary notification path (belt and suspenders).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  // ── HeyGen webhook payload ──────────────────────────────────────────────────
  // HeyGen sends: { event_type, event_data: { video_id, url, ... } }
  if (body.event_type && body.event_data?.video_id) {
    const videoId = body.event_data.video_id;
    const videoUrl = body.event_data.url || body.event_data.video_url;
    const success =
      body.event_type === "avatar_video.success" ||
      body.event_type === "video.success" ||
      body.status === "completed";

    const renderStatus = success ? "completed" : "failed";

    // Update video row
    const { data: video } = await admin
      .from("generated_videos")
      .update({
        render_status: renderStatus,
        video_url: videoUrl || null,
      })
      .eq("render_job_id", videoId)
      .eq("render_provider", "heygen")
      .select("id, project_id, user_id, video_type")
      .single();

    // Update parent project status
    if (video?.project_id) {
      await admin
        .from("projects")
        .update({ status: success ? "ready" : "error" })
        .eq("id", video.project_id);
    }

    // Fire CRM webhooks on video completion
    if (success && video?.user_id && videoUrl) {
      publishWebhookEvent(video.user_id, "video.published", {
        video_id: video.id,
        video_url: videoUrl,
        video_type: video.video_type,
        project_id: video.project_id,
      }).catch(console.error);
    }

    console.log(`[webhook] HeyGen ${body.event_type}: video ${videoId} → ${renderStatus}`);
    return NextResponse.json({ received: true });
  }

  // ── Unknown payload — log and acknowledge ──────────────────────────────────
  console.warn("[webhook] Unknown payload:", JSON.stringify(body).slice(0, 200));
  return NextResponse.json({ received: true });
}
