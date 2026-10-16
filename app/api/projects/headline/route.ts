import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST { projectId, headline } — the post's headline, as the agent typed it
 * in the Share Kit (2026-10-15). Saved as ai_script.blog_headline, merged into
 * what is there on the server so nothing else in ai_script (the header image,
 * the moving header) is overwritten by an older copy from the browser. The
 * email, the newsletter and the header image all read it first. Empty clears
 * it, and the written title is used again.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, headline } = (await req.json().catch(() => ({}))) as { projectId?: string; headline?: string };
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const h = (headline ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, ai_script")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const ai = { ...((project.ai_script ?? {}) as Record<string, unknown>) };
  if (h) ai.blog_headline = h;
  else delete ai.blog_headline;
  const { error } = await admin.from("projects").update({ ai_script: ai }).eq("id", projectId);
  if (error) return NextResponse.json({ error: "Couldn't save the headline." }, { status: 500 });
  return NextResponse.json({ headline: h });
}
