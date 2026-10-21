import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AUTOPILOT_ASKS_PER_WEEK,
  AUTOPILOT_PROFILE_SELECT,
  autopilotEligible,
  mondayFor,
  startDrafts,
  zoneOf,
  type AutopilotProfile,
} from "@/lib/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autopilot/ask — "Ask for ideas" on the Autopilot page (2026-10-21,
 * the owner's ask). { request } → up to three drafts on that, written now
 * rather than on Sunday. Returns once the topics are picked; the writing
 * carries on in the background and the page watches it finish.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { request } = (await req.json().catch(() => ({}))) as { request?: string };
  const ask = (request ?? "").trim().slice(0, 300);
  if (!ask) return NextResponse.json({ error: "Say or type what you'd like ideas about." }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select(AUTOPILOT_PROFILE_SELECT).eq("id", user.id).single();
  const profile = data as AutopilotProfile | null;
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  if (!autopilotEligible(profile)) {
    return NextResponse.json({ error: "AutoSparks is part of the paid plans.", code: "paid_only" }, { status: 403 });
  }

  // A few asks a week: each draft is a writer call, and a few cents.
  const monday = mondayFor(new Date(), zoneOf(profile));
  const { count } = await admin
    .from("autopilot_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("week_of", monday)
    .eq("requested", true);
  const left = AUTOPILOT_ASKS_PER_WEEK - (count ?? 0);
  if (left <= 0) {
    return NextResponse.json({ error: "That's this week's ideas used. More come on Sunday." }, { status: 429 });
  }

  try {
    const { ids, written } = await startDrafts(admin, profile, { request: ask, count: Math.min(3, left) });
    waitUntil(written);
    return NextResponse.json({ ids });
  } catch (err) {
    console.error("[autopilot/ask]", err);
    return NextResponse.json({ error: "Couldn't come up with ideas just now. Try again." }, { status: 502 });
  }
}
