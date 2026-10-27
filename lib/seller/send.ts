import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBoldTrailToken, sendBoldTrailEmail, sendBoldTrailText } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { sellerUpdateAsHtml, type SellerStats, type SellerUpdateEmail } from "@/lib/utils/newsletter-html";

type BtContact = { id: string; name: string; email: string };
type Row = {
  update_on: string; views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null; email: SellerUpdateEmail | null;
  video_url: string | null; video_poster_url: string | null; video_seconds: number | null;
};
const COLS = "update_on, views, saves, showings, open_house_visitors, offers, email, video_url, video_poster_url, video_seconds";
const statsOf = (r: Row): SellerStats => ({ views: r.views, saves: r.saves, showings: r.showings, openHouse: r.open_house_visitors, offers: r.offers });

export type SendResult =
  | { ok: true; sentAt: string; results: { id: string; name: string; email: boolean; text: boolean | null; error?: string }[] }
  | { ok: false; status: number; error: string; results?: unknown };

/**
 * Sends one listing's update for one day to its sellers through the agent's
 * BoldTrail (2026-10-15; shared since 2026-10-26 by Spark Tools' Send button
 * and AutoSparks' approved seller updates). Each seller gets their own email,
 * built from the saved update exactly as the preview shows it, video
 * included; with alsoText, a one-line text follows. When and to whom it went
 * is kept on the update.
 */
export async function sendSellerUpdate(
  admin: SupabaseClient,
  userId: string,
  listingId: string,
  updateOn: string,
  opts: { subjectIdx?: number; alsoText?: boolean } = {},
): Promise<SendResult> {
  const { data: listing } = await admin
    .from("seller_listings")
    .select("id, address, boldtrail_contacts")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!listing) return { ok: false, status: 404, error: "Listing not found" };
  const contacts = (listing.boldtrail_contacts ?? []) as BtContact[];
  if (!contacts.length) return { ok: false, status: 400, error: "Add the sellers from BoldTrail first." };

  const { data: rows } = await admin
    .from("seller_listing_updates")
    .select(COLS)
    .eq("listing_id", listingId)
    .lte("update_on", updateOn)
    .order("update_on", { ascending: false })
    .limit(2);
  const list = (rows ?? []) as Row[];
  const current = list.find((r) => r.update_on === updateOn);
  const before = list.find((r) => r.update_on < updateOn);
  if (!current?.email) return { ok: false, status: 400, error: "Write the update first." };

  const token = await loadBoldTrailToken(admin, userId);
  if (!token) return { ok: false, status: 400, error: "Connect BoldTrail in Settings first." };

  const email = current.email;
  const subject = email.subjects[Math.max(0, Math.min(Number(opts.subjectIdx) || 0, email.subjects.length - 1))] ?? `${listing.address}: your update`;
  const signature = await loadAgentSignature(admin, userId);
  const html = sellerUpdateAsHtml(email, {
    subject,
    stats: statsOf(current),
    before: before ? statsOf(before) : null,
    signature,
    video: current.video_url ? { url: current.video_url, posterUrl: current.video_poster_url, seconds: current.video_seconds } : null,
  });

  const results: { id: string; name: string; email: boolean; text: boolean | null; error?: string }[] = [];
  for (const c of contacts) {
    const sent = await sendBoldTrailEmail(token, c.id, subject, html);
    let texted: boolean | null = null;
    if (sent.ok && opts.alsoText) {
      const first = c.name.split(/\s+/)[0];
      const t = await sendBoldTrailText(token, c.id, `Hi${first && !first.includes("@") ? ` ${first}` : ""}, I just emailed your update for ${listing.address}.`);
      texted = t.ok;
    }
    results.push({ id: c.id, name: c.name, email: sent.ok, text: texted, ...(sent.ok ? {} : { error: `BoldTrail said ${sent.status}` }) });
    if (!sent.ok) console.error("[seller-send] email failed", c.id, sent.status, sent.text);
  }

  const delivered = results.filter((r) => r.email);
  const sentAt = new Date().toISOString();
  if (delivered.length) {
    await admin
      .from("seller_listing_updates")
      .update({ sent_at: sentAt, sent_to: results })
      .eq("listing_id", listingId)
      .eq("update_on", updateOn);
  }
  await admin.from("api_usage_log").insert({
    user_id: userId, api_provider: "boldtrail", endpoint: "seller_update_send", credits_used: 0,
    response_status: delivered.length === results.length ? 200 : 207,
  });

  if (!delivered.length) return { ok: false, status: 502, error: "BoldTrail didn't send it. Check BoldTrail is still connected in Settings.", results };
  return { ok: true, sentAt, results };
}
