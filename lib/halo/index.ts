import { createAdminClient } from "@/lib/supabase/admin";
import { renderAndSaveThumbnail } from "@/lib/utils/thumbnail-render";
import { addDays, dayKey, weekdayOf, zonedToUtc } from "@/lib/utils/time-zone";
import { autopilotEligible, mondayFor, zoneOf, type AutopilotProfile } from "@/lib/autopilot";
import {
  affiliateDetails, classify, fetchText, readPage, sitemapUrls,
  type HaloKind,
} from "@/lib/halo/site-reader";

/**
 * Halo videos (2026-10-24, the owner's plan and mockup).
 *
 * Every morning SparkReels reads the agent's Halo websites. Pages that are
 * new since the last look, and the market report and events pages when they
 * change, become candidates. Up to 4 a month (the agent's choice), one a week
 * on their day, are written as drafts on the AutoSparks page: script, blog,
 * thumbnail, and this video's setup. Nothing is made, posted or charged until
 * the agent presses Approve (app/api/halo/approve), which makes the video;
 * the halo-post job then posts it on its day (lib/halo/post.ts).
 *
 * The first look at a site records what is already there as seen, so adding
 * a site never turns a hundred old posts into videos. The watched pages are
 * the exception: the current market report and events page are offered from
 * the start.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** The number Halo members text; the same as the sign-up number (owner, 2026-10-24). */
export const HALO_TEXT_NUMBER = "+14157263224";

export type HaloLook = "circle" | "full";

export interface HaloSettings {
  enabled: boolean;
  types: HaloKind[];
  /** Videos a month, 1–4, one a week. */
  perMonth: number;
  /** The day they go out, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "HH:MM" in the agent's own time zone. */
  time: string;
  /** "mix" = Avatar video for the market report, Avatar in circle for the rest. */
  look: HaloLook | "mix";
  lookId: string | null;
  size: "vertical" | "horizontal";
  /** "youtube" and the partner platforms (facebook, instagram …). */
  platforms: string[];
  captions: boolean;
  /** A music preset id (lib/utils/music-presets.ts). */
  music: string;
  /** Forwarded emails become drafts too (2026-10-24). */
  emails: boolean;
}

export const HALO_DEFAULTS: HaloSettings = {
  enabled: true,
  types: ["blog", "guides", "events", "market"],
  perMonth: 4,
  weekday: 3,
  time: "09:00",
  look: "circle",
  lookId: null,
  size: "vertical",
  platforms: ["facebook", "instagram", "youtube", "google_business"],
  captions: true,
  music: "bright",
  emails: true,
};

const ALL_KINDS: HaloKind[] = ["blog", "guides", "events", "market", "neighborhoods", "communities", "relocation", "dining", "just_sold", "other"];
export const HALO_PLATFORMS = ["facebook", "instagram", "youtube", "google_business", "linkedin", "tiktok", "x", "threads"];
const MUSIC_IDS = ["none", "corporate", "inspiring", "jazz", "motivate", "luxury", "bright", "feelgood", "anthem"];

/** Whatever was stored or sent, made safe: unknown fields dropped, bad values defaulted. */
export function sanitizeSettings(raw: unknown): HaloSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof HaloSettings, unknown>>;
  const d = HALO_DEFAULTS;
  const types = Array.isArray(r.types) ? r.types.filter((t): t is HaloKind => ALL_KINDS.includes(t as HaloKind)) : d.types;
  const platforms = Array.isArray(r.platforms) ? r.platforms.filter((p): p is string => HALO_PLATFORMS.includes(p as string)) : d.platforms;
  const n = Number(r.perMonth);
  const wd = Number(r.weekday);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    types: Array.from(new Set(types)),
    perMonth: Number.isInteger(n) && n >= 1 && n <= 4 ? n : d.perMonth,
    weekday: Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : d.weekday,
    time: typeof r.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : d.time,
    look: r.look === "full" || r.look === "circle" || r.look === "mix" ? r.look : d.look,
    lookId: typeof r.lookId === "string" && r.lookId.length < 200 ? r.lookId : null,
    size: r.size === "horizontal" ? "horizontal" : "vertical",
    platforms: Array.from(new Set(platforms)),
    captions: typeof r.captions === "boolean" ? r.captions : d.captions,
    music: typeof r.music === "string" && MUSIC_IDS.includes(r.music) ? r.music : d.music,
    emails: typeof r.emails === "boolean" ? r.emails : d.emails,
  };
}

/** One video's own setup, starting from the agent's Halo settings. */
export interface HaloSetup {
  look: HaloLook;
  lookId: string | null;
  size: "vertical" | "horizontal";
  /** The thumbnail's picture: the post's photo, an AI picture, or their own upload. */
  picture: "post" | "ai" | "upload";
  pictureUrl: string | null;
  /** The post's (or email's) own main picture, for "From the post". */
  sourceImage?: string | null;
  /** What is on screen behind them: stock clips, or the post's own photos. */
  onScreen: "stock" | "post";
  /** The post's photos, kept for "Photos from the post". */
  photos: string[];
  platforms: string[];
  captions: boolean;
  music: string;
  /** Promo videos only: the referral code and number read off the page. */
  promo?: { code: string | null; phone: string | null; angle: PromoAngle };
}

export function sanitizeSetupPatch(raw: unknown, current: HaloSetup): HaloSetup {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof HaloSetup, unknown>>;
  const next = { ...current };
  if (r.look === "circle" || r.look === "full") next.look = r.look;
  if (r.lookId === null || (typeof r.lookId === "string" && r.lookId.length < 200)) next.lookId = r.lookId as string | null;
  if (r.size === "vertical" || r.size === "horizontal") next.size = r.size;
  if (r.onScreen === "stock" || (r.onScreen === "post" && current.photos.length > 0)) next.onScreen = r.onScreen;
  if (Array.isArray(r.platforms)) next.platforms = Array.from(new Set(r.platforms.filter((p): p is string => HALO_PLATFORMS.includes(p as string))));
  if (typeof r.captions === "boolean") next.captions = r.captions;
  if (typeof r.music === "string" && MUSIC_IDS.includes(r.music)) next.music = r.music;
  return next;
}

export interface HaloSiteRow { id: string; user_id: string; url: string; is_affiliate: boolean }
interface PageRow {
  id: string; url: string; kind: HaloKind; status: string; content_hash: string | null;
  title: string | null; image_url: string | null; site_id: string;
}

/** Pages read per site per morning, past the first look. */
const READS_PER_RUN = 20;

/**
 * Reads one site and records what is new. The first look records everything
 * as seen except the watched pages (market report, events), which are offered
 * straight away.
 */
export async function checkSite(admin: Admin, site: HaloSiteRow): Promise<{ added: number; changed: number; error?: string }> {
  const now = new Date().toISOString();
  if (site.is_affiliate) {
    await admin.from("halo_sites").update({ last_checked_at: now, last_error: null }).eq("id", site.id);
    return { added: 0, changed: 0 };
  }
  const urls = await sitemapUrls(site.url);
  if (!urls) {
    const error = "We couldn't read this site's list of pages.";
    await admin.from("halo_sites").update({ last_checked_at: now, last_error: error }).eq("id", site.id);
    return { added: 0, changed: 0, error };
  }

  const { data: rows } = await admin
    .from("halo_pages")
    .select("id, url, kind, status, content_hash, title, image_url, site_id")
    .eq("site_id", site.id);
  const existing = new Map(((rows ?? []) as PageRow[]).map((p) => [p.url, p]));
  const firstLook = existing.size === 0;

  let reads = 0;
  let added = 0;
  let changed = 0;
  const inserts: Record<string, unknown>[] = [];

  for (const url of urls) {
    if (existing.has(url)) continue;
    const c = classify(url);
    if (!c) continue;
    const base = { user_id: site.user_id, site_id: site.id, url, kind: c.kind };
    if (firstLook && !c.watched) {
      inserts.push({ ...base, status: "seen" });
      continue;
    }
    // A new page, or a watched page on the first look: read it for its
    // title, date and picture.
    if (reads >= READS_PER_RUN) continue; // tomorrow's run picks it up
    reads++;
    const page = await readPage(url, c.kind);
    if (!page) continue;
    // Not new news: a page that appeared in the list but was published long
    // ago (a site reorganised) is recorded, not offered.
    const old = page.publishedOn && Date.now() - Date.parse(page.publishedOn) > 30 * 86_400_000;
    inserts.push({
      ...base,
      title: page.title.slice(0, 300),
      published_on: page.publishedOn,
      image_url: page.imageUrl,
      content_hash: page.hash,
      status: old ? "seen" : "new",
      changed_at: now,
    });
    if (!old) added++;
  }

  // The watched pages already known: offered again when they change.
  for (const p of Array.from(existing.values())) {
    const c = classify(p.url);
    if (!c?.watched) continue;
    if (reads >= READS_PER_RUN + 4) break;
    reads++;
    const page = await readPage(p.url, c.kind);
    if (!page || page.hash === p.content_hash) continue;
    await admin.from("halo_pages").update({
      title: page.title.slice(0, 300),
      image_url: page.imageUrl,
      content_hash: page.hash,
      status: p.content_hash ? "new" : p.status,
      changed_at: now,
    }).eq("id", p.id);
    if (p.content_hash) changed++;
  }

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await admin.from("halo_pages").upsert(inserts.slice(i, i + 500), { onConflict: "site_id,url", ignoreDuplicates: true });
    if (error) console.error(`[halo] saving pages for ${site.url}:`, error.message);
  }
  await admin.from("halo_sites").update({ last_checked_at: now, last_error: null }).eq("id", site.id);
  return { added, changed };
}

/** The first `perMonth` of the agent's weekday in a month, as day keys. */
function monthDays(year: number, month: number, weekday: number, perMonth: number): string[] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const offset = (weekday - weekdayOf(first) + 7) % 7;
  return Array.from({ length: perMonth }, (_, i) => addDays(first, offset + i * 7));
}

/** Drafts are written up to this far ahead of their day. */
const PLAN_AHEAD_DAYS = 10;

/** This month's and next month's Halo days, in UTC. */
export function haloSlots(now: Date, tz: string, s: HaloSettings): Date[] {
  const today = dayKey(now, tz);
  const [y, m] = today.split("-").map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return [...monthDays(y, m, s.weekday, s.perMonth), ...monthDays(next[0], next[1], s.weekday, s.perMonth)]
    .map((k) => zonedToUtc(k, s.time, tz));
}

/** Which kinds go first when there are more new pages than days. */
const PRIORITY: Record<string, number> = { market: 0, events: 1, blog: 2, guides: 3, just_sold: 4, neighborhoods: 5, communities: 6, relocation: 7, dining: 8, other: 9 };

export function setupFor(s: HaloSettings, kind: string, page?: { image_url: string | null }): HaloSetup {
  return {
    look: s.look === "mix" ? (kind === "market" ? "full" : "circle") : s.look,
    lookId: s.lookId,
    size: s.size,
    picture: page?.image_url ? "post" : "ai",
    pictureUrl: null,
    sourceImage: page?.image_url ?? null,
    onScreen: "stock",
    photos: [],
    platforms: s.platforms,
    captions: s.captions,
    music: s.music,
  };
}

export const HALO_PROFILE_SELECT =
  "id, email, full_name, role, subscription_tier, location_city, location_state, time_zone, autopilot_enabled, autopilot_videos, autopilot_days, autopilot_time, halo_settings";
export type HaloProfile = AutopilotProfile & { halo_settings: unknown };

/** The best new pages the agent wants videos from, best first. */
export async function candidates(admin: Admin, userId: string, s: HaloSettings, limit = 20): Promise<(PageRow & { first_seen_at: string; changed_at: string | null })[]> {
  const { data: sites } = await admin.from("halo_sites").select("id").eq("user_id", userId).eq("is_affiliate", false);
  const siteIds = ((sites ?? []) as { id: string }[]).map((x) => x.id);
  if (!siteIds.length || !s.types.length) return [];
  // "Any new page" means every kind, not only the pages that fit no other.
  const kinds = s.types.includes("other") ? ALL_KINDS : s.types;
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data } = await admin
    .from("halo_pages")
    .select("id, url, kind, status, content_hash, title, image_url, site_id, first_seen_at, changed_at")
    .eq("user_id", userId)
    .eq("status", "new")
    .in("site_id", siteIds)
    .in("kind", kinds)
    .gte("first_seen_at", since)
    .limit(200);
  const list = (data ?? []) as (PageRow & { first_seen_at: string; changed_at: string | null })[];
  const when = (p: { changed_at: string | null; first_seen_at: string }) => Date.parse(p.changed_at ?? p.first_seen_at);
  return list
    .sort((a, b) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9) || when(b) - when(a))
    .slice(0, limit);
}

/**
 * Fills the open Halo days in the next ten with the best new pages, and
 * starts writing them. Returns once the rows exist; `written` resolves when
 * every draft is written or failed.
 */
export async function planHaloDrafts(
  admin: Admin,
  profile: HaloProfile,
  opts: { now?: Date } = {},
): Promise<{ ids: string[]; written: Promise<void> }> {
  const none = { ids: [], written: Promise.resolve() };
  const s = sanitizeSettings(profile.halo_settings);
  if (!s.enabled || !autopilotEligible(profile)) return none;
  const now = opts.now ?? new Date();
  const tz = zoneOf(profile);

  const slots = haloSlots(now, tz, s);
  const { data: taken } = await admin
    .from("autopilot_drafts")
    .select("slot_at")
    .eq("user_id", profile.id)
    .eq("source", "halo")
    .not("status", "in", "(skipped,failed)")
    .gte("slot_at", slots[0].toISOString());
  const takenAt = new Set(((taken ?? []) as { slot_at: string }[]).map((r) => new Date(r.slot_at).getTime()));
  const horizon = now.getTime() + PLAN_AHEAD_DAYS * 86_400_000;
  const open = slots.filter((d) => d.getTime() > now.getTime() + 3600_000 && d.getTime() <= horizon && !takenAt.has(d.getTime()));
  if (!open.length) return none;

  const pages = await candidates(admin, profile.id, s, open.length);
  const ids: string[] = [];
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < Math.min(open.length, pages.length); i++) {
    const id = await insertDraft(admin, profile, s, pages[i], open[i], tz);
    if (!id) continue;
    ids.push(id);
    jobs.push(writeHaloDraft(admin, id, profile, pages[i]));
  }
  return { ids, written: Promise.allSettled(jobs).then(() => undefined) };
}

/** One Halo draft row for a page and a day. Null when that day was taken meanwhile. */
export async function insertDraft(
  admin: Admin, profile: HaloProfile, s: HaloSettings,
  page: { id: string; url: string; kind: string; title: string | null; image_url: string | null },
  slot: Date, tz: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("autopilot_drafts")
    .insert({
      user_id: profile.id,
      week_of: mondayFor(slot, tz),
      slot_at: slot.toISOString(),
      kind: "video",
      topic: (page.title || page.url).slice(0, 300),
      source: "halo",
      source_url: page.url,
      source_kind: page.kind,
      halo_page_id: page.id,
      setup: setupFor(s, page.kind, page),
      status: "writing",
    })
    .select("id")
    .single();
  if (error || !data) {
    // The unique day index: another run took this day first.
    if (error && !/duplicate|unique/i.test(error.message)) console.error("[halo] draft insert:", error.message);
    return null;
  }
  await admin.from("halo_pages").update({ status: "drafted" }).eq("id", page.id);
  return (data as { id: string }).id;
}

function baseUrl(): string {
  return (process.env.AUTOPILOT_BASE_URL || "https://www.sparkreels.ai").replace(/\/$/, "");
}

/** Calls the Create page's own writer as the agent. Returns the new project's id. */
async function callWriter(userId: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/ai/generate-location-script`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      "x-autopilot-user": userId,
    },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  const projectId = (out as { project?: { id?: string } }).project?.id;
  if (!res.ok || !projectId) throw new Error((out as { error?: string }).error || `Writer ${res.status}`);
  return projectId;
}

/** Writes the script, blog and thumbnail for one Halo draft, from the page itself. */
export async function writeHaloDraft(
  admin: Admin, draftId: string, profile: HaloProfile,
  page: { url: string; kind: string; title: string | null; image_url: string | null },
): Promise<void> {
  try {
    const { data: d } = await admin.from("autopilot_drafts").select("setup").eq("id", draftId).single();
    const setup = (d as { setup: HaloSetup } | null)?.setup ?? setupFor(HALO_DEFAULTS, page.kind, page);
    const read = await readPage(page.url, page.kind as HaloKind);
    if (!read || read.text.length < 200) throw new Error("The page couldn't be read.");
    const now = new Date();
    const tz = zoneOf(profile);
    const title = read.title || page.title || "";
    const vertical = setup.size === "vertical";
    const projectId = await callWriter(profile.id, {
      videoType: "custom",
      customTopic: page.kind === "events" ? `What's happening this week: ${title}` : title,
      sourceText: read.text,
      sourceIsOwn: true,
      city: profile.location_city?.trim() ?? "",
      state: profile.location_state?.trim() ?? "",
      month: now.toLocaleString("en-US", { month: "long", timeZone: tz }),
      year: now.getFullYear(),
      videoLength: "standard",
      shortScript: vertical,
      videoPlatform: vertical ? "reel" : "youtube",
      renderMode: "avatar_voice",
      ...(setup.look === "circle" && { avatarStyle: "circle" }),
    });
    await admin.from("autopilot_drafts").update({
      project_id: projectId,
      status: "draft",
      setup: { ...setup, photos: read.photos },
      ...(read.title && { topic: read.title.slice(0, 300) }),
    }).eq("id", draftId);
    await buildThumbnail(admin, profile.id, projectId, setup.picture === "post" ? page.image_url : null);
  } catch (err) {
    console.error(`[halo] draft ${draftId} failed:`, err instanceof Error ? err.message : err);
    await admin.from("autopilot_drafts").update({ status: "failed" }).eq("id", draftId);
  }
}

/**
 * The thumbnail: the given picture as the background, or an AI picture of the
 * town when there is none, with the agent's headshot on top. Never fails the
 * draft: the video makes one of its own when it finishes if this one didn't.
 */
export async function buildThumbnail(
  _admin: Admin, userId: string, projectId: string, pictureUrl: string | null, opts: { noMarket?: boolean } = {},
): Promise<string | null> {
  try {
    const out = await renderAndSaveThumbnail({
      userId, projectId,
      ...(pictureUrl && { backgroundUrl: pictureUrl }),
      ...(opts.noMarket && { noMarket: true }),
    });
    return out.url;
  } catch (err) {
    console.error(`[halo] thumbnail for ${projectId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export type PromoAngle = "why" | "free" | "pro";
const PROMO_TOPIC: Record<PromoAngle, string> = {
  why: "Why I use Halo, the marketing agency I run by text, and why other agents should try it",
  free: "How any real estate agent can get a free AI-ready authority page from Halo",
  pro: "What Halo Pro does for a real estate agent for $99 a month",
};
const PROMO_PLATFORMS = ["facebook", "linkedin", "instagram"];

/**
 * A promo video for the agent's Halo referral page: on demand, not one of the
 * month's Halo videos. The script says out loud that the agent earns a
 * referral fee, and the caption carries #ad (lib/halo/post.ts): a paid
 * referral has to be disclosed.
 */
export async function startPromo(
  admin: Admin, profile: HaloProfile, site: HaloSiteRow, angle: PromoAngle,
): Promise<{ id: string; written: Promise<void> }> {
  const s = sanitizeSettings(profile.halo_settings);
  const tz = zoneOf(profile);
  const tomorrow = addDays(dayKey(new Date(), tz), 1);
  const slot = zonedToUtc(tomorrow, s.time, tz);
  const setup: HaloSetup = {
    look: "full", lookId: s.lookId, size: "vertical",
    picture: "ai", pictureUrl: null, onScreen: "stock", photos: [],
    platforms: PROMO_PLATFORMS, captions: s.captions, music: s.music,
    promo: { code: null, phone: null, angle },
  };
  const { data, error } = await admin
    .from("autopilot_drafts")
    .insert({
      user_id: profile.id,
      week_of: mondayFor(slot, tz),
      slot_at: slot.toISOString(),
      kind: "video",
      topic: PROMO_TOPIC[angle],
      source: "halo_promo",
      source_url: site.url,
      source_kind: "promo",
      requested: true,
      setup,
      status: "writing",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Couldn't save the promo draft.");
  const id = (data as { id: string }).id;

  const written = (async () => {
    try {
      const page = await fetchText(site.url);
      if (!page.ok) throw new Error("The page couldn't be read.");
      const { code, phone } = affiliateDetails(page.text);
      const read = await readPage(site.url);
      const facts = [
        read?.text ?? "",
        code ? `Referral code: ${code}. To start free, text ${code} to ${phone ?? "Halo"}. For Halo Pro, text "${code} PRO".` : "",
        "The agent earns a referral fee when someone joins with their code.",
      ].filter(Boolean).join("\n\n");
      const now = new Date();
      const projectId = await callWriter(profile.id, {
        videoType: "custom",
        customTopic: PROMO_TOPIC[angle],
        sourceText: facts,
        sourceIsOwn: false,
        audience: "Real estate agents",
        purpose: "Invite other real estate agents to try Halo with my referral code",
        city: profile.location_city?.trim() ?? "",
        state: profile.location_state?.trim() ?? "",
        month: now.toLocaleString("en-US", { month: "long", timeZone: tz }),
        year: now.getFullYear(),
        videoLength: "standard",
        shortScript: true,
        videoPlatform: "reel",
        renderMode: "avatar_voice",
      });
      // The closing line is ours: the code, where to find the number (numbers
      // are never spoken; it is in the caption), and the disclosure.
      const cta = code
        ? `Text my code ${code}${angle === "pro" ? " PRO" : ""} to Halo to get started. The number is in the caption. I earn a referral fee if you join with my code.`
        : "The link is in the caption. I earn a referral fee if you join with my code.";
      const { data: proj } = await admin.from("projects").select("ai_script").eq("id", projectId).single();
      const ai = ((proj as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? {};
      await admin.from("projects").update({ ai_script: { ...ai, cta } }).eq("id", projectId);
      await admin.from("autopilot_drafts").update({
        project_id: projectId, status: "draft",
        setup: { ...setup, promo: { code, phone, angle } },
      }).eq("id", id);
      await buildThumbnail(admin, profile.id, projectId, null, { noMarket: true });
    } catch (err) {
      console.error(`[halo] promo ${id} failed:`, err instanceof Error ? err.message : err);
      await admin.from("autopilot_drafts").update({ status: "failed" }).eq("id", id);
    }
  })();
  return { id, written };
}

/** Email drafts written per agent per day, at most: each is a writer call. */
const EMAIL_DRAFTS_PER_DAY = 5;

/**
 * A forwarded email as a video draft (2026-10-24, the owner's ask).
 *
 * Called by the inbound email webhook once the email is saved. It goes in the
 * same list as Halo drafts, with the same setup, on the next day at the
 * agent's Halo time that no other email draft has. It is not one of the
 * month's Halo videos. The email is someone else's piece as often as not (a
 * data provider's market report), so the script is written fresh from it.
 */
export async function startEmailDraft(admin: Admin, userId: string, importId: string): Promise<Promise<void> | null> {
  const { data } = await admin.from("profiles").select(HALO_PROFILE_SELECT).eq("id", userId).single();
  const profile = data as HaloProfile | null;
  if (!profile || !autopilotEligible(profile)) return null;
  const s = sanitizeSettings(profile.halo_settings);
  if (!s.emails) return null;

  const { data: imp } = await admin
    .from("email_imports")
    .select("id, subject, body_text, image_urls")
    .eq("id", importId)
    .eq("user_id", userId)
    .single();
  const email = imp as { id: string; subject: string | null; body_text: string; image_urls: string[] | null } | null;
  if (!email) return null;

  const { count } = await admin
    .from("autopilot_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "email")
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= EMAIL_DRAFTS_PER_DAY) return null;

  // The next day at their Halo time with no other email draft on it.
  const tz = zoneOf(profile);
  const { data: taken } = await admin
    .from("autopilot_drafts")
    .select("slot_at")
    .eq("user_id", userId)
    .eq("source", "email")
    .not("status", "in", "(skipped,failed)")
    .gte("slot_at", new Date().toISOString());
  const takenDays = new Set(((taken ?? []) as { slot_at: string }[]).map((r) => dayKey(new Date(r.slot_at), tz)));
  const today = dayKey(new Date(), tz);
  let day = addDays(today, 1);
  for (let i = 1; i <= 21 && takenDays.has(day); i++) day = addDays(today, i + 1);
  const slot = zonedToUtc(day, s.time, tz);

  const images = (email.image_urls ?? []).filter((u) => /^https:\/\//.test(u));
  const setup: HaloSetup = {
    ...setupFor(s, "email", { image_url: images[0] ?? null }),
    photos: images.slice(0, 12),
  };
  const topic = (email.subject || "Forwarded email").slice(0, 300);
  const { data: row, error } = await admin
    .from("autopilot_drafts")
    .insert({
      user_id: userId,
      week_of: mondayFor(slot, tz),
      slot_at: slot.toISOString(),
      kind: "video",
      topic,
      source: "email",
      source_kind: "email",
      email_import_id: email.id,
      setup,
      status: "writing",
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[halo] email draft insert:", error?.message);
    return null;
  }
  const draftId = (row as { id: string }).id;

  return (async () => {
    try {
      const vertical = setup.size === "vertical";
      const now = new Date();
      const projectId = await callWriter(userId, {
        videoType: "custom",
        customTopic: topic,
        sourceText: email.body_text,
        sourceIsOwn: false,
        city: profile.location_city?.trim() ?? "",
        state: profile.location_state?.trim() ?? "",
        month: now.toLocaleString("en-US", { month: "long", timeZone: tz }),
        year: now.getFullYear(),
        videoLength: "standard",
        shortScript: vertical,
        videoPlatform: vertical ? "reel" : "youtube",
        renderMode: "avatar_voice",
        ...(setup.look === "circle" && { avatarStyle: "circle" }),
      });
      await admin.from("autopilot_drafts").update({ project_id: projectId, status: "draft" }).eq("id", draftId);
      await buildThumbnail(admin, userId, projectId, setup.picture === "post" ? setup.sourceImage ?? null : null);
    } catch (err) {
      console.error(`[halo] email draft ${draftId} failed:`, err instanceof Error ? err.message : err);
      await admin.from("autopilot_drafts").update({ status: "failed" }).eq("id", draftId);
    }
  })();
}

/** Everything a morning run does for one agent: read their sites, then plan. */
export async function morningRun(admin: Admin, profile: HaloProfile): Promise<{ checked: number; drafts: number }> {
  const s = sanitizeSettings(profile.halo_settings);
  if (!s.enabled || !autopilotEligible(profile)) return { checked: 0, drafts: 0 };
  const { data } = await admin.from("halo_sites").select("id, user_id, url, is_affiliate").eq("user_id", profile.id);
  const sites = (data ?? []) as HaloSiteRow[];
  for (const site of sites) {
    try { await checkSite(admin, site); }
    catch (err) { console.error(`[halo] checking ${site.url}:`, err instanceof Error ? err.message : err); }
  }
  const { ids, written } = await planHaloDrafts(admin, profile);
  await written;
  return { checked: sites.length, drafts: ids.length };
}
