import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken, sendBoldTrailEmail, sendBoldTrailText } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { sellerUpdateAsHtml, type SellerStats, type SellerUpdateEmail } from "@/lib/utils/newsletter-html";

export const maxDuration = 60;

/**
 * Sends a written seller update to the listing's sellers through the agent's
 * BoldTrail (2026-10-15). Only from the agent's own press of "Send now" after
 * a confirmation; nothing here runs on its own.
 *
 * POST { listingId, updateOn, subjectIdx, alsoText }
 *
 * Each seller gets their own email, built here from the saved update exactly
 * as the preview shows it (video included), from the agent's BoldTrail
 * address, and BoldTrail logs it on their contact (confirmed in the owner's
 * test). With alsoText, a one-line text follows from BoldTrail. When and to
 * whom it went is kept on the update.
 */

type BtContact = { id: string; name: string; email: string };
type Row = {
  update_on: string; views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null; email: SellerUpdateEmail | null;
  video_url: string | null; video_poster_url: string | null; video_seconds: number | null;
};
const COLS = "update_on, views, saves, showings, open_house_visitors, offers, email, video_url, video_poster_url, video_seconds";
const statsOf = (r: Row): SellerStats => ({ views: r.views, saves: r.saves, showings: r.showings, openHouse: r.open_house_visitors, offers: r.offers });
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId, updateOn, subjectIdx, alsoText } = (await req.json().catch(() => ({}))) as {
    listingId?: string; updateOn?: string; subjectIdx?: number; alsoText?: boolean;
  };
  if (!listingId || !isDate(updateOn)) return NextResponse.json({ error: "listingId and updateOn are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("seller_listings")
    .select("id, address, boldtrail_contacts")
    .eq("id", listingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const contacts = (listing.boldtrail_contacts ?? []) as BtContact[];
  if (!contacts.length) return NextResponse.json({ error: "Add the sellers from BoldTrail first." }, { status: 400 });

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
  if (!current?.email) return NextResponse.json({ error: "Write the update first." }, { status: 400 });

  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  const email = current.email;
  const subject = email.subjects[Math.max(0, Math.min(Number(subjectIdx) || 0, email.subjects.length - 1))] ?? `${listing.address}: your update`;
  const signature = await loadAgentSignature(admin, user.id);
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
    if (sent.ok && alsoText) {
      const first = c.name.split(/\s+/)[0];
      const t = await sendBoldTrailText(token, c.id, `Hi${first && !first.includes("@") ? ` ${first}` : ""}, I just emailed your update for ${listing.address}.`);
      texted = t.ok;
    }
    results.push({ id: c.id, name: c.name, email: sent.ok, text: texted, ...(sent.ok ? {} : { error: `BoldTrail said ${sent.status}` }) });
    if (!sent.ok) console.error("[seller-send] email failed", c.id, sent.status, sent.text);
  }

  const delivered = results.filter((r) => r.email);
  if (delivered.length) {
    await admin
      .from("seller_listing_updates")
      .update({ sent_at: new Date().toISOString(), sent_to: results })
      .eq("listing_id", listingId)
      .eq("update_on", updateOn);
  }
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "boldtrail", endpoint: "seller_update_send", credits_used: 0,
    response_status: delivered.length === results.length ? 200 : 207,
  });

  if (!delivered.length) return NextResponse.json({ error: "BoldTrail didn't send it. Check BoldTrail is still connected in Settings.", results }, { status: 502 });
  return NextResponse.json({ sentAt: new Date().toISOString(), results });
}
