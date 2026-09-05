import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { publishWebhookEvent } from "@/lib/utils/webhook-publisher";
import { downloadAndStoreVideo } from "@/lib/utils/store-video";
import { buildStoreOptions } from "@/lib/utils/store-options";
import { isHeygenUrl } from "@/lib/utils/video-url";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { ensureProjectThumbnail } from "@/lib/utils/thumbnail-render";
import { getVideoTranslationStatus } from "@/lib/api/heygen";

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
 * How stale a delivery may be before it is treated as a replay. The signature
 * covers only the body, so a captured request stays valid forever without a
 * freshness bound.
 */
const MAX_WEBHOOK_AGE_SECONDS = 15 * 60;

/**
 * Verifies HeyGen's HMAC-SHA256 signature over the raw request body, plus the
 * `Heygen-Timestamp` freshness bound.
 *
 * Only deliveries to endpoints registered via POST /v3/webhooks/endpoints are
 * signed; the per-request `callback_url` path we used historically is not, which
 * is why this returned false on every real delivery until now. Once the endpoint
 * is registered and HEYGEN_WEBHOOK_SECRET holds its secret, this becomes the
 * real gate and the URL token can be retired.
 * See https://developers.heygen.com/docs/webhooks
 */
function verifyHeygenSignature(rawBody: string, req: NextRequest): { ok: boolean; reason?: string } {
  const secret = process.env.HEYGEN_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: "no secret configured" };

  /**
   * HeyGen names this header `signature`, not `heygen-signature`.
   *
   * Only the plain name was checked, so every signed delivery was reported as
   * "Heygen-Signature header absent" and rejected — while the unsigned
   * per-request callback beside it succeeded, which is why nothing looked
   * broken. Production headers on a real delivery settled it: the list carries
   * `signature` and no `heygen-` prefixed header at all.
   *
   * Both names are accepted. If HeyGen ever moves to the prefixed form, this
   * keeps working rather than failing the same silent way in reverse.
   */
  const rawSig = req.headers.get("signature")
    || req.headers.get("heygen-signature")
    || "";
  if (!rawSig) return { ok: false, reason: "signature header absent (checked: signature, heygen-signature)" };

  /**
   * Tolerant of how the digest is wrapped.
   *
   * Providers variously send bare hex, `sha256=<hex>`, or a comma-separated
   * `t=…,v1=<hex>`. Pulling the longest hex run out of the value handles all
   * three, and a signature that is genuinely wrong still fails the compare
   * below — this only avoids rejecting a correct one for its packaging.
   */
  const provided = (rawSig.match(/[a-f0-9]{64}/i) ?? [rawSig.trim()])[0];

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (!safeEqual(provided.toLowerCase(), expected)) {
    return { ok: false, reason: `signature mismatch (header '${rawSig.slice(0, 24)}…')` };
  }

  // Signature is valid — now bound how old the delivery may be. Absent header
  // is tolerated rather than fatal: the body is already proven authentic, and
  // rejecting on a header HeyGen might omit would break delivery outright.
  // Same naming lesson as the signature above — and the real delivery carried
  // neither name, so this stays tolerant of absence rather than fatal.
  const ts = req.headers.get("timestamp") || req.headers.get("heygen-timestamp");
  if (ts) {
    const age = Math.floor(Date.now() / 1000) - Number(ts);
    if (!Number.isFinite(age)) return { ok: false, reason: `unparseable timestamp '${ts}'` };
    if (Math.abs(age) > MAX_WEBHOOK_AGE_SECONDS) {
      return { ok: false, reason: `stale delivery (${age}s old)` };
    }
  }
  return { ok: true };
}

// Video storage + auto-thumbnail generation can each take ~1 min.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only lookup of a render's current video_url, using the same match order
 * as the main handler (callback_id → video_id → session_id). Kept separate from
 * those queries because they mutate the row as they search.
 */
async function findStoredRow(
  admin: ReturnType<typeof createAdminClient>,
  ids: { callbackId?: string | null; videoId?: string | null; sessionId?: string | null },
): Promise<StoredRow | null> {
  const COLUMNS = "video_url, project_id, user_id";
  if (ids.callbackId && UUID_RE.test(ids.callbackId)) {
    const { data } = await admin
      .from("generated_videos").select(COLUMNS).eq("id", ids.callbackId).maybeSingle();
    if (data) return data as unknown as StoredRow;
  }
  for (const jobId of [ids.videoId, ids.sessionId]) {
    if (!jobId) continue;
    const { data } = await admin
      .from("generated_videos").select(COLUMNS).eq("render_job_id", jobId).maybeSingle();
    if (data) return data as unknown as StoredRow;
  }
  return null;
}

interface StoredRow {
  video_url: string | null;
  project_id: string | null;
  user_id: string | null;
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

  // ── Authentication ────────────────────────────────────────────────────────
  // Two mechanisms, and a delivery need satisfy only ONE. That is what makes
  // the migration to a registered endpoint safe: during cutover, renders
  // submitted earlier still call back with a URL token while newly registered
  // deliveries arrive signed instead, and both must keep working.
  //
  // Rejecting matters because a forged avatar_video.fail calls
  // refundVideoCredits, and users know their own video UUIDs from the UI — an
  // open endpoint is a self-serve credit refund.
  const registeredMode = process.env.HEYGEN_WEBHOOK_REGISTERED === "true";
  const sig = verifyHeygenSignature(rawBody, req);
  // Always evaluated: a render submitted before cutover still calls back with a
  // URL token, and that delivery must keep working. Registered mode only stops
  // a MISSING token being treated as a forgery — HeyGen calls the bare endpoint
  // there, so absence is expected and the signature is the gate.
  const tokenCheck = verifyCallbackToken(req);

  if (sig.ok || tokenCheck === "ok") {
    if (sig.ok) {
      console.log(`[webhook] Signature verified ✓ (event ${req.headers.get("heygen-event-id") ?? "n/a"})`);
    }
  } else {
    // Diagnostic: distinguishes "not a signed delivery" (header absent — the
    // endpoint is not registered) from "wrong secret" (header present, differs).
    const headerNames = Array.from(req.headers.keys()).join(", ");
    console.warn(`[webhook] SIG DIAG — ${sig.reason}; allHeaders=[${headerNames}]`);

    // Not in registered mode: every legitimate delivery carries a token, so a
    // wrong or absent one is a forgery. In registered mode HeyGen calls the
    // bare endpoint, so absence is normal and the signature rules below decide.
    if (tokenCheck === "bad" && !registeredMode) {
      console.warn("[webhook] Rejected: missing or invalid callback token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Staged rollout: with a secret configured we always check and log, but
    // only reject once HEYGEN_WEBHOOK_ENFORCE="true", so a misconfigured secret
    // cannot silently halt video delivery. Flip it after the logs above confirm
    // a real delivery passes.
    if (process.env.HEYGEN_WEBHOOK_SECRET && process.env.HEYGEN_WEBHOOK_ENFORCE === "true") {
      console.warn("[webhook] Rejected: HeyGen signature invalid or missing");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    if (tokenCheck === "unconfigured" && !process.env.HEYGEN_WEBHOOK_SECRET) {
      console.warn(
        "[webhook] Neither HEYGEN_WEBHOOK_TOKEN nor HEYGEN_WEBHOOK_SECRET is set — " +
        "this endpoint is UNAUTHENTICATED. Set one to turn verification on.",
      );
    } else {
      console.warn("[webhook] Auth check FAILED (monitor mode — processing anyway).");
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

  /**
   * A success with no URL is a failure, and has to be recorded as one.
   *
   * The status was written from the event type alone, so a success payload
   * that carried no video URL produced render_status "completed" beside a
   * null video_url. My Videos gates every action on having both, so the card
   * showed a green Ready badge, offered nothing but Delete, and explained
   * nothing — and because the row was never marked failed, the refund never
   * ran and the video the user paid for was simply gone.
   */
  const successWithoutFile = success && !videoUrl;
  if (successWithoutFile) {
    console.error(
      `[webhook] ${eventType} reported success with no video URL (session=${sessionId} video=${videoId} callback=${callbackId}) — recording as failed so it refunds`,
    );
  }
  const renderStatus = successWithoutFile ? "failed" : success ? "completed" : failed ? "failed" : null;

  console.log(`[webhook] ${eventType} | session=${sessionId} video=${videoId} callback=${callbackId} status=${renderStatus}`);

  // The sidecar SRT arrives on its own event, roughly 12s behind the
  // video-ready one, and used to be logged as an unknown payload and thrown
  // away — which is why Direct Video renders came back with no captions.
  // Stashing it means post-processing finds it waiting rather than asking
  // HeyGen too early, and a later repair run gets it for free.
  if (eventType === "avatar_video_caption.success" && callbackId) {
    const captionUrl: string | undefined = eventData.caption_url || eventData.subtitle_url;
    if (captionUrl) {
      const admin = createAdminClient();
      const { data: row } = await admin
        .from("generated_videos")
        .select("metadata")
        .eq("id", callbackId)
        .single();
      if (row) {
        await admin
          .from("generated_videos")
          .update({ metadata: { ...((row.metadata as Record<string, unknown> | null) ?? {}), caption_url: captionUrl } })
          .eq("id", callbackId);
        console.log(`[webhook] Cached sidecar SRT for ${callbackId}`);
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Video translation (dubbing) events ────────────────────────────────────
  // Handled separately from the avatar-render path below: HeyGen's own docs
  // say the webhook payload for these is minimal and to fetch the resource
  // via GET /v3/video-translations/{id} for the authoritative video_url and
  // status, rather than trusting fields inline on the delivery.
  if (eventType === "video_translate.success" || eventType === "video_translate.fail") {
    const translationId: string | undefined = eventData.video_translation_id || eventData.id;
    const tCallbackId: string | undefined = eventData.callback_id || body.callback_id;

    console.log(`[webhook] ${eventType} | translation=${translationId} callback=${tCallbackId}`);

    const stored = await findStoredRow(admin, { callbackId: tCallbackId, videoId: translationId });
    if (stored?.video_url && !isHeygenUrl(stored.video_url)) {
      console.log(`[webhook] Translation already stored, ignoring duplicate ${eventType}`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    let tRow: { id: string; metadata: Record<string, unknown> | null } | null = null;
    if (tCallbackId) {
      const { data } = await admin
        .from("generated_videos")
        .select("id, metadata")
        .eq("id", tCallbackId)
        .maybeSingle();
      tRow = data;
    }
    if (!tRow && translationId) {
      const { data } = await admin
        .from("generated_videos")
        .select("id, metadata")
        .eq("render_job_id", translationId)
        .maybeSingle();
      tRow = data;
    }

    if (!tRow) {
      console.warn(`[webhook] No video row matched for translation event ${eventType}`);
      return NextResponse.json({ received: true });
    }

    if (eventType === "video_translate.fail") {
      let reason = "Translation failed";
      try {
        if (translationId) {
          const status = await getVideoTranslationStatus(translationId);
          if (status.error) reason = status.error;
        }
      } catch { /* fall back to generic reason below */ }

      await admin
        .from("generated_videos")
        .update({ render_status: "failed", metadata: { ...(tRow.metadata ?? {}), render_error: reason } })
        .eq("id", tRow.id);
      console.warn(`[webhook] Translation ${tRow.id} failed: ${reason}`);
      await refundVideoCredits(admin, tRow.id);
      return NextResponse.json({ received: true });
    }

    // success — resolve the authoritative video_url before storing permanently.
    try {
      const status = translationId ? await getVideoTranslationStatus(translationId) : null;
      if (!status?.videoUrl) throw new Error("HeyGen reported success with no video_url");

      // Translations arrive fully dubbed and lip-synced — no photo/music
      // compositing or caption burn-in applies, unlike avatar renders.
      const permanentUrl = await downloadAndStoreVideo(status.videoUrl, tRow.id, {});
      await admin
        .from("generated_videos")
        .update({ render_status: "completed", video_url: permanentUrl || status.videoUrl })
        .eq("id", tRow.id);
      console.log(`[webhook] Translation ${tRow.id} stored`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Translation storage failed";
      console.error(`[webhook] Translation ${tRow.id} post-processing failed:`, msg);
      await admin
        .from("generated_videos")
        .update({ render_status: "failed", metadata: { ...(tRow.metadata ?? {}), render_error: msg } })
        .eq("id", tRow.id);
      await refundVideoCredits(admin, tRow.id);
    }

    return NextResponse.json({ received: true });
  }

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
    const stored = await findStoredRow(admin, { callbackId, videoId, sessionId });
    if (stored?.video_url && !isHeygenUrl(stored.video_url)) {
      console.log(`[webhook] Already stored, ignoring duplicate ${eventType} (callback=${callbackId})`);
      // The video is done, but the thumbnail step below never ran for it: this
      // branch is also how a render finalized by the status poll or the repair
      // path gets here, and those don't generate one.
      if (stored.project_id && stored.user_id) {
        await ensureProjectThumbnail(stored.project_id, stored.user_id);
      }
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
  // successWithoutFile joins this branch: a success event with no file is a
  // failed render however it was labelled, and it must refund like one.
  if (failed || successWithoutFile) {
    const reason = successWithoutFile
      ? "The render finished but no video file was delivered. Nothing was charged — please try again."
      : failureDetail || `${eventType} (no detail in payload)`;
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
      .update({ status: success && !successWithoutFile ? "ready" : "error" })
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
    //  - captions: burned in at a readable size from the sidecar SRT, or from
    //    a transcript when HeyGen has no SRT to give.
    const storeOpts = await buildStoreOptions(video.metadata, videoId);
    const permanentUrl = await downloadAndStoreVideo(videoUrl, video.id, storeOpts);
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
  // Skipped when the project already has one — the user may have made their
  // own in AI Tools. Failures never affect the render result.
  if (success && video.project_id && video.user_id) {
    await ensureProjectThumbnail(video.project_id, video.user_id);
  }

  console.log(`[webhook] Processed ${eventType}: row ${video.id} → ${renderStatus}`);
  return NextResponse.json({ received: true });
}
