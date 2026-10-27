import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayKey, weekdayOf, zonedToUtc } from "@/lib/utils/time-zone";
import { zoneOf } from "@/lib/autopilot";
import { writeSellerUpdate, writeSellerVideoScript } from "@/lib/api/seller-update";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { saveEmailPoster } from "@/lib/video/email-poster";
import { makeDraftVideo } from "@/lib/halo/make";
import { sendSellerUpdate } from "@/lib/seller/send";
import { addSparkleeNote } from "@/lib/sparklee-notes";
import type { SellerStats } from "@/lib/utils/newsletter-html";

/**
 * Seller Updates on AutoSparks (2026-10-26, the owner's mockup).
 *
 * Each week, every active listing with sellers added from BoldTrail gets a
 * card for its send day. The agent adds the numbers; the email is written and
 * (unless Email only) a short Avatar in circle video is made. They watch it,
 * press Approve, and it sends by itself on its day through BoldTrail. The
 * numbers, email and video live on seller_listing_updates, exactly as in
 * Spark Tools, so the two stay one update.
 */

export interface SellerAutoSettings {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "HH:MM", the agent's own time zone. */
  time: string;
  /** "circle": a short Avatar in circle video; "none": email only. */
  video: "circle" | "none";
  /** Also text the sellers that the email went. */
  text: boolean;
}

export const SELLER_AUTO_DEFAULTS: SellerAutoSettings = { enabled: false, weekday: 5, time: "09:00", video: "circle", text: true };

export function sanitizeSellerAuto(raw: unknown): SellerAutoSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = SELLER_AUTO_DEFAULTS;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    weekday: Number.isInteger(r.weekday) && (r.weekday as number) >= 0 && (r.weekday as number) <= 6 ? (r.weekday as number) : d.weekday,
    time: typeof r.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : d.time,
    video: r.video === "none" ? "none" : "circle",
    text: typeof r.text === "boolean" ? r.text : d.text,
  };
}

export interface SellerAutoProfile { id: string; time_zone: string | null; seller_auto: unknown }

/** The next send day at or after now (this week's, or next week's once it has passed). */
export function nextSellerSlot(s: SellerAutoSettings, tz: string, now = new Date()): { day: string; at: Date } {
  const today = dayKey(now, tz);
  const ahead = (s.weekday - weekdayOf(today) + 7) % 7;
  let day = addDays(today, ahead);
  let at = zonedToUtc(day, s.time, tz);
  if (at.getTime() <= now.getTime()) { day = addDays(day, 7); at = zonedToUtc(day, s.time, tz); }
  return { day, at };
}

/**
 * A card for the coming send day, for each active listing with sellers.
 * Safe to call any number of times: one card per listing per day.
 */
export async function ensureSellerDrafts(admin: SupabaseClient, profile: SellerAutoProfile): Promise<number> {
  const s = sanitizeSellerAuto(profile.seller_auto);
  if (!s.enabled) return 0;
  const tz = zoneOf(profile);
  const { day, at } = nextSellerSlot(s, tz);
  const { data } = await admin
    .from("seller_listings")
    .select("id, boldtrail_contacts")
    .eq("user_id", profile.id)
    .is("archived_at", null);
  const listings = ((data ?? []) as { id: string; boldtrail_contacts: unknown[] | null }[])
    .filter((l) => (l.boldtrail_contacts ?? []).length > 0);
  if (!listings.length) return 0;
  const { data: made } = await admin
    .from("seller_auto_drafts")
    .upsert(
      listings.map((l) => ({
        user_id: profile.id, listing_id: l.id, update_on: day, slot_at: at.toISOString(),
        mode: s.video === "none" ? "email" : "video", also_text: s.text,
      })),
      { onConflict: "listing_id,update_on", ignoreDuplicates: true },
    )
    .select("id");
  return (made ?? []).length;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
};
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export interface DraftRow {
  id: string; user_id: string; listing_id: string; update_on: string; slot_at: string;
  status: string; mode: "video" | "camera" | "email"; also_text: boolean;
  project_id: string | null; video_id: string | null;
}

/**
 * Write it (and make the video): saves the numbers on the day's update,
 * writes the email, and for a video card writes what the avatar says and
 * starts it. Email only is ready to approve straight away.
 */
export async function writeSellerDraft(
  admin: SupabaseClient,
  user: { id: string; email: string | null },
  d: DraftRow,
  input: Record<string, unknown>,
  mode: "video" | "email",
): Promise<{ status: number; out: Record<string, unknown> }> {
  const stats: SellerStats = {
    views: num(input.views), saves: num(input.saves), showings: num(input.showings),
    openHouse: num(input.openHouse), offers: num(input.offers),
  };
  const feedback = text(input.feedback);
  const nextSteps = text(input.nextSteps);
  if (Object.values(stats).every((v) => v === null) && !feedback && !nextSteps) {
    return { status: 400, out: { error: "Fill in at least one number or a note first." } };
  }

  const { data: listing } = await admin
    .from("seller_listings")
    .select("id, address, seller_names, list_price, listed_on")
    .eq("id", d.listing_id).eq("user_id", user.id).maybeSingle();
  if (!listing) return { status: 404, out: { error: "Listing not found" } };

  await admin.from("seller_listing_updates").upsert({
    listing_id: d.listing_id, user_id: user.id, update_on: d.update_on,
    views: stats.views, saves: stats.saves, showings: stats.showings,
    open_house_visitors: stats.openHouse, offers: stats.offers,
    feedback: feedback || null, next_steps: nextSteps || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "listing_id,update_on" });

  const { data: prev } = await admin
    .from("seller_listing_updates")
    .select("update_on, views, saves, showings, open_house_visitors, offers")
    .eq("listing_id", d.listing_id).lt("update_on", d.update_on)
    .order("update_on", { ascending: false });
  const earlier = (prev ?? []) as { update_on: string; views: number | null; saves: number | null; showings: number | null; open_house_visitors: number | null; offers: number | null }[];
  const before = earlier[0] ?? null;
  const signature = await loadAgentSignature(admin, user.id);
  const listedOn = (listing as { listed_on: string | null }).listed_on;
  const dom = listedOn ? Math.max(0, Math.floor((Date.parse(`${d.update_on}T00:00:00Z`) - Date.parse(`${listedOn}T00:00:00Z`)) / 86_400_000)) : null;
  const facts = {
    address: (listing as { address: string }).address,
    sellerNames: (listing as { seller_names: string | null }).seller_names,
    listPrice: (listing as { list_price: string | null }).list_price,
    daysOnMarket: dom,
    updateNumber: earlier.length + 1,
    updateOn: dayLabel(d.update_on),
    lastUpdateOn: before ? dayLabel(before.update_on) : null,
    stats,
    before: before ? { views: before.views, saves: before.saves, showings: before.showings, openHouse: before.open_house_visitors, offers: before.offers } : null,
    feedback,
    nextSteps,
    agentName: signature.name,
  };

  const email = await writeSellerUpdate({ ...facts, hasVideo: mode === "video" });
  if (!email) return { status: 502, out: { error: "Your numbers are saved, but the email couldn't be written. Try again." } };
  await admin.from("seller_listing_updates").update({ email }).eq("listing_id", d.listing_id).eq("update_on", d.update_on);

  if (mode === "email") {
    await admin.from("seller_auto_drafts").update({ status: "ready", mode: "email", error: null }).eq("id", d.id);
    return { status: 200, out: { ok: true, status: "ready" } };
  }

  const script = await writeSellerVideoScript(facts);
  if (!script) return { status: 502, out: { error: "The email is written, but the video script couldn't be. Try again, or choose Email only." } };

  const title = `Seller update: ${facts.address}`;
  const { data: project, error } = await admin.from("projects").insert({
    user_id: user.id,
    title,
    project_type: "location_script",
    status: "draft",
    ai_script: { title, hook: "", script, cta: "", description: "", hashtags: [], kind: "seller_update" },
  }).select("id").single();
  if (error || !project) return { status: 500, out: { error: "Couldn't start the video. Try again." } };
  const projectId = (project as { id: string }).id;

  const made = await makeDraftVideo(admin, user, {
    id: d.id,
    project_id: projectId,
    setup: {
      look: "circle", lookId: null, size: "horizontal", picture: "ai", pictureUrl: null,
      onScreen: "stock", photos: [], platforms: [], captions: true, music: "none",
    },
  });
  if (made.status >= 400) {
    const why = typeof made.out.error === "string" ? made.out.error : "Couldn't start the video.";
    await admin.from("seller_auto_drafts").update({ project_id: projectId, error: why }).eq("id", d.id);
    return { status: made.status, out: made.out };
  }
  await admin.from("seller_auto_drafts").update({ status: "making", mode: "video", project_id: projectId, error: null }).eq("id", d.id);
  return { status: 200, out: { ok: true, status: "making" } };
}

/** The draft's finished video, if there is one (made here, or recorded in Spark Tools). */
export async function draftVideo(admin: SupabaseClient, d: DraftRow): Promise<{ id: string; url: string; seconds: number | null } | "making" | "failed" | null> {
  if (d.mode === "video" && d.project_id) {
    const { data } = await admin
      .from("generated_videos")
      .select("id, render_status, video_url, duration_seconds")
      .eq("project_id", d.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const v = data as { id: string; render_status: string | null; video_url: string | null; duration_seconds: number | null } | null;
    if (!v) return "making";
    if (v.render_status === "failed") return "failed";
    if (v.render_status !== "completed" || !v.video_url) return "making";
    return { id: v.id, url: v.video_url, seconds: v.duration_seconds };
  }
  return null;
}

/** Puts the made video on the day's update, with the email's play-button still. */
export async function attachDraftVideo(admin: SupabaseClient, userId: string, d: DraftRow, v: { id: string; url: string; seconds: number | null }) {
  const posterUrl = await saveEmailPoster(admin, userId, v.id, v.url, v.seconds, "seller_video");
  await admin.from("seller_listing_updates").upsert({
    listing_id: d.listing_id, user_id: userId, update_on: d.update_on,
    video_id: v.id, video_url: v.url, video_poster_url: posterUrl, video_seconds: v.seconds,
    updated_at: new Date().toISOString(),
  }, { onConflict: "listing_id,update_on" });
  await admin.from("seller_auto_drafts").update({ video_id: v.id }).eq("id", d.id);
}

/**
 * Sends approved seller updates whose day has come (the halo-post job, every
 * 10 minutes). One already sent by hand from Spark Tools is marked sent, not
 * sent again.
 */
export async function sendDueSellerDrafts(admin: SupabaseClient, limit = 10) {
  const { data } = await admin
    .from("seller_auto_drafts")
    .select("id, user_id, listing_id, update_on, slot_at, status, mode, also_text, project_id, video_id")
    .eq("status", "approved")
    .lte("slot_at", new Date().toISOString())
    .order("slot_at")
    .limit(limit);
  const out: { id: string; outcome: string }[] = [];
  for (const d of (data ?? []) as DraftRow[]) {
    const { data: up } = await admin
      .from("seller_listing_updates")
      .select("sent_at")
      .eq("listing_id", d.listing_id).eq("update_on", d.update_on).maybeSingle();
    const already = (up as { sent_at: string | null } | null)?.sent_at;
    if (already) {
      await admin.from("seller_auto_drafts").update({ status: "sent", sent_at: already }).eq("id", d.id);
      out.push({ id: d.id, outcome: "already sent" });
      continue;
    }
    const r = await sendSellerUpdate(admin, d.user_id, d.listing_id, d.update_on, { alsoText: d.also_text });
    if (r.ok) {
      await admin.from("seller_auto_drafts").update({ status: "sent", sent_at: r.sentAt, error: null }).eq("id", d.id);
      out.push({ id: d.id, outcome: "sent" });
    } else {
      await admin.from("seller_auto_drafts").update({ status: "failed", error: r.error }).eq("id", d.id);
      await addSparkleeNote(admin, {
        userId: d.user_id, kind: "needs",
        title: "Your seller update didn't send.",
        body: r.error,
        actionLabel: "Open AutoSparks", actionHref: "/autosparks",
        dedupeKey: `seller-send-${d.id}`,
      });
      out.push({ id: d.id, outcome: r.error });
    }
  }
  return out;
}
