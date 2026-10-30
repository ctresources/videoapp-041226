import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Video Business Card (2026-10-30, the owner's approved mockup).
 *
 * One card per agent at /card/<slug>: their Agent Intro (or a video they
 * pick), the details already in Settings, and the links they switch on. The
 * video card (lib/card/video-card.ts) is the same intro with a name strip and
 * an end card whose QR code opens this page.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface CardSettings {
  /** Under the name, e.g. "REALTOR®". */
  title?: string;
  bookingUrl?: string;
  homeValueUrl?: string;
  showReviews?: boolean;
  showYouTube?: boolean;
  /** #rrggbb; otherwise their first brand colour. */
  color?: string;
  /** A video they picked; otherwise their newest Agent Intro. */
  videoId?: string | null;
}

export interface CardProfile {
  full_name: string | null; company_name: string | null; email: string | null;
  phone: string | null; mobile_phone: string | null; company_phone: string | null;
  website: string | null; logo_url: string | null; avatar_url: string | null;
  location_city: string | null; location_state: string | null; license_number: string | null;
  google_review_url: string | null; youtube_channel_id: string | null; brand_colors: string[] | null;
}
export const CARD_PROFILE_SELECT =
  "full_name, company_name, email, phone, mobile_phone, company_phone, website, logo_url, avatar_url, location_city, location_state, license_number, google_review_url, youtube_channel_id, brand_colors";

export interface CardVideo { id: string; url: string; poster: string | null; vertical: boolean; title: string }

export interface Card {
  userId: string; slug: string; settings: CardSettings; profile: CardProfile;
  video: CardVideo | null; videoCardUrl: string | null; videoCardMadeAt: string | null;
}

export const DEFAULT_CARD_COLOR = "#1B5E82";
export const cardColor = (c: Card) => {
  const pick = [c.settings.color, ...(c.profile.brand_colors ?? [])].find((x) => typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x));
  return pick ?? DEFAULT_CARD_COLOR;
};
export const cardPhone = (p: CardProfile) => p.mobile_phone || p.phone || p.company_phone || null;
export const cardTitle = (c: Card) => c.settings.title?.trim() || "REALTOR®";
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.sparkreels.ai").replace(/\/$/, "").replace("://sparkreels.ai", "://www.sparkreels.ai");
export const cardUrl = (slug: string) => `${appUrl()}/card/${slug}`;
export const withHttps = (u?: string | null) => (u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : null);

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "agent";

/** Cleans what the agent saved. */
export function sanitizeSettings(raw: unknown): CardSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const url = (v: unknown) => {
    const s = typeof v === "string" ? v.trim().slice(0, 400) : "";
    if (!s) return undefined;
    const u = withHttps(s)!;
    return /^https?:\/\/[^\s]+\.[^\s]+/.test(u) ? u : undefined;
  };
  return {
    title: typeof r.title === "string" ? r.title.trim().slice(0, 60) : undefined,
    bookingUrl: url(r.bookingUrl),
    homeValueUrl: url(r.homeValueUrl),
    showReviews: r.showReviews !== false,
    showYouTube: r.showYouTube !== false,
    color: typeof r.color === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : undefined,
    videoId: typeof r.videoId === "string" && /^[0-9a-f-]{36}$/i.test(r.videoId) ? r.videoId : null,
  };
}

/** The card's video: the one picked, else their newest finished Agent Intro. */
export async function cardVideoFor(admin: Admin, userId: string, videoId?: string | null): Promise<CardVideo | null> {
  type Row = { id: string; video_url: string | null; video_type: string | null; render_status: string | null; projects: { title: string | null; thumbnail_url: string | null } | null };
  const sel = "id, video_url, video_type, render_status, projects!inner(title, thumbnail_url, ai_script)";
  let row: Row | null = null;
  if (videoId) {
    const { data } = await admin.from("generated_videos").select("id, video_url, video_type, render_status, projects(title, thumbnail_url)")
      .eq("id", videoId).eq("user_id", userId).maybeSingle();
    row = data as unknown as Row | null;
  }
  if (!row?.video_url || row.render_status !== "completed") {
    const { data } = await admin.from("generated_videos").select(sel)
      .eq("user_id", userId).eq("render_status", "completed").not("video_url", "is", null)
      .eq("projects.ai_script->>kind", "agent_intro")
      .order("created_at", { ascending: false }).limit(1);
    row = ((data ?? [])[0] as unknown as Row) ?? null;
  }
  if (!row?.video_url) return null;
  return {
    id: row.id, url: row.video_url, poster: row.projects?.thumbnail_url ?? null,
    vertical: row.video_type === "reel_9x16", title: row.projects?.title ?? "My intro",
  };
}

/** The agent's card, made the first time it's asked for. */
export async function ensureCard(admin: Admin, userId: string): Promise<{ slug: string; settings: CardSettings; video_card_url: string | null; video_card_made_at: string | null }> {
  const { data: have } = await admin.from("business_cards").select("slug, settings, video_card_url, video_card_made_at").eq("user_id", userId).maybeSingle();
  if (have) return { ...(have as { slug: string; video_card_url: string | null; video_card_made_at: string | null }), settings: sanitizeSettings((have as { settings: unknown }).settings) };
  const { data: prof } = await admin.from("profiles").select("full_name").eq("id", userId).single();
  const base = slugify((prof as { full_name: string | null } | null)?.full_name || "agent");
  for (let n = 0; n < 20; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const { error } = await admin.from("business_cards").insert({ user_id: userId, slug, settings: {} });
    if (!error) return { slug, settings: {}, video_card_url: null, video_card_made_at: null };
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  const slug = `${base}-${userId.slice(0, 6)}`;
  await admin.from("business_cards").insert({ user_id: userId, slug, settings: {} });
  return { slug, settings: {}, video_card_url: null, video_card_made_at: null };
}

export async function loadCardBySlug(admin: Admin, slug: string): Promise<Card | null> {
  const { data } = await admin.from("business_cards").select("user_id, slug, settings, video_card_url, video_card_made_at").eq("slug", slug.toLowerCase()).maybeSingle();
  const row = data as { user_id: string; slug: string; settings: unknown; video_card_url: string | null; video_card_made_at: string | null } | null;
  if (!row) return null;
  return loadCard(admin, row.user_id, row);
}

export async function loadCard(admin: Admin, userId: string, row?: { slug: string; settings: unknown; video_card_url: string | null; video_card_made_at: string | null }): Promise<Card> {
  const r = row ?? await ensureCard(admin, userId);
  const settings = sanitizeSettings(r.settings);
  const [{ data: prof }, video] = await Promise.all([
    admin.from("profiles").select(CARD_PROFILE_SELECT).eq("id", userId).single(),
    cardVideoFor(admin, userId, settings.videoId),
  ]);
  return {
    userId, slug: r.slug, settings, profile: (prof ?? {}) as CardProfile, video,
    videoCardUrl: r.video_card_url, videoCardMadeAt: r.video_card_made_at,
  };
}

/** A contact card (vCard 3.0) for Save my contact. */
export function vcardFor(c: Card): string {
  const p = c.profile;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const name = (p.full_name || "Agent").trim();
  const parts = name.split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : name;
  const lines = [
    "BEGIN:VCARD", "VERSION:3.0",
    `N:${esc(last)};${esc(first)};;;`, `FN:${esc(name)}`,
    p.company_name && `ORG:${esc(p.company_name)}`,
    `TITLE:${esc(cardTitle(c))}`,
    cardPhone(p) && `TEL;TYPE=CELL:${esc(cardPhone(p)!)}`,
    p.company_phone && p.company_phone !== cardPhone(p) && `TEL;TYPE=WORK:${esc(p.company_phone)}`,
    p.email && `EMAIL;TYPE=INTERNET:${esc(p.email)}`,
    p.website && `URL:${esc(withHttps(p.website)!)}`,
    `URL;TYPE=card:${cardUrl(c.slug)}`,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

export const CARD_EVENTS = ["open", "play", "call", "text", "email", "website", "book", "save", "home_value", "reviews", "youtube"] as const;
