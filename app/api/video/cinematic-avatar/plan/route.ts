/**
 * POST /api/video/cinematic-avatar/plan  { script, town? }
 *
 * The scenes of a Cinematic AI Avatar video, for the editor's Your scenes
 * list (2026-11-24): the spoken script cut into lines, and a place for each.
 * Plans only; nothing is made or charged. Paid plans, as the video is.
 * The work is planCinematicScenes (lib/video/cinematic-avatar-start.ts)
 * since 2026-11-25, shared with AI apps.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planCinematicScenes } from "@/lib/video/cinematic-avatar-start";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { script?: unknown; town?: unknown };
  const r = await planCinematicScenes({ id: user.id }, body);
  return NextResponse.json(r.body, { status: r.status });
}
