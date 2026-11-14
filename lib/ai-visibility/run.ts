import type { createAdminClient } from "@/lib/supabase/admin";
import { askEngine } from "@/lib/ai-visibility/engines";
import { townQuestions } from "@/lib/ai-visibility/questions";
import { ENGINES, type Cited, type Source, type TownQuestion } from "@/lib/ai-visibility/shared";

type Admin = ReturnType<typeof createAdminClient>;

export interface TownRow {
  id: string; user_id: string; town: string; state: string;
  questions: TownQuestion[] | null; questions_edited: boolean; questions_refreshed_at: string | null;
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** The Monday (America/New_York) of the week a moment falls in, as YYYY-MM-DD. */
export function weekOf(d = new Date()): string {
  const [y, m, day] = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, day));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}

// ── Who the agent is, as the answers would show it ─────────────────────────

/** National brands: naming one says nothing about this agent. */
const BIG_BROKERAGES = /\b(keller williams|re\/?max|coldwell banker|century 21|compass|exp realty|berkshire hathaway|long (and|&) foster|howard hanna|sotheby|redfin|weichert|better homes|era real estate|douglas elliman|realty one|homesmart|fathom|real broker|lpt realty|united real estate|engel|corcoran|william raveis|windermere|john l\.? scott|kw)\b/i;

interface Identity {
  names: string[];
  websiteHost: string | null;
  haloHosts: string[];
  cardSlug: string | null;
  channelId: string | null;
  videoIds: Set<string>;
  postUrls: string[];
}

const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
const bare = (u: string) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname}`.toLowerCase().replace(/\/+$/, ""); } catch { return ""; } };
const squash = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9&' ]+/g, " ").replace(/\s+/g, " ").trim();

async function identity(admin: Admin, userId: string): Promise<Identity> {
  const [{ data: prof }, { data: settings }, { data: halo }, { data: card }, { data: posts }] = await Promise.all([
    admin.from("profiles").select("full_name, company_name, youtube_channel_id").eq("id", userId).single(),
    admin.from("ai_visibility_settings").select("website").eq("user_id", userId).maybeSingle(),
    admin.from("halo_sites").select("url").eq("user_id", userId),
    admin.from("business_cards").select("slug").eq("user_id", userId).maybeSingle(),
    admin.from("social_posts").select("platform, platform_post_id, post_url").eq("user_id", userId).eq("post_status", "posted").limit(1000),
  ]);
  const p = prof as { full_name: string | null; company_name: string | null; youtube_channel_id: string | null } | null;
  const names: string[] = [];
  const full = squash(p?.full_name ?? "");
  const parts = full.split(" ").filter(Boolean);
  if (parts.length >= 2 && full.length >= 5) {
    names.push(full);
    if (parts.length >= 3) names.push(`${parts[0]} ${parts[parts.length - 1]}`);
  }
  // A team or brokerage name counts when it is the agent's own, not a national brand.
  const company = squash(p?.company_name ?? "");
  if (company.split(" ").length >= 2 && company.length >= 6 && !BIG_BROKERAGES.test(p?.company_name ?? "")) names.push(company);

  const videoIds = new Set<string>();
  const postUrls: string[] = [];
  ((posts ?? []) as { platform: string; platform_post_id: string | null; post_url: string | null }[]).forEach((r) => {
    if (r.platform === "youtube" && r.platform_post_id) videoIds.add(r.platform_post_id);
    else if (r.post_url) { const b = bare(r.post_url); if (b) postUrls.push(b); }
  });
  const website = (settings as { website: string | null } | null)?.website ?? null;
  return {
    names,
    websiteHost: website ? host(/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    haloHosts: ((halo ?? []) as { url: string }[]).map((h) => host(h.url)).filter((h): h is string => !!h),
    cardSlug: (card as { slug: string } | null)?.slug ?? null,
    channelId: p?.youtube_channel_id ?? null,
    videoIds,
    postUrls,
  };
}

/** The links the app found for the agent, for "Your links" on the page. */
export async function linkSummary(admin: Admin, userId: string) {
  const id = await identity(admin, userId);
  const { data } = await admin.from("ai_visibility_settings").select("website").eq("user_id", userId).maybeSingle();
  return {
    website: (data as { website: string | null } | null)?.website ?? null,
    halo: id.haloHosts.length,
    channel: !!id.channelId,
    videos: id.videoIds.size,
    card: !!id.cardSlug,
    named: id.names.length > 0,
  };
}

/** Which of the answer's sources are the agent's own. */
function citedOf(urls: string[], id: Identity): Cited[] {
  const out: Cited[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    let u: URL;
    try { u = new URL(url); } catch { continue; }
    const h = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    let kind: Cited["kind"] | null = null;
    if (id.websiteHost && (h === id.websiteHost || h.endsWith(`.${id.websiteHost}`))) kind = "website";
    else if (id.haloHosts.includes(h)) kind = "halo";
    else if (id.cardSlug && h.endsWith("sparkreels.ai") && u.pathname.toLowerCase().startsWith(`/card/${id.cardSlug.toLowerCase()}`)) kind = "card";
    else if (h === "youtube.com" || h === "youtu.be") {
      const vid = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts\/|embed\/|live\/)?([\w-]{11})/)?.[1] ?? null;
      if (vid && id.videoIds.has(vid)) kind = "youtube_video";
      else if (id.channelId && u.pathname.includes(`/channel/${id.channelId}`)) kind = "youtube_channel";
    } else if (id.postUrls.length) {
      const b = bare(url);
      if (b && id.postUrls.some((p) => b.startsWith(p))) kind = "social";
    }
    if (kind && !seen.has(url)) { seen.add(url); out.push({ kind, url }); }
  }
  return out;
}

function sourcesOf(urls: string[]): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const d = host(url);
    if (!d || seen.has(url)) continue;
    seen.add(url);
    out.push({ url: url.slice(0, 500), domain: d });
    if (out.length >= 15) break;
  }
  return out;
}

// ── Running a town ─────────────────────────────────────────────────────────

/** Makes sure the town has questions: written the first time, refreshed monthly unless the agent edited them. */
export async function ensureQuestions(admin: Admin, town: TownRow): Promise<TownQuestion[]> {
  const current = Array.isArray(town.questions) ? town.questions : [];
  const stale = !town.questions_refreshed_at || Date.now() - new Date(town.questions_refreshed_at).getTime() > MONTH_MS;
  if (current.length && (town.questions_edited || !stale)) return current;
  const fresh = await townQuestions(town.town, town.state);
  await admin.from("ai_visibility_towns")
    .update({ questions: fresh, questions_refreshed_at: new Date().toISOString() })
    .eq("id", town.id);
  return fresh;
}

/**
 * One full check of a town: every question on every engine, 4 at a time.
 * Replaces this week's rows for the town, so running it twice in a week
 * leaves one set.
 */
export async function runTown(admin: Admin, town: TownRow): Promise<{ named: number; cited: number; checked: number }> {
  await admin.from("ai_visibility_towns").update({ status: "checking" }).eq("id", town.id);
  try {
    const questions = await ensureQuestions(admin, town);
    const id = await identity(admin, town.user_id);
    const jobs = questions.flatMap((q) => ENGINES.map((engine) => ({ q, engine })));
    const rows: Record<string, unknown>[] = [];
    const week = weekOf();
    for (let i = 0; i < jobs.length; i += 4) {
      const done = await Promise.all(jobs.slice(i, i + 4).map(async ({ q, engine }) => {
        const answer = await askEngine(engine, q.q);
        const text = squash(answer?.text ?? "");
        return {
          town_id: town.id, user_id: town.user_id, week_of: week,
          question: q.q, search: q.search, engine,
          ok: !!answer,
          named: !!answer && id.names.some((n) => text.includes(n)),
          cited: answer ? citedOf(answer.urls, id) : [],
          sources: answer ? sourcesOf(answer.urls) : [],
        };
      }));
      rows.push(...done);
    }
    await admin.from("ai_visibility_checks").delete().eq("town_id", town.id).eq("week_of", week);
    if (rows.length) await admin.from("ai_visibility_checks").insert(rows);
    await admin.from("ai_visibility_towns")
      .update({ status: null, last_checked_at: new Date().toISOString() })
      .eq("id", town.id);
    return {
      named: rows.filter((r) => r.named).length,
      cited: rows.reduce((n, r) => n + (r.cited as Cited[]).length, 0),
      checked: rows.filter((r) => r.ok).length,
    };
  } catch (e) {
    console.error(`[ai-visibility] town ${town.id} failed:`, e instanceof Error ? e.message : e);
    await admin.from("ai_visibility_towns").update({ status: null }).eq("id", town.id);
    return { named: 0, cited: 0, checked: 0 };
  }
}

export const TOWN_SELECT = "id, user_id, town, state, questions, questions_edited, questions_refreshed_at, last_checked_at, status, created_at";
