import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userIdFromProfile, verifyWebhook } from "@/lib/api/upload-post";
import { plainPostError } from "@/lib/api/social-settle";

/**
 * POST /api/social/webhook — results from the publishing partner.
 *
 * One delivery per platform per post, saying it went live (with its link) or
 * why it did not. This is the fast path that turns a "posting" row into
 * "posted" or "failed" without anyone having the Publish window open.
 *
 * Signed: nothing is read from the body until the signature over its raw
 * bytes checks out, and the route refuses everything until the signing secret
 * is configured. Answers quickly and with 200 even for events it has no use
 * for, because five failed deliveries pause the partner's webhook for half an
 * hour and the ones skipped meanwhile are never sent again.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const ok = verifyWebhook(
    raw,
    req.headers.get("x-upload-post-timestamp"),
    req.headers.get("x-upload-post-signature"),
  );
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: {
    event?: string; profile_username?: string; platform?: string;
    result?: { success?: boolean; url?: string | null; post_id?: string | null; publish_id?: string | null; error?: string | null };
  };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  if (event.event !== "upload_completed" || !event.platform || !event.result) {
    // Connections and disconnections are read live from the partner whenever
    // the accounts list is opened, so there is nothing to store for them.
    return NextResponse.json({ ok: true });
  }

  const userId = userIdFromProfile(event.profile_username ?? "");
  if (!userId) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  /**
   * The oldest post still waiting on this platform for this user.
   *
   * The payload names the profile and the platform but not our request id, so
   * the row is found by what is still open. Results arrive in the order posts
   * were sent, which makes the oldest waiting row the one this is about; and
   * if two were ever crossed, the status check settles each by its own id.
   */
  const waiting = () => admin
    .from("social_posts")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", event.platform!)
    .not("upload_request_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  // A post sent now comes before one scheduled for later: a scheduled row is
  // older than the post that was just sent, and only counts once it is due.
  let { data: row } = await waiting().eq("post_status", "posting").maybeSingle();
  if (!row) {
    ({ data: row } = await waiting()
      .eq("post_status", "scheduled")
      .lte("scheduled_at", new Date(Date.now() + 5 * 60 * 1000).toISOString())
      .maybeSingle());
  }
  const id = (row as { id: string } | null)?.id;
  if (!id) return NextResponse.json({ ok: true });

  const r = event.result;
  if (r.success) {
    await admin.from("social_posts").update({
      post_status: "posted",
      posted_at: new Date().toISOString(),
      post_url: r.url && /^https?:\/\//.test(r.url) ? r.url : null,
      platform_post_id: r.post_id ?? r.publish_id ?? null,
      error_message: null,
    }).eq("id", id);
  } else {
    if (r.error) console.error(`[social/webhook] ${event.platform} failed for ${userId}: ${r.error}`);
    await admin.from("social_posts").update({
      post_status: "failed",
      error_message: plainPostError(r.error ?? undefined, false),
    }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
