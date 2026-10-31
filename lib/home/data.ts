import type { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { aiImagesUsedThisMonth, IMAGE_MONTHLY_LIMIT } from "@/lib/utils/image-allowance";
import { getProfile, profileUsername, uploadPostConfigured } from "@/lib/api/upload-post";
import { partnerPlatform } from "@/lib/utils/social-platforms";
import { DEFAULT_TIME_ZONE, addDays, dayKey, isValidTimeZone, weekdayOf } from "@/lib/utils/time-zone";
import { whatsNewItems } from "@/lib/data/whats-new";

/**
 * Everything the Home dashboard shows (2026-10-29, the owner's agentic
 * dashboard), read from what SparkReels already stores. No estimates: a
 * section with nothing real to say is empty, never filled with guesses.
 *
 * Approvals: AutoSparks / Halo / email / Sparklee drafts and seller updates.
 * Working: renders, the waiting line, drafts being written, booked posts.
 * Week: posts out and booked, and drafts waiting on the agent, by day.
 * Opportunities: real signals only (see opportunitiesFor).
 */

type Admin = ReturnType<typeof createAdminClient>;
const DAY = 86_400_000;
/** The draft sources Approve on Home can act on (as /api/halo/approve). */
const APPROVABLE = ["halo", "halo_promo", "email", "sparklee"];
const SHORT_PER_MONTH: Record<string, number> = { starter: 4, agent: 4, pro: 4 };

export const platformLabel = (p: string) => (p === "youtube" ? "YouTube" : partnerPlatform(p)?.label ?? p);

export interface HomeApproval {
  id: string; kind: "draft" | "seller";
  title: string; tag: string; when: string | null; platforms: string[];
  /** What Home can do with it right here. */
  state: "ready" | "needs_video";
  videoUrl: string | null; thumbUrl: string | null; vertical: boolean;
  href: string;
}
export interface HomeWorking { kind: "rendering" | "queued" | "preparing" | "booked" | "approved" | "done"; title: string; detail: string; at?: string | null }
export interface HomeWeekItem { day: string; state: "posted" | "booked" | "needs" ; title: string; at: string | null }
export interface HomeOpportunity {
  id: string; icon: string; title: string; detail: string;
  /** Sent to Sparklee as a request when they press Make draft… */
  ask?: string;
  /** …or a page to open instead. */
  href?: string; hrefLabel?: string;
}
export interface HomeSpark { id: string; kind: "video" | "blog"; title: string; at: string; status: string; thumbUrl: string | null; href: string }

export interface HomeData {
  name: string | null;
  paid: boolean; admin: boolean; tier: string;
  city: string | null; state: string | null; timeZone: string;
  usage: { shortLeft: number; perMonth: number; bought: number; unlimited: boolean; renewsAt: string | null; images: { used: number; limit: number }; autoSparksThisMonth: number };
  connected: string[];
  crm: { boldtrail: boolean };
  sites: number;
  approvals: HomeApproval[];
  working: HomeWorking[];
  week: { start: string; today: string; items: HomeWeekItem[] };
  insights: { views: number | null; postsOut7: number; topTitle: string | null; topViews: number | null; hasStats: boolean };
  opportunities: HomeOpportunity[];
  sparks: HomeSpark[];
  whatsNew: { id: string; title: string; description: string; releaseDate: string }[];
}

interface ProfileRow {
  full_name: string | null; subscription_tier: string | null; role: string | null;
  location_city: string | null; location_state: string | null; time_zone: string | null;
  credits_remaining: number | null; purchased_short_videos: number | null; current_period_end: string | null;
  youtube_channel_id: string | null; youtube_refresh_token: string | null; social_profile_created_at: string | null;
  website: string | null; first_video_generated_at: string | null;
}

/** The accounts this agent has connected: YouTube natively, the rest at the partner. */
export async function connectedPlatforms(p: Pick<ProfileRow, "youtube_channel_id" | "youtube_refresh_token" | "social_profile_created_at">, userId: string): Promise<string[]> {
  const out: string[] = [];
  if (p.youtube_channel_id && p.youtube_refresh_token) out.push("youtube");
  if (p.social_profile_created_at && uploadPostConfigured()) {
    try {
      const accounts = (await Promise.race([
        getProfile(profileUsername(userId)),
        new Promise<null>((r) => setTimeout(() => r(null), 4000)),
      ]))?.social_accounts ?? {};
      for (const [k, v] of Object.entries(accounts)) if (v && typeof v === "object") out.push(k);
    } catch { /* shown as not connected */ }
  }
  return out;
}

export async function loadHome(admin: Admin, userId: string): Promise<HomeData> {
  const { data: prof } = await admin.from("profiles")
    .select(`${ALLOWANCE_SELECT}, full_name, subscription_tier, role, location_city, location_state, time_zone, current_period_end, youtube_channel_id, youtube_refresh_token, social_profile_created_at, website, first_video_generated_at`)
    .eq("id", userId).single();
  const p = (prof ?? {}) as unknown as ProfileRow;
  const level = getAccessLevel(p);
  const isAdmin = level === "admin";
  const paid = isAdmin || isPaidLevel(level);
  const tz = isValidTimeZone(p.time_zone) ? p.time_zone! : DEFAULT_TIME_ZONE;
  const now = Date.now();
  const today = dayKey(new Date(), tz);
  const wd = weekdayOf(today);
  const weekStart = addDays(today, wd === 0 ? -6 : 1 - wd);
  const weekEndMs = Date.parse(`${addDays(weekStart, 8)}T00:00:00Z`);
  const weekStartMs = Date.parse(`${addDays(weekStart, -1)}T00:00:00Z`);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    connected, crmRow, sitesRes, draftsRes, sellerRes, videosRes, queueRes, postsRes, statsRes, blogsRes, imagesUsed, autoMonth, listingsRes, pagesRes,
  ] = await Promise.all([
    connectedPlatforms(p, userId),
    admin.from("integration_tokens").select("provider").eq("user_id", userId).eq("provider", "boldtrail").maybeSingle(),
    admin.from("halo_sites").select("id, last_checked_at, is_affiliate").eq("user_id", userId),
    admin.from("autopilot_drafts")
      .select("id, slot_at, status, source, topic, setup, project_id, video_id, approved_at, posted_at, projects(title, thumbnail_url)")
      .eq("user_id", userId).in("status", ["writing", "draft", "approved"]).order("slot_at").limit(60),
    admin.from("seller_auto_drafts")
      .select("id, listing_id, slot_at, status, mode, video_id, seller_listings(address, seller_names)")
      .eq("user_id", userId).in("status", ["open", "making", "ready", "approved", "sent"])
      .gte("slot_at", new Date(weekStartMs).toISOString()).order("slot_at").limit(30),
    admin.from("generated_videos")
      .select("id, project_id, render_status, video_url, video_type, created_at, projects(title, thumbnail_url)")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(40),
    admin.from("render_queue").select("id, status, created_at").eq("user_id", userId).in("status", ["queued", "starting"]).limit(10),
    admin.from("social_posts")
      .select("id, video_id, platform, post_status, scheduled_at, posted_at, video_title")
      .eq("user_id", userId).gte("created_at", new Date(now - 60 * DAY).toISOString()).limit(500),
    admin.from("video_stats").select("social_post_id, views, metrics").eq("user_id", userId),
    admin.from("projects").select("id, title, created_at, ai_script").eq("user_id", userId).eq("status", "draft")
      .order("created_at", { ascending: false }).limit(12),
    aiImagesUsedThisMonth(admin, userId).catch(() => 0),
    admin.from("autopilot_drafts").select("id", { count: "exact", head: true }).eq("user_id", userId)
      .neq("status", "skipped").gte("created_at", monthStart),
    admin.from("seller_listings").select("id, address, seller_names, archived_at, created_at").eq("user_id", userId).limit(50),
    admin.from("halo_pages").select("id, title, url, status, first_seen_at").eq("user_id", userId).eq("status", "new")
      .order("first_seen_at", { ascending: false }).limit(5),
  ]);

  type Draft = { id: string; slot_at: string; status: string; source: string | null; topic: string; setup: { platforms?: string[]; size?: string } | null; project_id: string | null; video_id: string | null; approved_at: string | null; posted_at: string | null; projects: { title: string | null; thumbnail_url: string | null } | null };
  type Seller = { id: string; listing_id: string; slot_at: string; status: string; mode: string | null; video_id: string | null; seller_listings: { address: string | null; seller_names: string | null } | null };
  type Vid = { id: string; project_id: string | null; render_status: string; video_url: string | null; video_type: string | null; created_at: string; projects: { title: string | null; thumbnail_url: string | null } | null };
  type Post = { id: string; video_id: string | null; platform: string; post_status: string; scheduled_at: string | null; posted_at: string | null; video_title: string | null };

  const drafts = (draftsRes.data ?? []) as unknown as Draft[];
  const sellers = (sellerRes.data ?? []) as unknown as Seller[];
  const videos = (videosRes.data ?? []) as unknown as Vid[];
  const posts = (postsRes.data ?? []) as Post[];
  const vidByProject = new Map<string, Vid>();
  for (const v of videos) if (v.project_id && v.render_status !== "failed" && !vidByProject.has(v.project_id)) vidByProject.set(v.project_id, v);
  const vidById = new Map(videos.map((v) => [v.id, v]));
  const titleOfVideo = (id: string | null) => (id && vidById.get(id)?.projects?.title) || null;

  // ── Needs Your Approval ──
  const approvals: HomeApproval[] = [];
  // Not one whose day has passed (2026-10-31): AutoSparks drops those too.
  for (const d of drafts.filter((x) => x.status === "draft" && dayKey(new Date(x.slot_at), tz) >= today)) {
    const v = d.project_id ? vidByProject.get(d.project_id) : undefined;
    if (v && v.render_status !== "completed") continue; // being made: under Working
    const approvable = APPROVABLE.includes(d.source ?? "");
    approvals.push({
      id: d.id, kind: "draft",
      title: d.projects?.title || d.topic,
      tag: d.source === "sparklee" ? "Sparklee" : d.source === "email" ? "Email" : d.source?.startsWith("halo") ? "Halo" : "AutoSparks",
      when: d.slot_at, platforms: d.setup?.platforms ?? [],
      state: v?.video_url && approvable ? "ready" : "needs_video",
      videoUrl: v?.video_url ?? null, thumbUrl: d.projects?.thumbnail_url ?? null,
      vertical: d.setup?.size === "vertical", href: "/autosparks",
    });
  }
  for (const s of sellers.filter((x) => x.status === "ready")) {
    approvals.push({
      id: s.id, kind: "seller",
      title: `Seller update: ${s.seller_listings?.address ?? "your listing"}`,
      tag: "Seller", when: s.slot_at, platforms: [], state: "needs_video",
      videoUrl: null, thumbUrl: null, vertical: false, href: "/autosparks",
    });
  }

  // ── Working For You (real states only) ──
  const working: HomeWorking[] = [];
  for (const v of videos.filter((x) => ["pending", "rendering", "storing"].includes(x.render_status))) {
    working.push({ kind: "rendering", title: v.render_status === "storing" ? "Finishing video" : "Rendering video", detail: v.projects?.title || "Your video" });
  }
  const queued = (queueRes.data ?? []).length;
  if (queued) working.push({ kind: "queued", title: "Waiting to start", detail: `${queued} video${queued === 1 ? "" : "s"} in line` });
  const writing = drafts.filter((d) => d.status === "writing");
  if (writing.length) working.push({ kind: "preparing", title: "Preparing drafts", detail: writing.map((d) => d.topic).slice(0, 2).join(" · ") });
  for (const s of sellers.filter((x) => x.status === "making")) {
    working.push({ kind: "rendering", title: "Making seller update video", detail: s.seller_listings?.address ?? "" });
  }
  const approvedWaiting = drafts.filter((d) => d.status === "approved" && !d.posted_at);
  if (approvedWaiting.length) {
    const next = approvedWaiting[0];
    working.push({ kind: "approved", title: `${approvedWaiting.length} approved, will post by itself`, detail: next.projects?.title || next.topic, at: next.slot_at });
  }
  const booked = posts.filter((x) => x.post_status === "scheduled" && x.scheduled_at && Date.parse(x.scheduled_at) > now)
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  if (booked.length) {
    const firstAt = booked[0].scheduled_at;
    const sameTime = booked.filter((b) => b.scheduled_at === firstAt).map((b) => platformLabel(b.platform));
    working.push({ kind: "booked", title: `${new Set(booked.map((b) => `${b.video_id}`)).size} booked to post`, detail: `Next: ${Array.from(new Set(sameTime)).join(", ")}`, at: firstAt });
  }
  // Recently done, newest first.
  const postedRecent = posts.filter((x) => x.post_status === "posted" && x.posted_at && now - Date.parse(x.posted_at) < 3 * DAY);
  const byVideo = new Map<string, Post[]>();
  for (const x of postedRecent) byVideo.set(x.video_id ?? x.id, [...(byVideo.get(x.video_id ?? x.id) ?? []), x]);
  for (const [vid, list] of Array.from(byVideo.entries()).slice(0, 3)) {
    working.push({ kind: "done", title: `Posted "${list[0].video_title || titleOfVideo(vid) || "your video"}"`, detail: Array.from(new Set(list.map((x) => platformLabel(x.platform)))).join(", "), at: list[0].posted_at });
  }
  const sites = (sitesRes.data ?? []) as { id: string; last_checked_at: string | null; is_affiliate: boolean }[];
  const checked = sites.map((s) => s.last_checked_at).filter(Boolean).sort().pop();
  if (checked && now - Date.parse(checked) < 2 * DAY) working.push({ kind: "done", title: "Checked your sites", detail: `${sites.length} site${sites.length === 1 ? "" : "s"}`, at: checked });

  // ── This week ──
  const inWeek = (iso: string | null) => !!iso && Date.parse(iso) >= weekStartMs && Date.parse(iso) < weekEndMs;
  const weekItems: HomeWeekItem[] = [];
  const seenVideoDay = new Set<string>();
  for (const x of posts) {
    const at = x.post_status === "posted" ? x.posted_at : x.post_status === "scheduled" ? x.scheduled_at : null;
    if (!inWeek(at)) continue;
    const day = dayKey(new Date(at!), tz);
    const key = `${x.video_id}-${day}`;
    if (seenVideoDay.has(key)) continue;
    seenVideoDay.add(key);
    weekItems.push({ day, state: x.post_status === "posted" ? "posted" : "booked", title: x.video_title || titleOfVideo(x.video_id) || "Post", at });
  }
  for (const d of drafts) {
    if (!inWeek(d.slot_at) || d.status === "writing") continue;
    if (d.status === "approved" && d.posted_at) continue; // shown by its posts
    weekItems.push({ day: dayKey(new Date(d.slot_at), tz), state: d.status === "approved" ? "booked" : "needs", title: d.projects?.title || d.topic, at: d.slot_at });
  }
  for (const s of sellers) {
    if (!inWeek(s.slot_at)) continue;
    weekItems.push({ day: dayKey(new Date(s.slot_at), tz), state: s.status === "sent" ? "posted" : s.status === "approved" ? "booked" : "needs", title: `Seller update · ${s.seller_listings?.address ?? ""}`, at: s.slot_at });
  }

  // ── Quick insights ──
  type Stat = { social_post_id: string; views: number; metrics: { unavailable?: boolean } | null };
  const stats = ((statsRes.data ?? []) as Stat[]).filter((s) => !s.metrics?.unavailable);
  const postById = new Map(posts.map((x) => [x.id, x]));
  const recentStats = stats.filter((s) => { const x = postById.get(s.social_post_id); return x?.posted_at && now - Date.parse(x.posted_at) < 30 * DAY; });
  const top = recentStats.slice().sort((a, b) => b.views - a.views)[0];
  const insights = {
    views: recentStats.length ? recentStats.reduce((n, s) => n + s.views, 0) : null,
    postsOut7: posts.filter((x) => x.post_status === "posted" && x.posted_at && now - Date.parse(x.posted_at) < 7 * DAY).length,
    topTitle: top ? (postById.get(top.social_post_id)?.video_title || titleOfVideo(postById.get(top.social_post_id)?.video_id ?? null)) : null,
    topViews: top?.views ?? null,
    hasStats: stats.length > 0,
  };

  // ── My Sparks ──
  type Blog = { id: string; title: string | null; created_at: string; ai_script: { blog_body?: string } | null };
  const videoProjects = new Set(videos.map((v) => v.project_id));
  const sparks: HomeSpark[] = [
    ...videos.slice(0, 8).map((v) => ({
      id: v.id, kind: "video" as const, title: v.projects?.title || "Untitled video", at: v.created_at,
      status: v.render_status === "completed" ? "Ready" : v.render_status === "failed" ? "Couldn't be made" : "Being made",
      thumbUrl: v.projects?.thumbnail_url ?? null, href: `/videos?highlight=${v.id}`,
    })),
    ...((blogsRes.data ?? []) as Blog[]).filter((b) => !!b.ai_script?.blog_body?.trim() && !videoProjects.has(b.id)).slice(0, 4).map((b) => ({
      id: b.id, kind: "blog" as const, title: b.title || "Untitled article", at: b.created_at, status: "Blog",
      thumbUrl: null, href: `/create/${b.id}?step=5`,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 7);

  const usage = {
    shortLeft: availableFor(p as never, "short"),
    perMonth: SHORT_PER_MONTH[p.subscription_tier ?? ""] ?? 0,
    bought: Number(p.purchased_short_videos ?? 0),
    unlimited: isAdmin,
    renewsAt: p.current_period_end,
    images: { used: imagesUsed as number, limit: IMAGE_MONTHLY_LIMIT },
    autoSparksThisMonth: autoMonth.count ?? 0,
  };

  const opportunities = opportunitiesFor({
    paid, city: p.location_city, connected, posts, stats, postById, titleOfVideo, now,
    weekItems, today, tz, usage, sites: sites.filter((s) => !s.is_affiliate).length, website: p.website,
    pages: (pagesRes.data ?? []) as { id: string; title: string | null; url: string }[],
    listings: (listingsRes.data ?? []) as { id: string; address: string; seller_names: string | null; archived_at: string | null }[],
    sellerUpdatesThisWeek: new Set(sellers.map((s) => s.listing_id)),
  });

  return {
    name: p.full_name, paid, admin: isAdmin, tier: p.subscription_tier ?? "free",
    city: p.location_city, state: p.location_state, timeZone: tz,
    usage, connected, crm: { boldtrail: !!crmRow.data }, sites: sites.length,
    approvals: approvals.slice(0, 8), working: working.slice(0, 8),
    week: { start: weekStart, today, items: weekItems },
    insights, opportunities, sparks,
    whatsNew: whatsNewItems.slice(0, 3).map((i) => ({ id: i.id, title: i.title, description: i.description, releaseDate: i.releaseDate })),
  };
}

/**
 * Opportunities Sparklee Found: each one from a real signal.
 * - a new page on a site they watch (Halo or their own website)
 * - a post that did well above their usual
 * - a connected account with nothing posted for 7+ days
 * - an open listing with no seller update this week; a listing closed recently
 * - an empty stretch in this week's calendar
 * - plan videos left close to renewal
 * - their market's research questions (the answer-block tool), when unused
 */
function opportunitiesFor(x: {
  paid: boolean; city: string | null; connected: string[];
  posts: { id: string; video_id: string | null; platform: string; post_status: string; posted_at: string | null; video_title: string | null }[];
  stats: { social_post_id: string; views: number }[];
  postById: Map<string, { video_id: string | null; video_title: string | null; posted_at: string | null }>;
  titleOfVideo: (id: string | null) => string | null;
  now: number; weekItems: HomeWeekItem[]; today: string; tz: string;
  usage: { shortLeft: number; renewsAt: string | null; unlimited: boolean };
  sites: number; website: string | null;
  pages: { id: string; title: string | null; url: string }[];
  listings: { id: string; address: string; seller_names: string | null; archived_at: string | null }[];
  sellerUpdatesThisWeek: Set<string>;
}): HomeOpportunity[] {
  const out: HomeOpportunity[] = [];
  const town = x.city || "my town";

  for (const pg of x.pages.slice(0, 2)) {
    const t = pg.title || pg.url.replace(/^https?:\/\//, "").slice(0, 60);
    out.push({ id: `page-${pg.id}`, icon: "🌐", title: `New on your site: ${t}`, detail: "Turn it into a short video", ask: `Make a short video from my new page "${t}" (${pg.url}).` });
  }
  if (x.sites === 0 && x.website && x.paid) {
    out.push({ id: "watch-site", icon: "🔗", title: "Watch your website for new pages", detail: x.website.replace(/^https?:\/\//, ""), href: "/autosparks", hrefLabel: "Add it" });
  }

  // Did well: a post from the last 30 days at 2x+ their median views.
  const recent = x.stats.filter((s) => { const p = x.postById.get(s.social_post_id); return p?.posted_at && x.now - Date.parse(p.posted_at) < 30 * DAY; });
  if (recent.length >= 4) {
    const views = recent.map((s) => s.views).sort((a, b) => a - b);
    const median = views[Math.floor(views.length / 2)] || 0;
    const best = recent.slice().sort((a, b) => b.views - a.views)[0];
    if (median > 0 && best.views >= median * 2) {
      const p = x.postById.get(best.social_post_id);
      const t = p?.video_title || x.titleOfVideo(p?.video_id ?? null) || "A recent video";
      out.push({ id: `top-${best.social_post_id}`, icon: "📈", title: `"${t}" got ${Math.round(best.views / median)}× your usual views`, detail: "Make a follow-up", ask: `Make a follow-up video to "${t}", which did well.` });
    }
  }

  // Quiet accounts.
  for (const pl of x.connected) {
    const last = x.posts.filter((p) => p.platform === pl && p.post_status === "posted" && p.posted_at)
      .map((p) => Date.parse(p.posted_at!)).sort((a, b) => b - a)[0];
    const days = last ? Math.floor((x.now - last) / DAY) : null;
    if (days !== null && days >= 7) {
      out.push({ id: `quiet-${pl}`, icon: "💤", title: `${platformLabel(pl)} quiet ${days} days`, detail: "Post something this week", ask: `I haven't posted on ${platformLabel(pl)} in ${days} days. Make something for it this week.` });
    }
    if (out.filter((o) => o.id.startsWith("quiet-")).length >= 2) break;
  }

  // Listings.
  for (const l of x.listings.filter((l) => !l.archived_at && !x.sellerUpdatesThisWeek.has(l.id)).slice(0, 1)) {
    out.push({ id: `seller-${l.id}`, icon: "🏡", title: `Seller update due: ${l.address}`, detail: l.seller_names ? `For ${l.seller_names}` : "This week's numbers", href: `/tools?tab=seller&listing=${l.id}`, hrefLabel: "Open" });
  }
  for (const l of x.listings.filter((l) => l.archived_at && x.now - Date.parse(l.archived_at) < 30 * DAY).slice(0, 1)) {
    out.push({ id: `review-${l.id}`, icon: "⭐", title: `${l.address} wrapped up`, detail: l.seller_names ? `Ask ${l.seller_names} for a Google review` : "Ask for a Google review", href: "/tools?tab=review", hrefLabel: "Open" });
  }

  // Empty stretch: the next 3 days with nothing posted, booked or waiting.
  const busy = new Set(x.weekItems.map((i) => i.day));
  const empty = [0, 1, 2].map((n) => addDays(x.today, n)).filter((d) => !busy.has(d));
  if (x.paid && empty.length >= 2) {
    out.push({ id: "gap", icon: "📅", title: `Nothing planned for ${empty.length === 3 ? "the next 3 days" : "2 of the next 3 days"}`, detail: "Fill the gap", ask: "Fill the open days in my week." });
  }

  // Plan capacity close to renewal.
  if (!x.usage.unlimited && x.usage.shortLeft > 0 && x.usage.renewsAt) {
    const days = Math.ceil((Date.parse(x.usage.renewsAt) - x.now) / DAY);
    if (days > 0 && days <= 10) {
      out.push({ id: "capacity", icon: "🎟️", title: `${x.usage.shortLeft} video${x.usage.shortLeft === 1 ? "" : "s"} left, plan renews in ${days} day${days === 1 ? "" : "s"}`, detail: "Use them before they reset", ask: `Plan ${Math.min(x.usage.shortLeft, 3)} videos for this week.` });
    }
  }

  // What buyers research about their market.
  if (x.city) {
    out.push({ id: "research", icon: "🔎", title: `Buyers are researching: Is ${town} a good place to live?`, detail: "Answer it for your site + a short video", ask: `Make a short video answering "Is ${town} a good place to live?" for buyers researching ${town}.` });
  }

  return out.slice(0, 7);
}
