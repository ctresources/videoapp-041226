import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Saves in-progress script edits (script / CTA / hook) back onto the project
 * without generating a video. The project keeps status "draft" and shows up
 * in My Videos under Drafts so the user can come back and finish later.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, script, cta, hook, title } = await req.json() as {
    projectId?: string;
    script?: string;
    cta?: string;
    hook?: string;
    title?: string;
  };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, ai_script")
    .eq("id", projectId)
    .single();

  if (!project || (project as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const aiScript = ((project as { ai_script: Record<string, unknown> | null }).ai_script) || {};
  const updatedScript = {
    ...aiScript,
    ...(script !== undefined && { script }),
    ...(cta !== undefined && { cta }),
    ...(hook !== undefined && { hook }),
    // Marks that these values were saved by the user — the editor prefers them
    // over the resolved default CTA / first suggested hook when reloading.
    user_edited: true,
  };

  const { error } = await admin
    .from("projects")
    .update({ ai_script: updatedScript, ...(title?.trim() ? { title: title.trim() } : {}) })
    .eq("id", projectId);

  if (error) {
    console.error("save-draft update error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
