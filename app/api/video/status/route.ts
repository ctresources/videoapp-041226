import { createClient } from "@/lib/supabase/server";
import { getRenderStatus } from "@/lib/video/status";
import { toResponse } from "@/lib/content/service-result";
import { NextRequest, NextResponse } from "next/server";

// Compositing photos + mixing music into a finished render (ffmpeg) can take a
// while, so the poll that finalizes a Direct video needs headroom. This poll
// races the webhook and either can end up doing the whole job, so it carries
// the same budget — 800 under Fluid Compute; see the note in the webhook.
export const maxDuration = 800;

/**
 * GET /api/video/status?renderId=xxx[&scenes=1][&refresh=1]
 *
 * The current render status for a HeyGen video job, finishing the video when
 * HeyGen is done and the webhook hasn't arrived.
 *
 * The work lives in lib/video/status.ts (2026-11-22), shared with the agent
 * layer's video_status. Same query, same responses as before.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  return toResponse(await getRenderStatus(user.id, q.get("renderId") ?? "", {
    scenes: q.get("scenes") === "1",
    refresh: q.get("refresh") === "1",
  }));
}
