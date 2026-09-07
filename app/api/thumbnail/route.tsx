import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderThumbnailCard } from "@/lib/api/thumbnail-card";

export const runtime = "nodejs";

/**
 * The generated thumbnail for one project.
 *
 * It used to take the words themselves off the query string — `?hook=…&agent=…`
 * — and check nothing at all. That made it a public image generator on our own
 * domain: anyone could put any text they liked into the address and get back a
 * 1280x720 PNG served from sparkreels.ai, at our compute cost, as often as they
 * cared to ask. Nothing of the user's was exposed, but the page was ours.
 *
 * It now takes a project id and looks the words up. You have to be signed in,
 * and the project has to be yours, or there is nothing to render.
 *
 * The old query parameters are gone rather than deprecated. Honouring them for
 * compatibility would have left the hole open, and the only things that built
 * those URLs are the three script writers in this same commit.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project");

  if (!projectId) {
    return NextResponse.json(
      { error: "A project id is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // RLS would carry this on its own; the explicit user_id filter is here so the
  // route cannot be quietly widened by a policy change somewhere else.
  const { data: project } = await supabase
    .from("projects")
    .select("ai_script")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) {
    // Deliberately not distinguishing "no such project" from "not yours" — the
    // difference tells a stranger which ids exist.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const script = (project as { ai_script: { hook?: string; title?: string } | null }).ai_script;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return renderThumbnailCard({
    hook: script?.hook || script?.title,
    agent: (profile as { full_name: string | null } | null)?.full_name,
  });
}
