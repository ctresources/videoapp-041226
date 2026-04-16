import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoStatus, getVideoAgentSession, getVideoV3Status } from "@/lib/api/heygen";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/video/status?renderId=xxx
 *
 * Returns the current render status for a HeyGen video job.
 *
 * Strategy:
 *   1. Read the DB row (the webhook updates it in production)
 *   2. If still rendering, fall back to querying HeyGen directly:
 *      - heygen_agent: two-step poll (session_id → video_id → /v3/videos/{id})
 *      - heygen (v2):  single-step poll via v1/video_status.get
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
      .select("id, project_id, user_id, video_type, render_status, video_url, render_provider, render_job_id, metadata")
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
        const provider = video.render_provider as string;

        if (provider === "heygen_agent") {
          // ── Two-step v3 polling ─────────────────────────────────────────
          // Step 1: poll the agent session to get video_id
          const session = await getVideoAgentSession(renderId);
          console.log(`[status] Agent session ${renderId}: ${session.status}`);

          if (session.status === "failed") {
            status = "failed";
            errorMsg = session.error || "HeyGen Video Agent failed";

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
          } else if (session.videoId) {
            // Step 2: we have a video_id — poll v3 videos endpoint
            const videoStatus = await getVideoV3Status(session.videoId);
            console.log(`[status] V3 video ${session.videoId}: ${videoStatus.status}`);

            if (videoStatus.status === "completed" && videoStatus.videoUrl) {
              status = "completed";
              videoUrl = videoStatus.videoUrl;

              // Update DB — store the final video_id in render_job_id so future
              // webhook lookups can match on it directly
              await admin
                .from("generated_videos")
                .update({
                  render_status: "completed",
                  video_url: videoUrl,
                  render_job_id: session.videoId,
                })
                .eq("id", video.id);

              if (video.project_id) {
                await admin
                  .from("projects")
                  .update({ status: "ready" })
                  .eq("id", video.project_id);
              }

              if (video.user_id && videoUrl) {
                publishWebhookEvent(video.user_id, "video.published", {
                  video_id: video.id,
                  video_url: videoUrl,
                  video_type: video.video_type,
                  project_id: video.project_id,
                }).catch(console.error);
              }

              console.log(`[status] HeyGen Agent ${renderId} → video ${session.videoId} completed`);
            } else if (videoStatus.status === "failed") {
              status = "failed";
              errorMsg = videoStatus.error || "HeyGen v3 render failed";

              await admin
                .from("generated_videos")
                .update({ render_status: "failed", render_job_id: session.videoId })
                .eq("id", video.id);

              if (video.project_id) {
                await admin
                  .from("projects")
                  .update({ status: "error" })
                  .eq("id", video.project_id);
              }
            }
            // Still processing — keep status as "rendering"
          }
          // session.videoId is null → agent still working, keep "rendering"

        } else {
          // ── Legacy v2 single-step polling ──────────────────────────────
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
          // Still processing/waiting/pending — keep "rendering"
        }
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
