import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { writeSellerUpdate, writeSellerVideoScript } from "@/lib/api/seller-update";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import type { SellerStats } from "@/lib/utils/newsletter-html";

// One model call, well under a minute.
export const maxDuration = 60;

/**
 * One listing's update for one day, for the Seller Update (2026-10-15).
 *
 *   GET  ?listingId=&updateOn=YYYY-MM-DD   the listing, that day's update if
 *        there is one, the update before it, the dates of past updates, and
 *        the sign-off
 *   POST { listingId, updateOn, views, saves, showings, openHouse, offers,
 *          feedback, nextSteps, action }
 *        action "write" (the default) saves the numbers and writes the email;
 *        "save" only saves them; "script" saves them and writes what to say
 *        in a video update, for the camera
 *
 * An update is dated the day it is written, on the agent's own calendar (the
 * date comes from their browser), so one can go out any day. Writing again on
 * the same day replaces that day's. The numbers compare with the update
 * before it, whenever that was.
 */

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
};
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Row = {
  update_on: string; views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null; feedback: string | null;
  next_steps: string | null; email: unknown;
  video_id: string | null; video_url: string | null; video_poster_url: string | null; video_seconds: number | null;
  sent_at: string | null; sent_to: unknown;
};
const COLS = "update_on, views, saves, showings, open_house_visitors, offers, feedback, next_steps, email, video_id, video_url, video_poster_url, video_seconds, sent_at, sent_to";
const statsOf = (r: Row | null | undefined): SellerStats | null =>
  r ? { views: r.views, saves: r.saves, showings: r.showings, openHouse: r.open_house_visitors, offers: r.offers } : null;

/** Whole days from the list date to the update's date (or today, if sooner). */
function daysOnMarket(listedOn: string | null, updateOn: string): number | null {
  if (!listedOn) return null;
  const end = Math.min(new Date(`${updateOn}T00:00:00Z`).getTime(), Date.now());
  const days = Math.floor((end - new Date(`${listedOn}T00:00:00Z`).getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

async function load(admin: ReturnType<typeof createAdminClient>, userId: string, listingId: string, updateOn: string) {
  const { data: listing } = await admin
    .from("seller_listings")
    .select("id, address, seller_names, list_price, listed_on, boldtrail_contacts")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!listing) return null;
  const { data: rows } = await admin
    .from("seller_listing_updates")
    .select(COLS)
    .eq("listing_id", listingId)
    .lte("update_on", updateOn)
    .order("update_on", { ascending: false })
    .limit(2);
  const list = (rows ?? []) as Row[];
  const current = list.find((r) => r.update_on === updateOn) ?? null;
  const before = list.find((r) => r.update_on < updateOn) ?? null;
  const { data: all } = await admin
    .from("seller_listing_updates")
    .select("update_on, sent_at")
    .eq("listing_id", listingId)
    .order("update_on", { ascending: false })
    .limit(30);
  const dates = (all ?? []).map((r) => r.update_on as string);
  const sentDates = (all ?? []).filter((r) => r.sent_at).map((r) => r.update_on as string);
  return { listing, current, before, dates, sentDates, earlier: dates.filter((d) => d < updateOn).length };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const listingId = params.get("listingId") ?? "";
  const updateOn = params.get("updateOn") ?? "";
  if (!listingId || !isDate(updateOn)) return NextResponse.json({ error: "listingId and updateOn are required" }, { status: 400 });

  const admin = createAdminClient();
  const found = await load(admin, user.id, listingId, updateOn);
  if (!found) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const signature = await loadAgentSignature(admin, user.id);
  return NextResponse.json({
    listing: found.listing,
    current: found.current,
    before: found.before,
    dates: found.dates,
    sentDates: found.sentDates,
    daysOnMarket: daysOnMarket(found.listing.listed_on, updateOn),
    signature,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const listingId = text(body.listingId, 64);
  const updateOn = body.updateOn;
  const action = body.action === "save" || body.action === "script" ? body.action : "write";
  if (!listingId || !isDate(updateOn)) return NextResponse.json({ error: "listingId and updateOn are required" }, { status: 400 });

  const stats: SellerStats = {
    views: num(body.views), saves: num(body.saves), showings: num(body.showings),
    openHouse: num(body.openHouse), offers: num(body.offers),
  };
  const feedback = text(body.feedback);
  const nextSteps = text(body.nextSteps);
  if (action !== "save" && Object.values(stats).every((v) => v === null) && !feedback && !nextSteps) {
    return NextResponse.json({ error: "Fill in at least one number or a note first." }, { status: 400 });
  }

  const admin = createAdminClient();
  const found = await load(admin, user.id, listingId, updateOn);
  if (!found) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  // The numbers are saved before the model is asked, so they are kept even
  // when the writing fails, the trial window has closed, or the agent goes
  // off to record a video. The video columns are left as they are.
  const { error: saveErr } = await admin.from("seller_listing_updates").upsert({
    listing_id: listingId, user_id: user.id, update_on: updateOn,
    views: stats.views, saves: stats.saves, showings: stats.showings,
    open_house_visitors: stats.openHouse, offers: stats.offers,
    feedback: feedback || null, next_steps: nextSteps || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "listing_id,update_on" });
  if (saveErr) {
    console.error("[seller-update] save failed:", saveErr.message);
    return NextResponse.json({ error: "Couldn't save the numbers." }, { status: 500 });
  }
  if (action === "save") return NextResponse.json({ ok: true });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const signature = await loadAgentSignature(admin, user.id);
  const before = statsOf(found.before);
  const dom = daysOnMarket(found.listing.listed_on, updateOn);
  const facts = {
    address: found.listing.address,
    sellerNames: found.listing.seller_names,
    listPrice: found.listing.list_price,
    daysOnMarket: dom,
    updateNumber: found.earlier + 1,
    updateOn: dayLabel(updateOn),
    lastUpdateOn: found.before ? dayLabel(found.before.update_on) : null,
    stats,
    before,
    feedback,
    nextSteps,
    agentName: signature.name,
  };

  if (action === "script") {
    const script = await writeSellerVideoScript(facts);
    if (!script) return NextResponse.json({ error: "Your numbers are saved, but the script couldn't be written. Please try again." }, { status: 502 });
    await admin.from("api_usage_log").insert({
      user_id: user.id, api_provider: "perplexity", endpoint: "seller_video_script", credits_used: 0, response_status: 200,
    });
    return NextResponse.json({ script });
  }

  const email = await writeSellerUpdate({ ...facts, hasVideo: !!found.current?.video_url });
  if (!email) return NextResponse.json({ error: "Your numbers are saved, but the email couldn't be written. Please try again." }, { status: 502 });

  await admin.from("seller_listing_updates").update({ email }).eq("listing_id", listingId).eq("update_on", updateOn);
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "perplexity", endpoint: "seller_update", credits_used: 0, response_status: 200,
  });
  return NextResponse.json({ email, stats, before, daysOnMarket: dom, signature });
}
