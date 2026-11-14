import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { aiVisibilitySession, cleanTown } from "@/lib/ai-visibility/session";
import { linkSummary, runTown, TOWN_SELECT, type TownRow } from "@/lib/ai-visibility/run";
import { recentChecks, summarizeTown } from "@/lib/ai-visibility/summary";
import type { TownQuestion } from "@/lib/ai-visibility/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * GET /api/ai-visibility — the agent's AI Visibility section on Spark
 * Insights (2026-11-14, the owner's approved mockup): their towns, this
 * week's results per question, last week's counts, an 8-week trend, who AI
 * cited instead, and the links the app found for them.
 *
 * The first visit starts the first check for their market from Settings, so
 * nobody waits until Sunday to see anything.
 */
export async function GET() {
  const s = await aiVisibilitySession();
  if (!s.ok) return s.response;
  const { admin, profile, limit } = s;

  type Row = TownRow & { last_checked_at: string | null; status: string | null; created_at: string };
  const { data } = await admin.from("ai_visibility_towns").select(TOWN_SELECT).eq("user_id", profile.id).order("created_at");
  let towns = (data ?? []) as Row[];

  if (!towns.length && limit > 0) {
    const first = cleanTown(profile.location_city, profile.location_state);
    if (first) {
      const { data: made } = await admin.from("ai_visibility_towns")
        .insert({ user_id: profile.id, town: first.town, state: first.state, status: "checking" })
        .select(TOWN_SELECT).single();
      if (made) {
        waitUntil(runTown(admin, made as Row).then(() => undefined));
        towns = [made as Row];
      }
    }
  }

  const rows = await recentChecks(admin, towns.map((t) => t.id));
  const links = await linkSummary(admin, profile.id);
  const ownDomains = links.website ? [links.website.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0].toLowerCase()] : [];
  return NextResponse.json({
    limit,
    towns: towns.map((t) => summarizeTown({ ...t, questions: (t.questions ?? []) as TownQuestion[] }, rows, ownDomains)),
    links,
  });
}
