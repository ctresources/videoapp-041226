import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { writeSellerUpdate } from "@/lib/api/seller-update";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import type { SellerStats } from "@/lib/utils/newsletter-html";

// One model call, well under a minute.
export const maxDuration = 60;

/**
 * One listing's week, for the Seller Update (2026-10-15).
 *
 *   GET  ?listingId=&weekOf=YYYY-MM-DD   the listing, this week's row if there
 *                                         is one, last week's, and the sign-off
 *   POST { listingId, weekOf, views, saves, showings, openHouse, offers,
 *          feedback, nextSteps }          saves the week and writes the email
 *
 * weekOf is that week's Monday, worked out in the agent's browser so the week
 * turns over on their calendar, not the server's. Writing the same week again
 * replaces its numbers and email.
 */

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
};
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type Row = {
  week_of: string; views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null; feedback: string | null;
  next_steps: string | null; email: unknown;
};
const statsOf = (r: Row | null | undefined): SellerStats | null =>
  r ? { views: r.views, saves: r.saves, showings: r.showings, openHouse: r.open_house_visitors, offers: r.offers } : null;

/** Whole days from the list date to the end of the week being reported. */
function daysOnMarket(listedOn: string | null, weekOf: string): number | null {
  if (!listedOn) return null;
  const end = new Date(`${weekOf}T00:00:00Z`).getTime() + 6 * 86_400_000;
  const today = Date.now();
  const days = Math.floor((Math.min(end, today) - new Date(`${listedOn}T00:00:00Z`).getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

async function load(admin: ReturnType<typeof createAdminClient>, userId: string, listingId: string, weekOf: string) {
  const { data: listing } = await admin
    .from("seller_listings")
    .select("id, address, seller_names, list_price, listed_on")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!listing) return null;
  const { data: rows } = await admin
    .from("seller_listing_updates")
    .select("week_of, views, saves, showings, open_house_visitors, offers, feedback, next_steps, email")
    .eq("listing_id", listingId)
    .lte("week_of", weekOf)
    .order("week_of", { ascending: false })
    .limit(2);
  const list = (rows ?? []) as Row[];
  const current = list.find((r) => r.week_of === weekOf) ?? null;
  const before = list.find((r) => r.week_of < weekOf) ?? null;
  const { count } = await admin
    .from("seller_listing_updates")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId)
    .lt("week_of", weekOf);
  return { listing, current, before, earlierWeeks: count ?? 0 };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const listingId = params.get("listingId") ?? "";
  const weekOf = params.get("weekOf") ?? "";
  if (!listingId || !isDate(weekOf)) return NextResponse.json({ error: "listingId and weekOf are required" }, { status: 400 });

  const admin = createAdminClient();
  const found = await load(admin, user.id, listingId, weekOf);
  if (!found) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const signature = await loadAgentSignature(admin, user.id);
  return NextResponse.json({
    listing: found.listing,
    current: found.current,
    before: found.before,
    daysOnMarket: daysOnMarket(found.listing.listed_on, weekOf),
    signature,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const listingId = text(body.listingId, 64);
  const weekOf = body.weekOf;
  if (!listingId || !isDate(weekOf)) return NextResponse.json({ error: "listingId and weekOf are required" }, { status: 400 });

  const stats: SellerStats = {
    views: num(body.views), saves: num(body.saves), showings: num(body.showings),
    openHouse: num(body.openHouse), offers: num(body.offers),
  };
  const feedback = text(body.feedback);
  const nextSteps = text(body.nextSteps);
  if (Object.values(stats).every((v) => v === null) && !feedback && !nextSteps) {
    return NextResponse.json({ error: "Fill in at least one number or a note first." }, { status: 400 });
  }

  const admin = createAdminClient();
  const found = await load(admin, user.id, listingId, weekOf);
  if (!found) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  // The numbers are saved before the model is asked, so they are kept even
  // when the writing fails or the trial window has closed.
  const row = {
    listing_id: listingId, user_id: user.id, week_of: weekOf,
    views: stats.views, saves: stats.saves, showings: stats.showings,
    open_house_visitors: stats.openHouse, offers: stats.offers,
    feedback: feedback || null, next_steps: nextSteps || null,
    updated_at: new Date().toISOString(),
  };
  const { error: saveErr } = await admin.from("seller_listing_updates").upsert(row, { onConflict: "listing_id,week_of" });
  if (saveErr) {
    console.error("[seller-update] save failed:", saveErr.message);
    return NextResponse.json({ error: "Couldn't save this week's numbers." }, { status: 500 });
  }

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const signature = await loadAgentSignature(admin, user.id);
  const before = statsOf(found.before);
  const dom = daysOnMarket(found.listing.listed_on, weekOf);
  const email = await writeSellerUpdate({
    address: found.listing.address,
    sellerNames: found.listing.seller_names,
    listPrice: found.listing.list_price,
    daysOnMarket: dom,
    weekNumber: found.earlierWeeks + 1,
    stats,
    before,
    feedback,
    nextSteps,
    agentName: signature.name,
  });
  if (!email) return NextResponse.json({ error: "Your numbers are saved, but the email couldn't be written. Please try again." }, { status: 502 });

  await admin.from("seller_listing_updates").update({ email }).eq("listing_id", listingId).eq("week_of", weekOf);
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "perplexity", endpoint: "seller_update", credits_used: 0, response_status: 200,
  });
  return NextResponse.json({ email, stats, before, daysOnMarket: dom, signature });
}
