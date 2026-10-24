import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autopilotEligible } from "@/lib/autopilot";
import { HALO_PROFILE_SELECT, morningRun, type HaloProfile } from "@/lib/halo";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * GET /api/cron/halo-daily — every morning (vercel.json).
 *
 * For each paid agent with a Halo site: read the sites for new pages and
 * changes, then write drafts for the open Halo days in the next ten
 * (lib/halo/index.ts). A few agents at a time; each draft is a writer call of
 * about a minute.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: siteRows } = await admin.from("halo_sites").select("user_id");
  const userIds = Array.from(new Set(((siteRows ?? []) as { user_id: string }[]).map((r) => r.user_id)));
  if (!userIds.length) return NextResponse.json({ accounts: 0 });

  const { data } = await admin.from("profiles").select(HALO_PROFILE_SELECT).in("id", userIds);
  const profiles = ((data ?? []) as HaloProfile[]).filter(autopilotEligible);

  const results: { userId: string; checked: number; drafts: number; error?: string }[] = [];
  const queue = [...profiles];
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        results.push({ userId: p.id, ...(await morningRun(admin, p)) });
      } catch (err) {
        results.push({ userId: p.id, checked: 0, drafts: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, profiles.length) }, worker));
  return NextResponse.json({ accounts: profiles.length, results });
}
