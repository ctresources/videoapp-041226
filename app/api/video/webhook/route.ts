import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { downloadAndStoreVideo } from "@/lib/utils/store-video";
import { isHeygenUrl } from "@/lib/utils/video-url";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { renderAndSaveThumbnail } from "@/lib/utils/thumbnail-render";

/** Constant-time string compare that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the shared secret carried in the callback URL's `k` parameter.
 *
 * This is the ACTIVE authentication for this endpoint. HeyGen signs only
 * deliveries to endpoints registered via POST /v3/webhooks/endpoints; we use
 * per-request `callback_url`, which is never signed — so there is no signature
 * to verify and the endpoint was accepting anonymous POSTs. See
 * lib/utils/webhook-callback.ts, which builds the URL from the same env var.
 *
 * Returns "unconfigured" when HEYGEN_WEBHOOK_TOKEN is unset, which means the
 * submitted URLs carry no token either — the caller logs loudly and processes,
 * so deploying this change cannot break delivery on its own.
 */
function verifyCallbackToken(req: NextRequest): "ok" | "bad" | "unconfigured" {
  const expected = process.env.HEYGEN_WEBHOOK_TOKEN;
  if (!expected) return "unconfigured";
  const provided = new URL(req.url).searchParams.get("k") ?? "";
  return safeEqual(provided, expected) ? "ok" : "bad";
}

/**
 * Verifies HeyGen's HMAC-SHA256 signature over the raw request body.
 *
 * Inert on the current pipeline: HeyGen sends `Heygen-Signature` only to
 * registered webhook endpoints, and no secret is issued for the per-request
 * callbacks we use — production logs show the header absent on every delivery.
 * Kept, with the correct header name, so that migrating to a registered
 * endpoint is a config change rather than a code change.
 * See https://developers.heygen.com/docs/webhooks
 */
function verifyHeygenSignature(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.HEYGEN_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("heygen-signature") || "";
  if (!provided) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(provided, expected);
}

// Video storage + auto-thumbnail generation can each take ~1 min.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only lookup of a render's current video_url, using the same match order
 * as the main handler (callback_id → video_id → session_id). Kept separate from
 * those queries because they mutate the row as they search.
 */
async function findStoredUrl(
  admin: ReturnType<typeof createAdminClient>,
  ids: { callbackId?: string | null; videoId?: string | null; sessionId?: string | null },
): Promise<string | null> {
  if (ids.callbackId && UUID_RE.test(ids.callbackId)) {
    const { data } = await admin
      .from("generated_videos").select("video_url").eq("id", ids.callbackId).maybeSingle();
    if (data) return (data as { video_url: string | null }).video_url;
  }
  for (const jobId of [ids.videoId, ids.sessionId]) {
    if (!jobId) continue;
    const { data } = await admin
      .from("generated_videos").select("video_url").eq("render_job_id", jobId).maybeSingle();
    if (data) return (data as { video_url: string | null }).video_url;
  }
  return null;
}

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
  // Read the raw body first — signature verification must run over the exact
  // bytes HeyGen signed, before any JSON re-serialization.
  const rawBody = await req.text();

  // ── Callback token ────────────────────────────────────────────────────────
  // The real gate. Rejecting here matters because a forged avatar_video.fail
  // triggers refundVideoCredits — users know their own video UUIDs from the
  // UI, so an unauthenticated endpoint is a self-serve credit refund.
  const tokenCheck = verifyCallbackToken(req);
  if (tokenCheck === "bad") {
    console.warn("[webhook] Rejected: missing or invalid callback token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (tokenCheck === "unconfigured") {
    console.warn(
      "[webhook] HEYGEN_WEBHOOK_TOKEN is not set — this endpoint is UNAUTHENTICATED. " +
      "Set it in the environment to turn verification on at both ends.",
    );
  }

  // ── Signature verification ────────────────────────────────────────────────
  // Rollout is staged so a misconfigured secret can't silently break video
  // delivery: with the secret set we always CHECK and log, but only REJECT
  // forgeries once HEYGEN_WEBHOOK_ENFORCE="true". Flip that flag after the
  // logs confirm a real webhook passes.
  if (process.env.HEYGEN_WEBHOOK_SECRET) {
    const ok = verifyHeygenSignature(rawBody, req);
    if (!ok) {
      // Diagnostic: is the Signature header even present, and what shape is it?
      // Distinguishes "HeyGen doesn't sign per-video callbacks" (header absent)
      // from "wrong secret" (header present, both 64-char hex, values differ).
      const provided = req.headers.get("signature") || req.headers.get("Signature") || "";
      const expected = createHmac("sha256", process.env.HEYGEN_WEBHOOK_SECRET).update(rawBody, "utf8").digest("hex");
      const headerNames = Array.from(req.headers.keys()).join(", ");
      console.warn(
        `[webhook] SIG DIAG — provided(len=${provided.length}, head='${provided.slice(0, 12)}') ` +
        `expected(len=${expected.length}, head='${expected.slice(0, 12)}') allHeaders=[${headerNames}]`,
      );
      if (process.env.HEYGEN_WEBHOOK_ENFORCE === "true") {
        console.warn("[webhook] Rejected: HeyGen signature invalid or missing");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      console.warn("[webhook] Signature check FAILED (monitor mode — processing anyway).");
    } else {
      console.log("[webhook] Signature verified ✓");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
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

  // ── Ignore duplicate deliveries of an already-stored render ───────────────
  // HeyGen retries whenever this endpoint answers non-2xx, and it used to
  // answer 504: one long render was delivered four times, each attempt
  // re-running the full download + ffmpeg pipeline and timing out again. The
  // updates below also rewrite video_url with HeyGen's temporary URL, so a
  // retry could undo the permanent URL an earlier attempt had already stored.
  // Once the video is in our own bucket there is nothing left to do.
  if (success) {
    const stored = await findStoredUrl(admin, { callbackId, videoId, sessionId });
    if (stored && !isHeygenUrl(stored)) {
      console.log(`[webhook] Already stored, ignoring duplicate ${eventType} (callback=${callbackId})`);
      return NextResponse.json({ received: true, duplicate: true });
    }
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
    // Post-processing the Video Agent can't do itself:
    //  - photo_urls: Direct Video renders a bare talking head, so uploaded
    //    photos are composited as b-roll here (paste-your-script flow).
    //  - music_url: background music mixed under the voiceover.
    const meta = video.metadata ?? {};
    const musicUrl = (meta.music_url as string | undefined) || null;
    const photoUrls = Array.isArray(meta.photo_urls) ? (meta.photo_urls as string[]) : null;
    const dimension = (meta.dimension as { width: number; height: number } | undefined) || null;
    const permanentUrl = await downloadAndStoreVideo(videoUrl, video.id, { musicUrl, photoUrls, dimension });
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
