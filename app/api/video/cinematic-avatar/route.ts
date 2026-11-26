/**
 * POST /api/video/cinematic-avatar
 *   { projectId, scenes: [{ line, place }], format, captions?, musicUrl?, lookId? }
 *
 * A Cinematic AI Avatar video (2026-11-24, the owner's approved mockup).
 * The work is lib/video/cinematic-avatar-start.ts since 2026-11-25, shared
 * with AI apps. Same path, same answers as before.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startCinematicAvatar, type CinematicStartInput } from "@/lib/video/cinematic-avatar-start";

// Shots, then the render: the same allowance a Scenes Reel has.
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CinematicStartInput;
  const r = await startCinematicAvatar({ id: user.id }, body);
  return NextResponse.json(r.body, { status: r.status });
}
