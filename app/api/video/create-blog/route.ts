import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { startRender } from "@/lib/video/start-render";

/**
 * POST /api/video/create-blog — start the video for a project.
 *
 * The work is in lib/video/start-render.ts, shared with the waiting line
 * (lib/video/render-queue.ts), which starts queued videos the same way when
 * HeyGen has a free slot. This checks who is asking and hands over.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  return startRender({ id: user.id, email: user.email ?? null }, body);
}
