import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeBlog } from "@/lib/content/blog";
import { toResponse } from "@/lib/content/service-result";

/**
 * POST /api/ai/blog — { projectId, force?, auto? }
 *
 * Writes the blog article for a project from whatever script that project
 * has, whoever wrote it and however the video was made.
 *
 * One endpoint rather than a call bolted onto each of the five create routes:
 * it is the same work every time, and the routes it would have to be bolted
 * onto can least afford it (save-camera-recording has a 60 second budget).
 * It is also the only shape that works for a photo reel, whose words only
 * exist after the render.
 *
 * The work lives in lib/content/blog.ts (2026-11-22), shared with the agent
 * layer's make_blog. Same request, same responses, same refusals as before.
 */

// Writing the article is well under a minute. The budget is for a Speak
// naturally recording, whose words are transcribed off the video first.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { projectId?: string; force?: boolean; auto?: boolean };
  return toResponse(await writeBlog(user.id, body));
}
