/**
 * POST /api/video/cinematic-avatar/plan  { script, town? }
 *
 * The scenes of a Cinematic AI Avatar video, for the editor's Your scenes
 * list (2026-11-24): the spoken script cut into lines, and a place for each.
 * Plans only; nothing is made or charged. Paid plans, as the video is.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseTwinInFullVideo } from "@/lib/utils/plan-features";
import { scriptWithoutRepeats } from "@/lib/utils/script-assembly";
import { planScenePlaces, splitSceneLines } from "@/lib/video/cinematic-avatar";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .single();
  const p = (profile ?? {}) as { subscription_tier?: string | null; role?: string | null };
  if (!canUseTwinInFullVideo(p.subscription_tier, p.role)) {
    return NextResponse.json({ error: "Cinematic AI Avatar is on the paid plans.", code: "paid_only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { script?: unknown; town?: unknown };
  const script = typeof body.script === "string" ? scriptWithoutRepeats(body.script.slice(0, 6000)) : "";
  const lines = splitSceneLines(script);
  if (lines.length === 0) return NextResponse.json({ error: "Write the script first." }, { status: 400 });

  const town = typeof body.town === "string" ? body.town.slice(0, 80) : null;
  const places = await planScenePlaces(lines, town);
  return NextResponse.json({ scenes: lines.map((line, i) => ({ line, place: places[i] })) });
}
