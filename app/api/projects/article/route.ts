import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Longest a single part may be; well past a 1,500-word article. */
const MAX_PART_CHARS = 60_000;

/**
 * POST { projectId, intro, body, conclusion } — the blog article as the agent
 * edited it in the Share Kit (2026-10-16, the owner's ask: edit the article
 * once it is written). Headings arrive already marked "H2: " / "H3: ", the
 * same as the writer produces, so Copy as HTML, the newsletter and the
 * BoldTrail send read an edited article exactly as they read a written one.
 *
 * Merged into ai_script on the server, like the headline, so nothing else in
 * it (the header image, the headline, the script) is overwritten by an older
 * copy from the browser.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, intro, body, conclusion } = (await req.json().catch(() => ({}))) as {
    projectId?: string; intro?: unknown; body?: unknown; conclusion?: unknown;
  };
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, MAX_PART_CHARS) : "");
  const next = { blog_intro: clean(intro), blog_body: clean(body), blog_conclusion: clean(conclusion) };
  if (!next.blog_intro && !next.blog_body) {
    return NextResponse.json({ error: "The article can't be empty." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, ai_script")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const ai = { ...((project.ai_script ?? {}) as Record<string, unknown>), ...next };
  const { error } = await admin.from("projects").update({ ai_script: ai }).eq("id", projectId);
  if (error) return NextResponse.json({ error: "Couldn't save the article." }, { status: 500 });
  return NextResponse.json(next);
}
