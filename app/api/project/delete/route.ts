import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/project/delete — { projectId }
 * Deletes a draft project (one with no generated videos). Projects that
 * already have videos must be removed through the video delete flow so
 * storage cleanup stays in one place.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json().catch(() => ({})) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (!project || (project as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { count } = await admin
    .from("generated_videos")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (count && count > 0) {
    return NextResponse.json(
      { error: "This project has videos — delete them from My Videos instead." },
      { status: 400 },
    );
  }

  const { error } = await admin.from("projects").delete().eq("id", projectId);
  if (error) {
    console.error("project delete error:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
