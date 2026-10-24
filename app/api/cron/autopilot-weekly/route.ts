import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AUTOPILOT_PROFILE_SELECT,
  autopilotEligible,
  mondayFor,
  startDrafts,
  zoneOf,
  type AutopilotProfile,
} from "@/lib/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * GET /api/cron/autopilot-weekly — Sunday evening (vercel.json).
 *
 * Writes next week's three drafts for every paid account with Autopilot on
 * (lib/autopilot.ts). Skips anyone who already has the Sunday drafts for that
 * week, so a second run writes nothing twice. A few accounts at a time: each
 * draft is a writer call of about a minute.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(AUTOPILOT_PROFILE_SELECT)
    .eq("autopilot_enabled", true);
  const profiles = ((data ?? []) as AutopilotProfile[]).filter(autopilotEligible);

  const results: { userId: string; drafts: number; error?: string }[] = [];
  const queue = [...profiles];
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const monday = mondayFor(new Date(), zoneOf(p));
        const { count } = await admin
          .from("autopilot_drafts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id)
          .eq("week_of", monday)
          .eq("requested", false)
          // Halo drafts share the table and are not the Sunday three.
          .eq("source", "autosparks");
        if ((count ?? 0) > 0) { results.push({ userId: p.id, drafts: 0 }); continue; }
        const { ids, written } = await startDrafts(admin, p);
        await written;
        results.push({ userId: p.id, drafts: ids.length });
      } catch (err) {
        results.push({ userId: p.id, drafts: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, profiles.length) }, worker));
  return NextResponse.json({ accounts: profiles.length, results });
}
