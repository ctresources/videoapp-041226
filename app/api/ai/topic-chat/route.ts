import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { topicChat } from "@/lib/scripts/topic-chat";
import { toResponse } from "@/lib/content/service-result";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/ai/topic-chat (2026-11-18, the owner's approved mockup).
 *
 * The topic box as a chat: second / pick / refine / again on a draft the
 * first write saved. Picks and change requests teach My voice. Nothing here
 * costs a video.
 *
 * The work lives in lib/scripts/topic-chat.ts (2026-11-22), shared with the
 * agent layer's revise_script. Same request and responses as before.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; projectId?: string; which?: number; message?: string };
  return toResponse(await topicChat(user.id, b));
}
