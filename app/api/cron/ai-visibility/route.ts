import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { runTown, TOWN_SELECT, type TownRow } from "@/lib/ai-visibility/run";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const BUDGET_MS = 700_000;
const FRESH_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * GET /api/cron/ai-visibility — Sunday night (vercel.json runs it at 03:00,
 * 05:00 and 07:00 UTC on Mondays, which is Sunday evening to early Monday in
 * the US). Every paid agent's towns are checked, oldest first, 2 towns at a
 * time; a town checked in the last 5 days is skipped, so the later runs pick
 * up whatever the first one didn't reach. 2026-11-14.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = createAdminClient();

  const { data } = await admin.from("ai_visibility_towns").select(TOWN_SELECT).order("last_checked_at", { ascending: true, nullsFirst: true }).limit(1000);
  const towns = ((data ?? []) as (TownRow & { last_checked_at: string | null })[])
    .filter((t) => !t.last_checked_at || Date.now() - new Date(t.last_checked_at).getTime() > FRESH_MS);
  if (!towns.length) return NextResponse.json({ checked: 0 });

  // Paid agents only: a cancelled plan keeps its history but stops costing.
  const ids = Array.from(new Set(towns.map((t) => t.user_id)));
  const { data: profs } = await admin.from("profiles").select("id, role, subscription_tier").in("id", ids);
  const paid = new Set(((profs ?? []) as { id: string; role: string | null; subscription_tier: string | null }[])
    .filter((p) => isPaidLevel(getAccessLevel(p))).map((p) => p.id));
  const queue = towns.filter((t) => paid.has(t.user_id));

  let checked = 0;
  for (let i = 0; i < queue.length; i += 2) {
    if (Date.now() - started > BUDGET_MS) break;
    await Promise.all(queue.slice(i, i + 2).map((t) => runTown(admin, t)));
    checked += Math.min(2, queue.length - i);
  }
  return NextResponse.json({ checked, waiting: queue.length - checked });
}
