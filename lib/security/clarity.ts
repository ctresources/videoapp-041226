/**
 * Clarity's numbers for the Monday watch email (2026-11-12, the owner's ask).
 *
 * The export (learn.microsoft.com "Clarity Data Export API") gives the last
 * 1-3 days only, 10 requests a project a day, by up to three dimensions. A
 * daily cron saves yesterday by URL in clarity_snapshots; summarizeWeek adds
 * the saved days up.
 *
 * The docs show only the Traffic metric's fields, so the reader is careful:
 * metric names are compared without spaces or case, and a row's count is the
 * first numeric field it has from a short list.
 */
export const CLARITY_PROJECT = "z0tfc6nfor";
export const CLARITY_DASHBOARD = `https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT}/dashboard`;
const EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

/** Yesterday's numbers by page, or why not. */
export async function fetchClarityDay(): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) return { ok: false, reason: "CLARITY_API_TOKEN is not set" };
  const res = await fetch(`${EXPORT_URL}?numOfDays=1&dimension1=URL`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) return { ok: false, reason: "Clarity didn't answer" };
  if (!res.ok) return { ok: false, reason: `Clarity ${res.status}` };
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return { ok: false, reason: "Clarity sent something unexpected" };
  return { ok: true, data };
}

const KEYS = {
  traffic: "traffic",
  rage: "rageclickcount",
  dead: "deadclickcount",
  quickback: "quickbackclick",
  errorClick: "errorclickcount",
  scriptError: "scripterrorcount",
} as const;
type Key = keyof typeof KEYS;

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const COUNT_FIELDS = ["subTotal", "sessionsCount", "sessionCount", "count", "totalSessionCount"];

/** Path only: no domain, query or trailing slash. */
function pathOf(row: Record<string, unknown>): string {
  const raw = String(row.URL ?? row.Url ?? row.url ?? "").trim();
  if (!raw) return "(all pages)";
  try {
    const p = new URL(raw, "https://www.sparkreels.ai").pathname.replace(/\/+$/, "");
    return p || "/";
  } catch {
    return raw.split("?")[0];
  }
}

function countOf(row: Record<string, unknown>): number {
  for (const f of COUNT_FIELDS) if (row[f] !== undefined) return num(row[f]);
  return 0;
}

export interface ClarityWeek {
  days: number;
  sessions: number;
  botSessions: number;
  /** Top pages for each problem, most first. */
  top: Record<Exclude<Key, "traffic">, { path: string; count: number }[]>;
  totals: Record<Exclude<Key, "traffic">, number>;
}

/** Adds up the saved days. */
export function summarizeWeek(snapshots: unknown[]): ClarityWeek {
  const byKey = new Map<Key, Map<string, number>>();
  let sessions = 0;
  let botSessions = 0;
  for (const snap of snapshots) {
    if (!Array.isArray(snap)) continue;
    for (const metric of snap as { metricName?: unknown; information?: unknown }[]) {
      const name = norm(metric?.metricName);
      const key = (Object.keys(KEYS) as Key[]).find((k) => KEYS[k] === name);
      if (!key || !Array.isArray(metric.information)) continue;
      for (const row of metric.information as Record<string, unknown>[]) {
        if (key === "traffic") {
          sessions += num(row.totalSessionCount);
          botSessions += num(row.totalBotSessionCount);
          continue;
        }
        const m = byKey.get(key) ?? new Map<string, number>();
        const path = pathOf(row);
        m.set(path, (m.get(path) ?? 0) + countOf(row));
        byKey.set(key, m);
      }
    }
  }
  const pick = (k: Exclude<Key, "traffic">) =>
    Array.from((byKey.get(k) ?? new Map<string, number>()).entries())
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([path, count]) => ({ path, count }));
  const keys = ["rage", "dead", "quickback", "errorClick", "scriptError"] as const;
  const top = {} as ClarityWeek["top"];
  const totals = {} as ClarityWeek["totals"];
  keys.forEach((k) => {
    const all = pick(k);
    top[k] = all.slice(0, 5);
    totals[k] = all.reduce((n, r) => n + r.count, 0);
  });
  return { days: snapshots.length, sessions, botSessions, top, totals };
}
