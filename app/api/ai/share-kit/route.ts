import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeShareKit } from "@/lib/content/share-kit";
import { toResponse } from "@/lib/content/service-result";

/**
 * POST /api/ai/share-kit — { projectId, force?, auto? }
 *
 * Writes what the Share Kit shows for a video from the words spoken in it
 * (2026-10-25, the owner's ask): the LinkedIn and Facebook posts, Instagram
 * caption, YouTube title and description, and the blog. Fills gaps only;
 * anything already written is kept unless `force` is set. Refuses with 422
 * when there are too few words to write from.
 *
 * The work lives in lib/content/share-kit.ts (2026-11-22), shared with the
 * agent layer's make_social_copy. Same request and responses as before.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { projectId?: string; force?: boolean; auto?: boolean };
  return toResponse(await writeShareKit(user.id, body));
}
