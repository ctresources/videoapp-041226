import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoStatus, getVideoAgentSession, getVideoV3Status } from "@/lib/api/heygen";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { downloadAndStoreVideo } from "@/lib/utils/store-video";
import { NextRequest, NextResponse } from "next/server";

// Compositing photos + mixing music into a finished render (ffmpeg) can take a
// while, so the poll that finalizes a Direct video needs headroom.
export const maxDuration = 300;

/**
 * Finalize a completed Direct Video: composite the uploaded photos as b-roll,
 * mix background music, and re-store to Supabase — the same work the webhook
 * does. Uses a DB compare-and-swap so only the first caller (poll or webhook)
 * that flips the row out of its rendering state does the heavy work; concurrent
 * polls see the transient "storing" state and just keep waiting.
 *
 * Returns the final public URL, or null if another caller already claimed it.
 */
async function finalizeDirectVideo(
  admin: ReturnType<typeof createAdminClient>,
  video: { id: string; project_id: string | null; user_id: string; video_type: string; render_status: string; metadata: Record<string, unknown> | null },
  heygenUrl: string,
): Promise<string | null> {
  // Claim the row (rendering/pending -> storing). Only one caller wins.
  const { data: claimed } = await admin
    .from("generated_videos")
    .update({ render_status: "storing" })
    .eq("id", video.id)
    .eq("render_status", video.render_status)
    .select("id")
    .single();
  if (!claimed) return null; // someone else is finalizing

  const meta = video.metadata ?? {};
  const musicUrl = (meta.music_url as string | undefined) || null;
  const photoUrls = Array.isArray(meta.photo_urls) ? (meta.photo_urls as string[]) : null;
  const dimension = (meta.dimension as { width: number; height: number } | undefined) || null;

  // downloadAndStoreVideo never throws (photo/music steps fall back internally),
  // so on any failure we still land on the raw HeyGen URL rather than a stuck row.
  const stored = await downloadAndStoreVideo(heygenUrl, video.id, { musicUrl, photoUrls, dimension });
  const finalUrl = stored || heygenUrl;

  await admin
    .from("generated_videos")
    .update({ render_status: "completed", video_url: finalUrl })
    .eq("id", video.id);
  if (video.project_id) {
    await admin.from("projects").update({ status: "ready" }).eq("id", video.project_id);
  }
  if (video.user_id) {
    publishWebhookEvent(video.user_id, "video.published", {
      video_id: video.id,
      video_url: finalUrl,
      video_type: video.video_type,
      project_id: video.project_id,
    }).catch(console.error);
  }
  console.log(`[status] Direct ${video.id} finalized → ${finalUrl.includes("supabase") ? "stored+composited" : "raw HeyGen (store failed)"}`);
  return finalUrl;
}

/**
 * GET /api/video/status?renderId=xxx
 *
 * Returns the current render status for a HeyGen video job.
 *
 * Strategy:
 *   1. Read the DB row (the webhook updates it in production)
 *   2. If still rendering, fall back to querying HeyGen directly:
 *      - heygen_agent: two-step poll (session_id → video_id → GET /v3/videos/{id})
 *      - heygen (v2):  single-step poll via GET /v3/videos/{id} (v1 endpoint retired)
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
      .select("id, project_id, user_id, video_type, render_status, video_url, render_provider, render_job_id, metadata, created_at")
      .eq("render_job_id", renderId)
      .eq("user_id", user.id)
      .single();

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    let status = video.render_status as string;
    let videoUrl = video.video_url as string | null;
    // Surface the stored failure reason (persisted into metadata.render_error by
    // the fail branches below) so a failed render can explain itself even after
    // the live poll that detected it is long gone.
    const storedMeta = (video.metadata as Record<string, unknown> | null) ?? {};
    let errorMsg: string | null = status === "failed"
      ? ((storedMeta.render_error as string | undefined) || "Render failed")
      : null;

    // Diagnostic: ?refresh=1 forces a fresh HeyGen query even for an already
    // terminal row, so we can recover the real failure_message that the webhook
    // discarded when it marked the row failed. HeyGen retains it keyed by the
    // video_id (== renderId for the v3 direct path).
    if (req.nextUrl.searchParams.get("refresh") === "1") {
      try {
        const fresh = await getVideoV3Status(renderId);
        errorMsg = fresh.error || errorMsg;
        if (fresh.error) {
          await admin
            .from("generated_videos")
            .update({ metadata: { ...storedMeta, render_error: fresh.error } })
            .eq("id", video.id);
        }
        return NextResponse.json({
          renderId,
          provider: video.render_provider,
          status: fresh.status,
          videoUrl: fresh.videoUrl,
          error: errorMsg,
          _heygen: fresh,
        });
      } catch (e) {
        return NextResponse.json({
          renderId,
          provider: video.render_provider,
          status: "failed",
          error: e instanceof Error ? e.message : "HeyGen query failed",
        });
      }
    }

    // If still rendering, query HeyGen directly (webhook fallback)
    if (status === "rendering" || status === "pending") {
      // Auto-fail jobs stuck for more than 30 minutes
      const ageMs = Date.now() - new Date(video.created_at as string).getTime();
      if (ageMs > 30 * 60 * 1000) {
        status = "failed";
        errorMsg = "Render timed out after 30 minutes";
        await admin.from("generated_videos").update({ render_status: "failed" }).eq("id", video.id);
        if (video.project_id) {
          await admin.from("projects").update({ status: "error" }).eq("id", video.project_id);
        }
        await refundVideoCredits(admin, video.id as string);
        console.warn(`[status] Auto-failed ${video.id} after 30-min timeout`);
      } else {
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
            await refundVideoCredits(admin, video.id as string);
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
              await refundVideoCredits(admin, video.id as string);
            }
            // Still processing — keep status as "rendering"
          }
          // session.videoId is null → agent still working, keep "rendering"

        } else if (provider === "heygen_v3_direct") {
          // ── Direct Video single-step polling ───────────────────────────
          // POST /v3/videos returns a video_id immediately (no agent session),
          // so we poll GET /v3/videos/{id} directly via renderId.
          const videoStatus = await getVideoV3Status(renderId);
          console.log(`[status] V3 direct video ${renderId}: ${videoStatus.status}`);

          if (videoStatus.status === "completed" && videoStatus.videoUrl) {
            // Composite photos + mix music + re-store (idempotent CAS lock).
            const finalUrl = await finalizeDirectVideo(
              admin,
              {
                id: video.id as string,
                project_id: video.project_id as string | null,
                user_id: video.user_id as string,
                video_type: video.video_type as string,
                render_status: video.render_status as string,
                metadata: video.metadata as Record<string, unknown> | null,
              },
              videoStatus.videoUrl,
            );
            if (finalUrl) {
              status = "completed";
              videoUrl = finalUrl;
              console.log(`[status] HeyGen Direct ${renderId} completed`);
            } else {
              // Another poll is finalizing — report in-progress, keep polling.
              status = "rendering";
            }
          } else if (videoStatus.status === "failed") {
            status = "failed";
            errorMsg = videoStatus.error || "HeyGen v3 direct render failed";

            await admin
              .from("generated_videos")
              .update({ render_status: "failed", metadata: { ...storedMeta, render_error: errorMsg } })
              .eq("id", video.id);

            if (video.project_id) {
              await admin
                .from("projects")
                .update({ status: "error" })
                .eq("id", video.project_id);
            }
            await refundVideoCredits(admin, video.id as string);
          }
          // Still processing — keep status as "rendering"

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
            await refundVideoCredits(admin, video.id as string);

            console.warn(`[status] HeyGen ${renderId} failed via direct poll: ${errorMsg}`);
          }
          // Still processing/waiting/pending — keep "rendering"
        }
      } catch (pollErr) {
        // Don't fail the status check if HeyGen poll fails; keep DB value
        console.warn("[status] HeyGen direct poll failed:", pollErr);
      }
      } // end 30-min timeout else
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
