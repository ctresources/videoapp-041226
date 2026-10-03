import type { SupabaseClient } from "@supabase/supabase-js";
import { publishStatus, type PlatformResult, type PublishAccepted } from "@/lib/api/upload-post";

/**
 * Settling a hand-off: turning the "posting" rows written when a post was
 * sent into "posted" or "failed" once the platforms have answered.
 *
 * Two things call this, on purpose. The webhook is the fast path. The status
 * check from the Publish window is the path that still works if a webhook is
 * lost, late or not configured yet, so a post never sits on "posting" forever
 * with nothing able to move it.
 */

/** upload_request_id as stored: which kind of reference it is, then the id. */
export function storeRef(ref: PublishAccepted): string {
  return ref.jobId ? `job:${ref.jobId}` : `req:${ref.requestId}`;
}

export function parseRef(stored: string): PublishAccepted {
  return stored.startsWith("job:") ? { jobId: stored.slice(4) } : { requestId: stored.replace(/^req:/, "") };
}

/**
 * A platform's own failure text as something to show an agent.
 *
 * The raw text is kept in the log. It sometimes names the partner or links to
 * its dashboard, which a customer has no login for, so it is matched to a
 * plain sentence rather than passed through.
 */
export function plainPostError(raw: string | undefined, skipped: boolean): string {
  if (skipped) return "That account isn't connected. Connect it in Settings, then post again.";
  const r = raw ?? "";
  if (/expired|reauth|re-auth|reconnect|revoked|token/i.test(r)) return "That account needs to be reconnected. Open Settings and connect it again.";
  if (/page/i.test(r) && /select|pick|choose|required|missing/i.test(r)) return "Choose which Page to post to: open Settings, then Connect accounts, and pick it there.";
  if (/location/i.test(r) && /select|pick|choose|required|missing|several/i.test(r)) return "Choose which business location to post to: open Settings, then Connect accounts, and pick it there.";
  if (/MEDIA_LIMITS|too long|duration|too large|file size/i.test(r)) return "That video is too long or too large for this platform.";
  if (/business|creator|professional account/i.test(r)) return "This needs a Business or Creator account. Switch the account type, reconnect it, then post again.";
  if (/daily|limit|quota|cap\b/i.test(r)) return "That platform's posting limit was reached. Try again tomorrow.";
  return "The platform didn't accept the post. Try again, or reconnect the account in Settings.";
}

export interface SettledRow {
  platform: string;
  status: "posting" | "scheduled" | "posted" | "failed";
  url?: string;
  error?: string;
}

/**
 * Applies results to the rows of one hand-off and reports where each stands.
 * Only rows still waiting are touched, so a late or repeated result never
 * overwrites one already settled.
 */
export async function settleFromResults(
  admin: SupabaseClient,
  userId: string,
  storedRef: string,
  results: PlatformResult[],
): Promise<SettledRow[]> {
  const { data: rows } = await admin
    .from("social_posts")
    .select("id, platform, post_status, post_url, error_message")
    .eq("user_id", userId)
    .eq("upload_request_id", storedRef);

  const out: SettledRow[] = [];
  for (const row of (rows ?? []) as { id: string; platform: string; post_status: SettledRow["status"]; post_url: string | null; error_message: string | null }[]) {
    const result = results.find((r) => r.platform === row.platform);
    const waiting = row.post_status === "posting" || row.post_status === "scheduled";
    if (!waiting || !result?.done) {
      out.push({ platform: row.platform, status: row.post_status, url: row.post_url ?? undefined, error: row.error_message ?? undefined });
      continue;
    }
    if (result.success) {
      await admin.from("social_posts").update({
        post_status: "posted",
        posted_at: new Date().toISOString(),
        post_url: result.url ?? null,
        platform_post_id: result.postId ?? null,
        error_message: null,
      }).eq("id", row.id);
      out.push({ platform: row.platform, status: "posted", url: result.url });
    } else {
      if (result.error) console.error(`[social] ${row.platform} failed for ${userId}: ${result.error}`);
      const message = plainPostError(result.error, result.skipped);
      await admin.from("social_posts").update({ post_status: "failed", error_message: message }).eq("id", row.id);
      out.push({ platform: row.platform, status: "failed", error: message });
    }
  }
  return out;
}

/** Asks the partner where a hand-off stands and settles whatever has finished. */
export async function settleByRef(admin: SupabaseClient, userId: string, storedRef: string): Promise<SettledRow[]> {
  const results = await publishStatus(parseRef(storedRef));
  return settleFromResults(admin, userId, storedRef, results ?? []);
}
