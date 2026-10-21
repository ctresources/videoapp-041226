import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUTOPILOT_PROFILE_SELECT, autopilotEligible, mondayFor, zoneOf, type AutopilotProfile } from "@/lib/autopilot";
import { sendAutopilotWeek } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/autopilot-email — Monday morning (vercel.json).
 *
 * "Your week is ready" to every account whose Sunday drafts are written and
 * waiting. Only the Sunday drafts count; asked-for ideas are already in front
 * of whoever asked.
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
  const profiles = ((data ?? []) as AutopilotProfile[]).filter((p) => autopilotEligible(p) && !!p.email);

  let sent = 0;
  for (const p of profiles) {
    const monday = mondayFor(new Date(), zoneOf(p));
    const { data: drafts } = await admin
      .from("autopilot_drafts")
      .select("kind")
      .eq("user_id", p.id)
      .eq("week_of", monday)
      .eq("requested", false)
      .eq("status", "draft");
    const list = (drafts ?? []) as { kind: string }[];
    if (!list.length) continue;
    const ok = await sendAutopilotWeek({
      email: p.email!,
      name: p.full_name,
      videos: list.filter((d) => d.kind === "video").length,
      blogs: list.filter((d) => d.kind === "blog").length,
      monday,
    });
    if (ok) sent++;
  }
  return NextResponse.json({ accounts: profiles.length, sent });
}
