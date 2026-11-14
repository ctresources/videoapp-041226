import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSecurityWatchEmail } from "@/lib/email";
import { findProbe } from "@/lib/security/probe";
import { hasAdminPerks } from "@/lib/utils/roles";
import { CLARITY_DASHBOARD, clarityToken, summarizeWeek } from "@/lib/security/clarity";
import { recentChecks, summarizeTown } from "@/lib/ai-visibility/summary";
import type { TownQuestion } from "@/lib/ai-visibility/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_URL = "https://www.sparkreels.ai/admin";
const DAY = 86_400_000;

/**
 * GET /api/cron/security-watch — Mondays (vercel.json). The weekly watch
 * email to support@ (2026-11-12, the owner's ask: "how will I know if someone
 * is trying to steal how the app works").
 *
 * Lists only the warning signs from the last 7 days:
 *   1. Asks for the AI's instructions or how SparkReels is built — typed,
 *      spoken or asked of Sparklee (security_events, and the website chat).
 *   2. Accounts making far more than usual.
 *   3. Three or more new accounts signing in from the same address.
 * A quiet week is one line saying so. Then Clarity's week: rage clicks,
 * dead clicks, quick backs and errors by page (lib/security/clarity.ts).
 * Then the AI crawlers that read the site, counted in middleware.ts. Then
 * each agent's AI visibility from Sunday night's check (2026-11-14).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = Date.now();
  const since = new Date(now - 7 * DAY).toISOString();
  const baselineFrom = new Date(now - 35 * DAY).toISOString();

  const [events, publicQs, recentProjects, olderProjects, shared, clarityRows, crawlerRows] = await Promise.all([
    admin.from("security_events").select("user_id, source, detail, created_at")
      .eq("kind", "prompt_probe").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
    admin.from("public_sparklee_questions").select("question, page, ip_hash, created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    admin.from("projects").select("user_id").gte("created_at", since).limit(10000),
    admin.from("projects").select("user_id").gte("created_at", baselineFrom).lt("created_at", since).limit(20000),
    admin.rpc("security_shared_signups", { since }),
    // Clarity, saved each morning by /api/cron/clarity-daily (2026-11-12).
    admin.from("clarity_snapshots").select("data").gte("day", since.slice(0, 10)).order("day"),
    // AI crawler visits, counted in middleware.ts (2026-11-12).
    admin.from("ai_crawler_daily").select("bot, path, hits").gte("day", since.slice(0, 10)).limit(20000),
  ]);

  // ── 1. Asks for the instructions ──────────────────────────────────────────
  const probeRows = ((events.data ?? []) as { user_id: string | null; source: string; detail: string | null; created_at: string }[]);
  const websiteProbes = ((publicQs.data ?? []) as { question: string; page: string | null; ip_hash: string; created_at: string }[])
    .filter((q) => findProbe(q.question));

  // ── 2. Heavy use ──────────────────────────────────────────────────────────
  const tally = (rows: { user_id: string }[] | null) => {
    const m = new Map<string, number>();
    (rows ?? []).forEach((r) => m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1));
    return m;
  };
  const thisWeek = tally(recentProjects.data as { user_id: string }[] | null);
  const before = tally(olderProjects.data as { user_id: string }[] | null);
  // Flagged at 25+ in a week, or 10+ and more than three times their usual week.
  const heavyIds = Array.from(thisWeek.entries())
    .filter(([id, n]) => n >= 25 || (n >= 10 && n > 3 * ((before.get(id) ?? 0) / 4)))
    .map(([id]) => id);

  // ── Names for everyone mentioned; staff and admins are left off ──────────
  const ids = Array.from(new Set([...probeRows.map((r) => r.user_id).filter((x): x is string => !!x), ...heavyIds]));
  const people = new Map<string, { name: string; email: string; role: string | null }>();
  if (ids.length) {
    const { data } = await admin.from("profiles").select("id, full_name, email, role").in("id", ids);
    ((data ?? []) as { id: string; full_name: string | null; email: string | null; role: string | null }[])
      .forEach((p) => people.set(p.id, { name: p.full_name || "(no name)", email: p.email || "", role: p.role }));
  }
  const isStaff = (id: string | null) => !!id && hasAdminPerks(people.get(id)?.role ?? null);
  const who = (id: string | null) => {
    if (!id) return "Not signed in";
    const p = people.get(id);
    return p ? `${p.name} (${p.email})` : id;
  };

  const probes = probeRows.filter((r) => !isStaff(r.user_id));
  const heavy = heavyIds.filter((id) => !isStaff(id))
    .map((id) => ({ id, n: thisWeek.get(id) ?? 0, usual: Math.round((before.get(id) ?? 0) / 4) }))
    .sort((a, b) => b.n - a.n);
  const sharedRows = ((shared.data ?? []) as { ip: string; accounts: number; emails: string[] }[]);

  // ── The email ─────────────────────────────────────────────────────────────
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const clip = (s: string | null, n = 180) => { const t = (s ?? "").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

  const sections: { title: string; lines: string[] }[] = [];
  const asks = [
    ...probes.map((r) => `${day(r.created_at)} · ${who(r.user_id)} · ${r.source}: "${clip(r.detail)}"`),
    ...websiteProbes.map((q) => `${day(q.created_at)} · Website visitor ${q.ip_hash.slice(0, 6)} · website Sparklee: "${clip(q.question)}"`),
  ];
  if (asks.length) sections.push({ title: "Asked for the AI's instructions or how SparkReels works", lines: asks });
  if (heavy.length) {
    sections.push({
      title: "Made far more than usual",
      lines: heavy.map((h) => `${who(h.id)} · ${h.n} projects this week (usually about ${h.usual})`),
    });
  }
  if (sharedRows.length) {
    sections.push({
      title: "Several new accounts from the same place",
      lines: sharedRows.map((s) => `${s.accounts} new accounts from one address: ${s.emails.join(", ")}`),
    });
  }

  const count = sections.reduce((n, s) => n + s.lines.length, 0);
  const subject = count ? `Watch: ${count} thing${count === 1 ? "" : "s"} to look at this week` : "Watch: all quiet this week";
  const intro = count
    ? "These came up in the last 7 days. Nothing has been done about them; look before acting."
    : "Nothing unusual in the last 7 days.";

  // ── Clarity: where people got stuck (not counted in the subject) ─────────
  const snaps = ((clarityRows.data ?? []) as { data: unknown }[]).map((r) => r.data);
  const cw = summarizeWeek(snaps);
  const clarityLines: string[] = [];
  if (!snaps.length) {
    clarityLines.push(clarityToken()
      ? "No Clarity days saved yet. They start the morning after the token was added."
      : "Not connected yet: add CLARITY_API_TOKEN in Vercel to see this.");
  } else {
    clarityLines.push(`${cw.sessions.toLocaleString("en-US")} visits over ${cw.days} day${cw.days === 1 ? "" : "s"}` +
      (cw.botSessions ? ` (${cw.botSessions.toLocaleString("en-US")} were bots)` : ""));
    const pages = (rows: { path: string; count: number }[]) => rows.map((r) => `${r.path} ${r.count}`).join(", ");
    const add = (label: string, k: keyof typeof cw.top) => {
      if (cw.totals[k]) clarityLines.push(`${label}: ${cw.totals[k]} · most on ${pages(cw.top[k])}`);
    };
    add("Rage clicks (tapping the same spot in frustration)", "rage");
    add("Dead clicks (tapping something that does nothing)", "dead");
    add("Quick backs (left a page right away)", "quickback");
    add("Clicks that hit an error", "errorClick");
    add("Page errors", "scriptError");
    if (clarityLines.length === 1) clarityLines.push("No rage clicks, dead clicks, quick backs or errors.");
  }
  const clarityTitle = "Where people got stuck (Clarity)";

  // ── AI crawlers: which AIs read the site, and which pages ────────────────
  const bots = new Map<string, { hits: number; pages: Map<string, number> }>();
  ((crawlerRows.data ?? []) as { bot: string; path: string; hits: number }[]).forEach((r) => {
    const b = bots.get(r.bot) ?? { hits: 0, pages: new Map<string, number>() };
    b.hits += r.hits;
    b.pages.set(r.path, (b.pages.get(r.path) ?? 0) + r.hits);
    bots.set(r.bot, b);
  });
  const crawlerTitle = "AI crawlers that read your site";
  const crawlerLines = bots.size
    ? Array.from(bots.entries()).sort((a, b) => b[1].hits - a[1].hits).map(([name, b]) => {
        const top = Array.from(b.pages.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3)
          .map(([p, n]) => `${p} ${n}`).join(", ");
        return `${name}: ${b.hits.toLocaleString("en-US")} page${b.hits === 1 ? "" : "s"} · most read ${top}`;
      })
    : ["No AI crawlers this week."];

  // ── AI visibility: each agent's towns, checked Sunday night (2026-11-14) ─
  const { data: visTowns } = await admin.from("ai_visibility_towns")
    .select("id, user_id, town, state, status, last_checked_at, questions").limit(2000);
  const vt = (visTowns ?? []) as { id: string; user_id: string; town: string; state: string; status: string | null; last_checked_at: string | null; questions: TownQuestion[] | null }[];
  const visRows = await recentChecks(admin, vt.map((t) => t.id));
  const visIds = Array.from(new Set(vt.map((t) => t.user_id)));
  const visNames = new Map<string, string>();
  if (visIds.length) {
    const { data: vp } = await admin.from("profiles").select("id, full_name, email").in("id", visIds);
    ((vp ?? []) as { id: string; full_name: string | null; email: string | null }[])
      .forEach((p) => visNames.set(p.id, p.full_name || p.email || "(no name)"));
  }
  const visLines = vt
    .filter((t) => t.last_checked_at && now - new Date(t.last_checked_at).getTime() < 7 * DAY)
    .map((t) => ({ t, s: summarizeTown(t, visRows) }))
    .filter(({ s }) => s.week)
    .sort((a, b) => (b.s.named + b.s.cited) - (a.s.named + a.s.cited))
    .map(({ t, s }) => {
      const move = s.prevNamed === null ? "first week" : s.named === s.prevNamed ? "same" : s.named > s.prevNamed ? `up ${s.named - s.prevNamed}` : `down ${s.prevNamed - s.named}`;
      return `${visNames.get(t.user_id) ?? t.user_id} (${t.town}, ${t.state}): named ${s.named} of ${s.answers} (${move}), cited ${s.cited}`;
    });
  const visTitle = "AI visibility this week";
  const visList = visLines.length ? visLines : ["No towns checked this week."];

  const text = [
    intro, "",
    ...sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `- ${l}`), ""]),
    count ? `Look people up in Admin: ${ADMIN_URL}` : "",
    "",
    clarityTitle.toUpperCase(), ...clarityLines.map((l) => `- ${l}`),
    snaps.length ? `Watch the recordings: ${CLARITY_DASHBOARD}` : "",
    "",
    crawlerTitle.toUpperCase(), ...crawlerLines.map((l) => `- ${l}`),
    "",
    visTitle.toUpperCase(), ...visList.map((l) => `- ${l}`),
    `See every agent in Admin: ${ADMIN_URL}`,
  ].join("\n").trim();
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f1f1f">` +
    `<p>${esc(intro)}</p>` +
    sections.map((s) =>
      `<p style="margin:18px 0 6px;font-weight:bold">${esc(s.title)}</p>` +
      `<ul style="margin:0;padding-left:20px">${s.lines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("")}</ul>`,
    ).join("") +
    (count ? `<p style="margin-top:18px"><a href="${ADMIN_URL}">Look people up in Admin</a></p>` : "") +
    `<p style="margin:24px 0 6px;font-weight:bold">${esc(clarityTitle)}</p>` +
    `<ul style="margin:0;padding-left:20px">${clarityLines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("")}</ul>` +
    (snaps.length ? `<p style="margin-top:12px"><a href="${CLARITY_DASHBOARD}">Watch the recordings in Clarity</a></p>` : "") +
    `<p style="margin:24px 0 6px;font-weight:bold">${esc(crawlerTitle)}</p>` +
    `<ul style="margin:0;padding-left:20px">${crawlerLines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("")}</ul>` +
    `<p style="margin:24px 0 6px;font-weight:bold">${esc(visTitle)}</p>` +
    `<ul style="margin:0;padding-left:20px">${visList.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("")}</ul>` +
    `<p style="margin-top:12px"><a href="${ADMIN_URL}">See every agent in Admin</a></p>` +
    `</div>`;

  const sent = await sendSecurityWatchEmail({ subject, html, text });
  return NextResponse.json({ sent, probes: asks.length, heavy: heavy.length, shared: sharedRows.length, clarityDays: snaps.length });
}
