import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { publishToTargets, type PostRequestTarget } from "@/lib/social/publish";
import { toResponse } from "@/lib/content/service-result";

export const maxDuration = 300;

/**
 * POST /api/social/post — { videoId, targets, scheduledAt? }
 *
 * Publishes or schedules a finished video to the chosen platforms.
 *
 * The work lives in lib/social/publish.ts (2026-11-22), shared with the agent
 * layer's confirm_publish. Same request, cron path and responses as before.
 */
export async function POST(req: NextRequest) {
  /**
   * Approved Halo videos post themselves once finished (lib/halo/post.ts,
   * 2026-10-24): that job comes in with the cron secret and says whose video
   * it is, the same way AutoSparks drafts are written. Every other request is
   * the signed-in agent, as before.
   */
  const asUser = req.headers.get("x-autopilot-user");
  const cronSecret = process.env.CRON_SECRET;
  let user: { id: string } | null = null;
  if (asUser && cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    user = { id: asUser };
  } else {
    const supabase = await createClient();
    user = (await supabase.auth.getUser()).data.user;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { videoId: string; targets: PostRequestTarget[]; scheduledAt?: string };
  return toResponse(await publishToTargets(user.id, body, { automatic: !!asUser }));
}
