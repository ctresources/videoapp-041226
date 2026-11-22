import { announceVideoReady } from "@/lib/video/ready-notice";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoStatus, getVideoAgentSession, getVideoV3Status, getVideoScenes } from "@/lib/api/heygen";
import { friendlyRenderError, GENERIC_RENDER_ERROR } from "@/lib/utils/render-errors";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { storeVideoDetailed } from "@/lib/utils/store-video";
import { buildStoreOptions } from "@/lib/utils/store-options";
import type { ServiceResult } from "@/lib/content/service-result";

/** The route's exact responses, as a ServiceResult (status defaults to 200). */
const json = (body: unknown, init?: { status?: number }): ServiceResult => ({ status: init?.status ?? 200, body });

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
  heygenVideoId: string,
): Promise<string | null> {
  /**
   * Claimed the way the webhook claims it: inside storeVideoDetailed
   * (claim_video_post_processing, which stamps post_processing_started_at).
   *
   * This used to claim by setting render_status to "storing", which the
   * table's check constraint doesn't allow. The update failed silently on
   * every poll, so when HeyGen's webhook didn't arrive (2026-11-17, a twin
   * video HeyGen finished in 3 minutes sat on "rendering" for 30+) this
   * backup could never finish the video, and the 15-minute stall fallback
   * never fired either, since nothing had stamped a start time.
   */
  // The same options the webhook would have used — b-roll, music and captions.
  // This poll and the webhook race each other, and only the winner does the
  // work, so anything missing here is missing from the finished video.
  const storeOpts = await buildStoreOptions(video.metadata, heygenVideoId);

  let result: Awaited<ReturnType<typeof storeVideoDetailed>>;
  try {
    result = await storeVideoDetailed(heygenUrl, video.id, storeOpts);
  } catch (err) {
    console.error(`[status] storing ${video.id} threw:`, err instanceof Error ? err.message : err);
    result = { url: null, state: "failed" };
  }
  // Another caller (the webhook, or another poll) holds the claim. Still
  // working: wait. Already published: hand back what it published.
  if (result.state === "elsewhere") return result.url;

  // On any failure we still land on the raw HeyGen URL rather than a stuck row.
  const finalUrl = result.url || heygenUrl;

  await admin
    .from("generated_videos")
    .update({ render_status: "completed", video_url: finalUrl })
    .eq("id", video.id);
  await announceVideoReady(admin, video.id);
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
 * The shared service behind GET /api/video/status and the agent layer's
 * video_status (2026-11-22). Moved out of the route unchanged, so a status
 * check from an AI client finishes a render exactly like the app's poll does.
 *
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
export async function getRenderStatus(
  userId: string,
  renderId: string,
  flags: { scenes?: boolean; refresh?: boolean } = {},
): Promise<ServiceResult> {
  if (!renderId) return json({ error: "renderId required" }, { status: 400 });

  try {
    const admin = createAdminClient();

    const { data: video } = await admin
      .from("generated_videos")
      .select("id, project_id, user_id, video_type, render_status, video_url, render_provider, render_job_id, metadata, created_at")
      .eq("render_job_id", renderId)
      .eq("user_id", userId)
      .single();

    if (!video) {
      return json({ error: "Video not found" }, { status: 404 });
    }

    let status = video.render_status as string;
    let videoUrl = video.video_url as string | null;
    // Surface the stored failure reason (persisted into metadata.render_error by
    // the fail branches below) so a failed render can explain itself even after
    // the live poll that detected it is long gone.
    const storedMeta = (video.metadata as Record<string, unknown> | null) ?? {};
    const RENDER_FAILED_MESSAGE = GENERIC_RENDER_ERROR;
    // Two different strings, deliberately: render_error is the raw diagnostic
    // (a provider message, or a sentinel when they gave us nothing) and is for
    // us; render_message is the sentence a person reads. Reading the diagnostic
    // out to the user is how the vendor's name ended up on their screen.
    let errorMsg: string | null = status === "failed"
      ? ((storedMeta.render_message as string | undefined) || RENDER_FAILED_MESSAGE)
      : null;

    // Diagnostic: ?scenes=1 reads back what was actually composed — the
    // background behind each scene, what was placed on it, and the words over
    // it. The finished file shows a bad frame; this shows the decision that
    // produced it. Owner-scoped by the query above, and never rendered in the
    // product — it exists to answer "why does it look like that".
    if (flags.scenes) {
      // On the agent path render_job_id holds the SESSION id until the render
      // completes, and only a video id has scenes. A failed agent render is
      // exactly the one worth inspecting, so resolve the video id through the
      // session rather than returning nothing for it.
      let sceneVideoId = renderId;
      let scenes = await getVideoScenes(sceneVideoId);
      if (!scenes && video.render_provider === "heygen_agent") {
        try {
          const session = await getVideoAgentSession(renderId);
          if (session.videoId) {
            sceneVideoId = session.videoId;
            scenes = await getVideoScenes(sceneVideoId);
          }
        } catch {
          /* the session is gone; the null result below says so */
        }
      }
      return json({
        renderId,
        videoId: sceneVideoId,
        provider: video.render_provider,
        status,
        sceneCount: scenes?.length ?? 0,
        scenes,
      });
    }

    // Diagnostic: ?refresh=1 forces a fresh HeyGen query even for an already
    // terminal row, so we can recover the real failure_message that the webhook
    // discarded when it marked the row failed. HeyGen retains it keyed by the
    // video_id (== renderId for the v3 direct path).
    if (flags.refresh) {
      try {
        const fresh = await getVideoV3Status(renderId);
        errorMsg = fresh.error || errorMsg;
        if (fresh.error) {
          await admin
            .from("generated_videos")
            .update({ metadata: { ...storedMeta, render_error: fresh.error } })
            .eq("id", video.id);
        }
        return json({
          renderId,
          provider: video.render_provider,
          status: fresh.status,
          videoUrl: fresh.videoUrl,
          error: errorMsg,
          _heygen: fresh,
        });
      } catch (e) {
        return json({
          renderId,
          provider: video.render_provider,
          status: "failed",
          error: e instanceof Error ? e.message : "We couldn't check on this render. Try again in a moment.",
        });
      }
    }

    // If still rendering, query HeyGen directly (webhook fallback)
    if (status === "rendering" || status === "pending") {
      // Backstop for renders that vanish silently — HeyGen reports real
      // failures through the webhook, so this is not the normal failure path.
      // Tripping it early is the expensive mistake: it discards a video that
      // was still being made and refunds credits for one the user may still
      // receive, since a late webhook un-fails the row.
      //
      // HeyGen documents 5-10x the finished video length, so the ceiling has to
      // follow the video kind or one number is wrong for the other:
      //   short  500 words   = 3.4 min  ->  17-34 min   -> 45 covers it
      //   long   1160 words  = 8.0 min  ->  40-80 min   -> 90 covers it
      // Admin long form (2175 words, ~15 min, up to 150) is deliberately not
      // covered — that is a testing path, not one a customer reaches.
      const ageMs = Date.now() - new Date(video.created_at as string).getTime();
      const isLongRender =
        storedMeta.credit_kind === "long" ||
        String(video.video_type ?? "").includes("long");
      /**
       * Built by our own function (a Scenes Reel), not by the render service.
       *
       * There is nothing to ask anyone about it: the function that is
       * building it writes the row when it finishes or fails. What it cannot
       * write is that it died. A function runs for thirteen minutes at most,
       * so past sixteen with the row still "rendering" it is not coming back.
       */
      const builtHere = video.render_provider === "ffmpeg";
      const isAgent = video.render_provider === "heygen_agent";
      /**
       * A video template or a podcast at the desk (2026-11-02): HeyGen makes
       * a part, and our own step finishes it from the webhook and writes the
       * row. Asking HeyGen here and storing what it says would publish the
       * bare part (no photos, no words, no second person) as the video.
       */
      const ownFinish = video.render_provider === "template" || video.render_provider === "podcast_desk";
      // The video agent can plan for a long while before it renders: Abby
      // Vellucci's 2026-10-29 video spent 46 minutes planning, was failed at
      // 45 and finished at 55. 75 for it, and see the check below.
      const timeoutMin = builtHere ? 16 : isLongRender ? 90 : isAgent ? 75 : ownFinish ? 60 : 45;
      let timedOut = ageMs > timeoutMin * 60 * 1000;
      /**
       * Ask HeyGen before giving up (2026-10-29). A video HeyGen has finished
       * or is still making is not failed: the branch below finishes it, or it
       * keeps waiting. That video's "done" message never came (the agent
       * session still read "generating"), so age alone threw away a finished
       * video and refunded it. Up to 3 hours; after that it is failed.
       */
      if (timedOut && !builtHere && ageMs < 180 * 60 * 1000) {
        try {
          const heygenVideoId = isAgent ? (await getVideoAgentSession(renderId)).videoId : renderId;
          if (heygenVideoId) {
            const v = await getVideoV3Status(heygenVideoId);
            if (v.status !== "failed") {
              timedOut = false;
              console.log(`[status] ${video.id} past ${timeoutMin} min, but HeyGen says ${v.status}: still waiting`);
            }
          }
        } catch (e) {
          console.warn(`[status] couldn't ask HeyGen about ${video.id} at its time limit:`, e instanceof Error ? e.message : e);
        }
      }
      if (timedOut) {
        status = "failed";
        errorMsg = builtHere
          ? "That reel took too long to build. Nothing was taken from your plan. Try again."
          : `Render timed out after ${timeoutMin} minutes`;
        // Persist the reason like the other fail branches do, or this one reads
        // back as a bare "Render failed" once the live poll is gone.
        await admin
          .from("generated_videos")
          .update({
            render_status: "failed",
            metadata: { ...storedMeta, render_error: errorMsg, render_message: errorMsg },
          })
          .eq("id", video.id);
        if (video.project_id) {
          await admin.from("projects").update({ status: "error" }).eq("id", video.project_id);
        }
        await refundVideoCredits(admin, video.id as string);
        console.warn(`[status] Auto-failed ${video.id} after ${timeoutMin}-min timeout (kind=${isLongRender ? "long" : "short"})`);
      } else {
      try {
        const provider = video.render_provider as string;

        if (provider === "ffmpeg" || ownFinish) {
          // Still building; see builtHere and ownFinish above. The row is the whole answer.
        } else if (provider === "heygen_agent") {
          // ── Two-step v3 polling ─────────────────────────────────────────
          // Step 1: poll the agent session to get video_id
          const session = await getVideoAgentSession(renderId);
          console.log(`[status] Agent session ${renderId}: ${session.status}`);

          if (session.status === "failed") {
            status = "failed";
            // A failure at progress 0 with no reason given is a job that died
            // before rendering began — nothing about this script or these
            // settings would have changed it. Two real failures looked exactly
            // like this during a provider-side outage, and the old message
            // sent the user off to fix a video that was never the problem.
            const diedBeforeStarting = !session.error && !session.progress;
            errorMsg = session.error
              ? friendlyRenderError(session.error)
              : diedBeforeStarting
                ? "We couldn't render this right now. Your credit has been returned — try again in a few minutes."
                : GENERIC_RENDER_ERROR;

            await admin
              .from("generated_videos")
              .update({
                render_status: "failed",
                // The reason, kept for us rather than thrown away. The branch
                // above persists it on a timeout; this one persisted nothing,
                // so a failure left no trail at all and had to be chased
                // through the provider's API by hand.
                metadata: {
                  ...storedMeta,
                  render_error: session.error || "(none reported)",
                  render_message: errorMsg,
                  render_progress: session.progress ?? 0,
                  render_last_message: session.lastMessage,
                  render_failed_at: new Date().toISOString(),
                },
              })
              .eq("id", video.id);

            console.error(
              `[status] Agent ${renderId} failed at progress ${session.progress ?? 0} — ` +
              `error=${session.error ?? "(none)"} last=${session.lastMessage?.slice(0, 120) ?? "(none)"}`,
            );

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
              await announceVideoReady(admin, video.id);

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
              errorMsg = friendlyRenderError(videoStatus.error);

              await admin
                .from("generated_videos")
                .update({
                  render_status: "failed",
                  render_job_id: session.videoId,
                  metadata: {
                    ...storedMeta,
                    render_error: videoStatus.error || "(none reported)",
                    render_message: errorMsg,
                    render_failed_at: new Date().toISOString(),
                  },
                })
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
              renderId,
            );
            if (finalUrl) {
              status = "completed";
              videoUrl = finalUrl;
              console.log(`[status] HeyGen Direct ${renderId} completed`);
            } else {
              /**
               * Being finished elsewhere, normally by the webhook. Report
               * in-progress and keep polling.
               *
               * Unless that finish started long ago and never ended. The
               * webhook no longer publishes the plain render up front, so a
               * function that died half way through would leave this row
               * "rendering" until the timeout fails and refunds a video that
               * exists. After fifteen minutes, which is also when the claim on
               * it goes stale, the plain render is published instead. The
               * Videos page then repairs it into the finished one.
               */
              const startedAt = typeof storedMeta.post_processing_started_at === "string"
                ? Date.parse(storedMeta.post_processing_started_at)
                : NaN;
              if (!video.video_url && Number.isFinite(startedAt) && Date.now() - startedAt > 15 * 60 * 1000) {
                await admin
                  .from("generated_videos")
                  .update({ render_status: "completed", video_url: videoStatus.videoUrl })
                  .eq("id", video.id);
                await announceVideoReady(admin, video.id);
                if (video.project_id) {
                  await admin.from("projects").update({ status: "ready" }).eq("id", video.project_id);
                }
                status = "completed";
                videoUrl = videoStatus.videoUrl;
                console.warn(`[status] ${video.id}: finishing stalled for 15 minutes — published the plain render`);
              } else {
                status = "rendering";
              }
            }
          } else if (videoStatus.status === "failed") {
            status = "failed";
            errorMsg = friendlyRenderError(videoStatus.error);

            await admin
              .from("generated_videos")
              .update({
            render_status: "failed",
            metadata: { ...storedMeta, render_error: errorMsg, render_message: errorMsg },
          })
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
            await announceVideoReady(admin, video.id);

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
            errorMsg = friendlyRenderError(heygenStatus.error);

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
      } // end render-timeout else
    }

    const progress = status === "completed" ? 1 : status === "failed" ? 0 : 0.5;

    return json({
      renderId,
      status,
      progress,
      progressPct: Math.round(progress * 100),
      url: videoUrl,
      error: errorMsg,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 },
    );
  }
}
