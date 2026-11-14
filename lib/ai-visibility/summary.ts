import type { createAdminClient } from "@/lib/supabase/admin";
import { weekOf } from "@/lib/ai-visibility/run";
import type { Cited, Engine, Source, TownQuestion } from "@/lib/ai-visibility/shared";

type Admin = ReturnType<typeof createAdminClient>;

export interface CheckRow {
  town_id: string; user_id: string; week_of: string; question: string; search: string | null;
  engine: Engine; named: boolean; cited: Cited[]; sources: Source[]; ok: boolean;
}

export interface QuestionResult {
  q: string; search: string | null;
  engines: Partial<Record<Engine, { ok: boolean; named: boolean; cited: Cited[]; domains: string[] }>>;
}

export interface TownSummary {
  id: string; town: string; state: string; status: string | null; lastCheckedAt: string | null;
  questions: TownQuestion[];
  week: string | null;
  named: number; answers: number; cited: number;
  prevNamed: number | null; prevCited: number | null;
  trend: { week: string; named: number; cited: number }[];
  results: QuestionResult[];
  citedInstead: { domain: string; count: number }[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const CHECK_SELECT = "town_id, user_id, week_of, question, search, engine, named, cited, sources, ok";

/** The last 8 weeks of checks for some towns. */
export async function recentChecks(admin: Admin, townIds: string[]): Promise<CheckRow[]> {
  if (!townIds.length) return [];
  const since = weekOf(new Date(Date.now() - 8 * WEEK_MS));
  const { data } = await admin.from("ai_visibility_checks").select(CHECK_SELECT)
    .in("town_id", townIds).gte("week_of", since).limit(5000);
  return (data ?? []) as CheckRow[];
}

/** What one town's page shows, from its rows. */
export function summarizeTown(
  town: { id: string; town: string; state: string; status: string | null; last_checked_at: string | null; questions: TownQuestion[] | null },
  rows: CheckRow[],
  ownDomains: string[] = [],
): TownSummary {
  const mine = rows.filter((r) => r.town_id === town.id);
  const weeks = Array.from(new Set(mine.map((r) => r.week_of))).sort();
  const week = weeks[weeks.length - 1] ?? null;
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const count = (w: string | null) => {
    const r = mine.filter((x) => x.week_of === w);
    return { named: r.filter((x) => x.named).length, cited: r.reduce((n, x) => n + (x.cited?.length ?? 0), 0), answers: r.filter((x) => x.ok).length };
  };
  const now = count(week);
  const before = prev ? count(prev) : null;

  const latest = mine.filter((r) => r.week_of === week);
  const byQ = new Map<string, QuestionResult>();
  for (const r of latest) {
    const item = byQ.get(r.question) ?? { q: r.question, search: r.search, engines: {} };
    item.engines[r.engine] = {
      ok: r.ok, named: r.named, cited: r.cited ?? [],
      domains: Array.from(new Set((r.sources ?? []).map((s) => s.domain))).slice(0, 3),
    };
    byQ.set(r.question, item);
  }
  // In the town's question order; anything checked under an old wording after.
  const order = (town.questions ?? []).map((q) => q.q);
  const results = Array.from(byQ.values()).sort((a, b) => {
    const ia = order.indexOf(a.q), ib = order.indexOf(b.q);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  // Who AI used: every source domain this week that isn't the agent's.
  const cites = new Map<string, number>();
  const own = new Set(ownDomains);
  for (const r of latest) {
    const ownUrls = new Set((r.cited ?? []).map((c) => c.url));
    new Set((r.sources ?? []).filter((s) => !ownUrls.has(s.url) && !own.has(s.domain)).map((s) => s.domain))
      .forEach((d) => cites.set(d, (cites.get(d) ?? 0) + 1));
  }

  return {
    id: town.id, town: town.town, state: town.state, status: town.status, lastCheckedAt: town.last_checked_at,
    questions: town.questions ?? [],
    week, named: now.named, answers: now.answers, cited: now.cited,
    prevNamed: before?.named ?? null, prevCited: before?.cited ?? null,
    trend: weeks.slice(-8).map((w) => ({ week: w, ...count(w) })),
    results,
    citedInstead: Array.from(cites.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([domain, c]) => ({ domain, count: c })),
  };
}
