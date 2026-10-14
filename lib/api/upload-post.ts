import crypto from "node:crypto";
import type { PartnerPlatform } from "@/lib/utils/social-platforms";

/**
 * Upload-Post: the publishing partner behind every platform except YouTube.
 *
 * One API key, held by us. Each customer gets one "profile" there, which holds
 * all the accounts they connect, and connects them on a page that carries our
 * logo. They never sign up with Upload-Post and never see its name in our UI
 * (see no-vendor-names: every message thrown from here that can reach a user
 * is a plain sentence, and the raw reason goes to the log).
 *
 * Everything is inert without UPLOAD_POST_API_KEY: uploadPostConfigured() is
 * what every caller checks first, so the app behaves exactly as it did before
 * until the key exists.
 */

const BASE = "https://api.upload-post.com";

export function uploadPostConfigured(): boolean {
  return !!process.env.UPLOAD_POST_API_KEY;
}

/**
 * A customer's profile name, derived from their user id and never stored.
 *
 * The profiles table is writable by its owner. A name read back from it could
 * be changed to another user's, and their next post would go out on someone
 * else's accounts with our key. Deriving it makes that impossible: the only
 * profile a session can ever address is its own.
 */
export function profileUsername(userId: string): string {
  return `sr_${userId.replace(/-/g, "")}`;
}

/** The user a profile belongs to, for webhooks, which only carry the profile name. */
export function userIdFromProfile(username: string): string | null {
  const m = /^sr_([0-9a-f]{32})$/.exec(username);
  if (!m) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** An error whose message is safe to show; `raw` is the partner's own wording, for the log. */
export class SocialPublishError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly raw?: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) throw new SocialPublishError("Posting to more platforms isn't set up yet.", 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Apikey ${key}`, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (err) {
    throw new SocialPublishError(
      "We couldn't reach the publishing service. Try again in a moment.",
      504, undefined, err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* a non-JSON error page */ }

  if (!res.ok) {
    const raw = String(data.message ?? data.error ?? text.slice(0, 300));
    const code = typeof data.error_code === "string" ? data.error_code : undefined;
    console.error(`[upload-post] ${init.method ?? "GET"} ${path} -> ${res.status}: ${raw}`);
    throw new SocialPublishError(plainReason(res.status, code, raw), res.status, code, raw);
  }
  return data as T;
}

/** A partner error as a sentence an agent can act on, with no vendor in it. */
function plainReason(status: number, code: string | undefined, raw: string): string {
  if (code === "PROFILE_LIMIT_REACHED") return "We're at capacity for new connections right now. We've been told, and it will open up shortly.";
  if (status === 429) return "That's the posting limit for now. Try again a little later.";
  if (status === 401) return "Posting to more platforms isn't available right now. We've been told.";
  if (/no .* account configured|not configured/i.test(raw)) return "That account isn't connected. Connect it in Settings, then try again.";
  if (/expired|reauth|re-auth|token/i.test(raw)) return "That account needs to be reconnected. Open Settings and connect it again.";
  if (code === "MEDIA_LIMITS") return "That video is too long or too large for this platform.";
  return "The post couldn't be sent. Try again in a moment.";
}

// ── Profiles ────────────────────────────────────────────────────────────────

/** One connected account as the partner reports it. Empty string or null means not connected. */
export interface ConnectedAccount {
  display_name?: string;
  handle?: string;
  username?: string;
  social_images?: string;
  reauth_required?: boolean;
}

export interface PartnerProfile {
  username: string;
  social_accounts: Record<string, ConnectedAccount | string | null>;
}

/** Creates the profile if it does not exist. Safe to call again: "already exists" is success. */
export async function ensureProfile(username: string): Promise<void> {
  try {
    await call("/api/uploadposts/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  } catch (err) {
    if (err instanceof SocialPublishError && err.status === 409) return;
    throw err;
  }
}

export async function getProfile(username: string): Promise<PartnerProfile | null> {
  try {
    const data = await call<{ profile: PartnerProfile }>(`/api/uploadposts/users/${encodeURIComponent(username)}`);
    return data.profile ?? null;
  } catch (err) {
    if (err instanceof SocialPublishError && err.status === 404) return null;
    throw err;
  }
}

/** Deletes the profile and every connection in it, which frees its slot at once. */
export async function deleteProfile(username: string): Promise<void> {
  try {
    await call("/api/uploadposts/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  } catch (err) {
    if (err instanceof SocialPublishError && err.status === 404) return;
    throw err;
  }
}

/** How full the plan is, for the capacity alert. */
export async function profileUsage(): Promise<{ used: number; limit: number }> {
  const data = await call<{ profiles?: unknown[]; limit?: number }>("/api/uploadposts/users");
  return { used: data.profiles?.length ?? 0, limit: data.limit ?? 0 };
}

/** The plan the key belongs to, as the partner names it. Also proves the key is accepted. */
export async function accountPlan(): Promise<string | null> {
  const data = await call<{ plan?: unknown }>("/api/uploadposts/me");
  return typeof data.plan === "string" ? data.plan : null;
}

// ── Where a platform's posts go ─────────────────────────────────────────────

/** The platforms where one connected account can post to more than one place. */
export type DestinationPlatform = "facebook" | "linkedin" | "google_business";

export interface Destinations {
  options: { id: string; name: string }[];
  /** The id of the chosen option, or null when nothing has been chosen. */
  selected: string | null;
}

const DESTINATIONS: Record<DestinationPlatform, {
  path: string; list: string; idKey: string; nameKey: string; selectedKey: string; bodyKey: string;
}> = {
  facebook: {
    path: "/api/uploadposts/users/facebook-page", list: "pages",
    idKey: "id", nameKey: "name", selectedKey: "selected_page_id", bodyKey: "facebook_page_id",
  },
  linkedin: {
    path: "/api/uploadposts/users/linkedin-page", list: "pages",
    idKey: "id", nameKey: "name", selectedKey: "selected_page_id", bodyKey: "linkedin_page_id",
  },
  google_business: {
    path: "/api/uploadposts/users/google-business-location", list: "locations",
    idKey: "name", nameKey: "title", selectedKey: "selected_location_id", bodyKey: "gbp_location_id",
  },
};

/**
 * The last part of an id. The partner accepts and returns the same place in
 * more than one form ("urn:li:organization:12" or "12", "accounts/9/locations/4"
 * or "4"), so two ids are the same place when their last parts match.
 */
const idTail = (id: string) => id.split(/[/:]/).pop() ?? id;

/**
 * The places a connected account can post to, and the one chosen.
 *
 * The choice is kept by the partner against the profile and used for every
 * post from then on, so nothing has to be sent with each one. Empty when the
 * platform is not connected.
 */
export async function getDestinations(username: string, platform: DestinationPlatform): Promise<Destinations> {
  const d = DESTINATIONS[platform];
  let data: Record<string, unknown>;
  try {
    data = await call(`${d.path}?profile_username=${encodeURIComponent(username)}`);
  } catch (err) {
    if (err instanceof SocialPublishError && (err.status === 404 || err.status === 400)) return { options: [], selected: null };
    throw err;
  }
  const list = Array.isArray(data[d.list]) ? data[d.list] as Record<string, unknown>[] : [];
  const options = list
    .map((o) => ({ id: String(o[d.idKey] ?? ""), name: String(o[d.nameKey] ?? o[d.idKey] ?? "") }))
    .filter((o) => o.id);
  const raw = typeof data[d.selectedKey] === "string" && data[d.selectedKey] ? String(data[d.selectedKey]) : null;
  const match = raw ? options.find((o) => o.id === raw || idTail(o.id) === idTail(raw)) : undefined;
  return { options, selected: match?.id ?? raw };
}

/** Chooses where a platform's posts go; null clears the choice. */
export async function setDestination(username: string, platform: DestinationPlatform, id: string | null): Promise<void> {
  const d = DESTINATIONS[platform];
  await call(d.path, {
    method: id ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { profile_username: username, [d.bodyKey]: id } : { profile_username: username }),
  });
}

/**
 * A single-use link (valid 48 hours) to the page where the customer connects
 * their accounts. The page carries our logo and wording; the platforms' own
 * consent screens name the partner's app, which nothing can change.
 */
export async function connectUrl(username: string, opts: {
  redirectUrl: string;
  logoUrl: string;
  platforms: PartnerPlatform[];
}): Promise<string> {
  const data = await call<{ access_url: string }>("/api/uploadposts/users/generate-jwt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      redirect_url: opts.redirectUrl,
      logo_image: opts.logoUrl,
      redirect_button_text: "Back to SparkReels",
      connect_title: "Connect your accounts",
      connect_description: "Choose where SparkReels can publish your videos. You approve every post before it goes out.",
      platforms: opts.platforms,
      // The partner's calendar would be a second place to schedule from, with
      // posts our own records know nothing about.
      show_calendar: false,
    }),
  });
  return data.access_url;
}

/**
 * The approval link for one platform, for our own connect buttons.
 *
 * The partner's Connect API (2026-10-14, on their advice): the customer goes
 * from Settings straight to that platform's own approval screen and back,
 * with no partner page in between. The approval screen still names the
 * partner, and always will; their reply was that it cannot be changed on any
 * plan. The link is good for 15 minutes and for one attempt, so a fresh one
 * is asked for on every press.
 *
 * Their path spells Google Business with a hyphen; everywhere else, including
 * the profile they report back, it has an underscore.
 */
export async function startConnect(username: string, platform: PartnerPlatform, redirectUrl: string): Promise<string> {
  const slug = platform === "google_business" ? "google-business" : platform;
  const data = await call<{ authorize_url?: string }>(`/api/uploadposts/oauth/${slug}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: username, redirect_url: redirectUrl }),
  });
  if (!data.authorize_url) throw new SocialPublishError("That platform couldn't be opened. Try again in a moment.", 502);
  return data.authorize_url;
}

/** Unlinks one platform. The profile and every other connection stay. */
export async function disconnectAccount(username: string, platform: PartnerPlatform): Promise<void> {
  await call("/api/uploadposts/users/social", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_username: username, social_platform: platform }),
  });
}

// ── Publishing ──────────────────────────────────────────────────────────────

export interface PublishCommon {
  username: string;
  platforms: PartnerPlatform[];
  /** Our id for this hand-off; the result is looked up by it. */
  requestId: string;
  /** The caption on most platforms. */
  title: string;
  /** Longer text, used by LinkedIn and Facebook. */
  description?: string;
  /** ISO time to publish at; omit to publish now. */
  scheduledAt?: string | null;
  /** Per-platform fields, already named as the API expects them. */
  extra?: Record<string, string>;
}

export interface PublishAccepted {
  /** Present for an immediate post. */
  requestId?: string;
  /** Present for a scheduled one. */
  jobId?: string;
}

function baseForm(p: PublishCommon): FormData {
  const form = new FormData();
  form.append("user", p.username);
  for (const platform of p.platforms) form.append("platform[]", platform);
  form.append("title", p.title);
  if (p.description) form.append("description", p.description);
  // Always in the background: a video is fetched and transcoded per platform,
  // which outlasts any request we would want to hold open.
  form.append("async_upload", "true");
  form.append("request_id", p.requestId);
  form.append("external_id", p.requestId);
  if (p.scheduledAt) form.append("scheduled_date", p.scheduledAt);
  for (const [k, v] of Object.entries(p.extra ?? {})) form.append(k, v);
  return form;
}

function accepted(data: Record<string, unknown>, fallbackRequestId: string): PublishAccepted {
  if (typeof data.job_id === "string") return { jobId: data.job_id };
  return { requestId: typeof data.request_id === "string" ? data.request_id : fallbackRequestId };
}

/** Hands a video (by public URL) to one or more platforms. */
export async function publishVideo(p: PublishCommon & { videoUrl: string }): Promise<PublishAccepted> {
  const form = baseForm(p);
  form.append("video", p.videoUrl);
  const data = await call<Record<string, unknown>>("/api/upload", {
    method: "POST",
    body: form,
    // The same request retried returns the first job rather than posting twice.
    headers: { "Idempotency-Key": p.requestId },
    timeoutMs: 55_000,
  });
  return accepted(data, p.requestId);
}

/** Hands a photo post to one or more platforms: a public URL, or the image itself. */
export async function publishPhoto(p: PublishCommon & { photo: string | { bytes: ArrayBuffer | Uint8Array; filename: string } }): Promise<PublishAccepted> {
  const form = baseForm(p);
  if (typeof p.photo === "string") form.append("photos[]", p.photo);
  else form.append("photos[]", new Blob([new Uint8Array(p.photo.bytes)], { type: "image/png" }), p.photo.filename);
  const data = await call<Record<string, unknown>>("/api/upload_photos", {
    method: "POST",
    body: form,
    headers: { "Idempotency-Key": p.requestId },
    timeoutMs: 55_000,
  });
  return accepted(data, p.requestId);
}

/** One photo, already read and encoded as a JPEG. */
export interface PhotoFile { bytes: Uint8Array; filename: string }

/** Hands several photos to one or more platforms as a single post. */
export async function publishPhotos(p: PublishCommon & { photos: PhotoFile[] }): Promise<PublishAccepted> {
  const form = baseForm(p);
  for (const photo of p.photos) {
    form.append("photos[]", new Blob([new Uint8Array(photo.bytes)], { type: "image/jpeg" }), photo.filename);
  }
  const data = await call<Record<string, unknown>>("/api/upload_photos", {
    method: "POST",
    body: form,
    headers: { "Idempotency-Key": p.requestId },
    timeoutMs: 90_000,
  });
  return accepted(data, p.requestId);
}

export interface PlatformResult {
  platform: string;
  /** Finished one way or the other; false while still queued or processing. */
  done: boolean;
  success: boolean;
  /** Not connected, so never attempted. */
  skipped: boolean;
  url?: string;
  postId?: string;
  error?: string;
}

/** Where a hand-off has got to, per platform. Null when the partner has no record of it yet. */
export async function publishStatus(ref: PublishAccepted): Promise<PlatformResult[] | null> {
  const query = ref.jobId ? `job_id=${encodeURIComponent(ref.jobId)}` : `request_id=${encodeURIComponent(ref.requestId ?? "")}`;
  let data: { status?: string; results?: Record<string, unknown>[] };
  try {
    data = await call(`/api/uploadposts/status?${query}`);
  } catch (err) {
    if (err instanceof SocialPublishError && err.status === 404) return null;
    throw err;
  }
  return (data.results ?? []).map((r) => {
    const status = String(r.status ?? "");
    const skipped = r.skipped === true || status === "skipped";
    const failed = status === "failed" || (r.success === false && !skipped && status !== "queued" && status !== "processing" && status !== "retryable");
    const url = [r.url, r.post_url].find((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
    const succeeded = !failed && !skipped && (status === "completed" || !!url || (r.success === true && status === ""));
    return {
      platform: String(r.platform ?? ""),
      done: succeeded || failed || skipped,
      success: succeeded,
      skipped,
      url,
      postId: [r.post_id, r.publish_id].find((v): v is string => typeof v === "string"),
      error: typeof r.error === "string" ? r.error : typeof r.message === "string" && failed ? r.message : undefined,
    };
  });
}

/**
 * Changes the text of a post that is already up. Facebook and LinkedIn only:
 * Instagram, TikTok and Threads do not allow it, and X allows it for thirty
 * minutes on a paid account, which is not worth offering.
 */
export async function editPost(p: {
  username: string; platform: "facebook" | "linkedin"; postId: string; text: string;
}): Promise<void> {
  await call("/api/uploadposts/posts/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: p.platform,
      user: p.username,
      post_id: p.postId,
      ...(p.platform === "facebook" ? { message: p.text } : { commentary: p.text }),
    }),
  });
}

export interface PostMetrics {
  /** The figures as the platform names them: views, reach, reactions, saves… */
  metrics: Record<string, unknown>;
  platformPostId?: string;
  url?: string;
}

/**
 * What one platform reports for one post.
 *
 * Asked by the request the post was sent under when we have it, and by the
 * platform's own id for the post otherwise (a scheduled post is stored under
 * its job, not its request). Null when the platform gave no figures: some
 * never do, and the rest can take hours after posting.
 */
export async function postMetrics(p: {
  username: string; platform: string; requestId?: string; platformPostId?: string;
}): Promise<PostMetrics | null> {
  const read = (data: Record<string, unknown>): PostMetrics | null => {
    const platforms = (data.platforms ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const entry = platforms[p.platform];
    const metrics = entry?.post_metrics;
    if (!entry || !metrics || typeof metrics !== "object") return null;
    return {
      metrics: metrics as Record<string, unknown>,
      platformPostId: typeof entry.platform_post_id === "string" ? entry.platform_post_id : undefined,
      url: typeof entry.post_url === "string" ? entry.post_url : undefined,
    };
  };

  if (p.requestId) {
    try {
      const found = read(await call(`/api/uploadposts/post-analytics/${encodeURIComponent(p.requestId)}?platform=${encodeURIComponent(p.platform)}`));
      if (found) return found;
    } catch (err) {
      if (!(err instanceof SocialPublishError && err.status === 404)) throw err;
    }
  }
  if (p.platformPostId) {
    const query = `platform_post_id=${encodeURIComponent(p.platformPostId)}&platform=${encodeURIComponent(p.platform)}&user=${encodeURIComponent(p.username)}`;
    try {
      return read(await call(`/api/uploadposts/post-analytics?${query}`));
    } catch (err) {
      if (!(err instanceof SocialPublishError && err.status === 404)) throw err;
    }
  }
  return null;
}

/**
 * Cancels a scheduled post before it goes out. One job covers every platform
 * it was scheduled to, so this cancels all of them together.
 *
 * False when the partner has no such job: it already ran, or was already
 * cancelled. The caller has to find out which before saying anything.
 */
export async function cancelScheduled(jobId: string): Promise<boolean> {
  try {
    await call(`/api/uploadposts/schedule/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    return true;
  } catch (err) {
    if (err instanceof SocialPublishError && err.status === 404) return false;
    throw err;
  }
}

// ── Google Business reviews ─────────────────────────────────────────────────

export interface GoogleReview {
  /** The review's full name at Google, which a reply is addressed to. */
  name: string;
  reviewer: string;
  /** 1 to 5. */
  stars: number;
  text: string;
  createdAt: string;
  reply: { text: string; updatedAt: string } | null;
}

const STAR_WORDS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/**
 * A page of reviews for one Google Business location, newest first.
 *
 * The location has to be named. Posting picks the only location by itself,
 * and reading reviews does not: asked without one, the partner answers "No
 * location_id provided and no default location on the account", which is how
 * the first real use of this failed.
 */
export async function listGoogleReviews(username: string, pageToken?: string, locationId?: string | null): Promise<{
  reviews: GoogleReview[]; averageRating: number | null; total: number | null; nextPageToken: string | null;
}> {
  const query = new URLSearchParams({ user: username, pageSize: "50", orderBy: "updateTime desc" });
  if (pageToken) query.set("pageToken", pageToken);
  if (locationId) query.set("location_id", locationId);
  const data = await call<Record<string, unknown>>(`/api/uploadposts/google-business/reviews?${query.toString()}`);

  const list = Array.isArray(data.reviews) ? data.reviews as Record<string, unknown>[] : [];
  const reviews = list.map((r): GoogleReview => {
    const rating = r.starRating;
    const reply = r.reviewReply as { comment?: unknown; updateTime?: unknown } | null | undefined;
    return {
      name: String(r.name ?? ""),
      reviewer: String((r.reviewer as { displayName?: unknown } | undefined)?.displayName ?? ""),
      // Google sends the rating as a word; a number is accepted in case that changes.
      stars: typeof rating === "number" ? rating : STAR_WORDS[String(rating ?? "").toUpperCase()] ?? 0,
      text: String(r.comment ?? ""),
      createdAt: String(r.createTime ?? r.updateTime ?? ""),
      reply: reply && typeof reply.comment === "string" && reply.comment
        ? { text: reply.comment, updatedAt: String(reply.updateTime ?? "") }
        : null,
    };
  }).filter((r) => r.name);

  const average = Number(data.averageRating);
  const total = Number(data.totalReviewCount);
  return {
    reviews,
    averageRating: Number.isFinite(average) && average > 0 ? average : null,
    total: Number.isFinite(total) ? total : null,
    nextPageToken: typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : null,
  };
}

/** Posts the owner's reply under a review, or replaces the one already there. */
export async function replyToGoogleReview(username: string, reviewName: string, text: string): Promise<{ text: string; updatedAt: string }> {
  const data = await call<{ reply?: { comment?: unknown; updateTime?: unknown } }>("/api/uploadposts/google-business/reviews/reply", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: username, review_name: reviewName, comment: text }),
  });
  return {
    text: typeof data.reply?.comment === "string" ? data.reply.comment : "",
    updatedAt: typeof data.reply?.updateTime === "string" ? data.reply.updateTime : "",
  };
}

/** Takes the owner's reply down. The review itself is the reviewer's and stays. */
export async function deleteGoogleReviewReply(username: string, reviewName: string): Promise<void> {
  await call("/api/uploadposts/google-business/reviews/reply", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: username, review_name: reviewName }),
  });
}

// ── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Whether a webhook really came from the partner: HMAC-SHA256 of
 * "<timestamp>.<raw body>" under the signing secret, no older than five
 * minutes. Checked against the raw bytes, before any JSON parsing.
 */
export function verifyWebhook(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.UPLOAD_POST_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const given = signature.replace(/^sha256=/, "");
  if (given.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
