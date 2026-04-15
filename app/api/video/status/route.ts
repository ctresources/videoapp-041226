import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoStatus } from "@/lib/api/heygen";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/video/status?renderId=xxx
 *
 * Returns the current render status for a HeyGen video job.
 *
 * Strategy:
 *   1. Read the DB row (the webhook updates it in production)
 *   2. If the DB says "rendering" but the webhook may not have reached us
 *      (e.g. local dev where HeyGen can't call back to localhost), fall
 *      back to querying HeyGen directly and update the DB if complete.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const renderId = req.nextUrl.searchParams.get("renderId");
  if (!renderId) return NextResponse.json({ error: "renderId required" }, { status: 400 });

  try {
    const admin = createAdminClient();

    const { data: video } = await admin
      .from("generated_videos")
      .select("id, project_id, user_id, video_type, render_status, video_url, render_provider, render_job_id")
      .eq("render_job_id", renderId)
      .eq("user_id", user.id)
      .single();

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    let status = video.render_status as string;
    let videoUrl = video.video_url as string | null;
    let errorMsg: string | null = status === "failed" ? "Render failed" : null;

    // If still rendering, query HeyGen directly (webhook fallback)
    if (status === "rendering" || status === "pending") {
      try {
        const heygenStatus = await getVideoStatus(renderId);

        if (heygenStatus.status === "completed") {
          status = "completed";
          videoUrl = heygenStatus.videoUrl;

          await admin
            .from("generated_videos")
            .update({ render_status: "completed", video_url: videoUrl })
            .eq("id", video.id);

          if (video.project_id) {
            await admin
              .from("projects")
              .update({ status: "ready" })
              .eq("id", video.project_id);
          }

          // Fire CRM webhooks on completion
          if (video.user_id && videoUrl) {
            publishWebhookEvent(video.user_id, "video.published", {
              video_id: video.id,
              video_url: videoUrl,
              video_type: video.video_type,
              project_id: video.project_id,
            }).catch(console.error);
          }

          console.log(`[status] HeyGen ${renderId} completed via direct poll`);
        } else if (heygenStatus.status === "failed") {
          status = "failed";
          errorMsg = heygenStatus.error || "HeyGen render failed";

          await admin
            .from("generated_videos")
            .update({ render_status: "failed" })
            .eq("id", video.id);

          if (video.project_id) {
            await admin
              .from("projects")
              .update({ status: "error" })
              .eq("id", video.project_id);
          }

          console.warn(`[status] HeyGen ${renderId} failed via direct poll: ${errorMsg}`);
        }
        // Still processing/waiting/pending — keep DB status as "rendering"
      } catch (pollErr) {
        // Don't fail the status check if HeyGen poll fails; keep DB value
        console.warn("[status] HeyGen direct poll failed:", pollErr);
      }
    }

    const progress = status === "completed" ? 1 : status === "failed" ? 0 : 0.5;

    return NextResponse.json({
      renderId,
      status,
      progress,
      progressPct: Math.round(progress * 100),
      url: videoUrl,
      error: errorMsg,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 },
    );
  }
}
