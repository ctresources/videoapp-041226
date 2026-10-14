import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The signed-in agent's videos in the waiting line.
 *
 * GET ?projectId= — that project's latest place in line, for the editor to
 * watch until it starts. GET with none — everything waiting, and anything
 * that could not start, for My Sparks. DELETE { id } — out of line, or a
 * failed one dismissed.
 */
async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const projectId = req.nextUrl.searchParams.get("projectId");

  let q = admin
    .from("render_queue")
    .select("id, project_id, status, video_id, error, created_at, projects(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  q = projectId
    ? q.eq("project_id", projectId).limit(1)
    : q.in("status", ["queued", "starting", "failed"]).limit(10);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; project_id: string; status: string; video_id: string | null; error: string | null;
    created_at: string; projects: { title: string | null } | null;
  }[];

  const items = await Promise.all(rows.map(async (r) => {
    let position: number | null = null;
    if (r.status === "queued" || r.status === "starting") {
      const { count } = await admin
        .from("render_queue")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "starting"])
        .lte("created_at", r.created_at);
      position = Math.max(1, count ?? 1);
    }
    let renderJobId: string | null = null;
    if (r.video_id) {
      const { data: v } = await admin
        .from("generated_videos")
        .select("render_job_id")
        .eq("id", r.video_id)
        .eq("user_id", user.id)
        .maybeSingle();
      renderJobId = (v as { render_job_id: string | null } | null)?.render_job_id ?? null;
    }
    return {
      id: r.id,
      projectId: r.project_id,
      title: r.projects?.title || "Your video",
      status: r.status,
      position,
      videoId: r.video_id,
      renderJobId,
      error: r.error,
    };
  }));
  return NextResponse.json(projectId ? { item: items[0] ?? null } : { items });
}

export async function DELETE(req: NextRequest) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  // Only one that has not started: a video already rendering is not stopped here.
  await admin
    .from("render_queue")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["queued", "failed"]);
  return NextResponse.json({ ok: true });
}
