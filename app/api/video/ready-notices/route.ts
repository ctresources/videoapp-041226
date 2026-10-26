import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sparklee's "Your video is ready!" pop-up (2026-10-26, usability sweep #9).
 *
 * GET: videos that finished in the last three hours and haven't been shown,
 * plus whether anything is still being made (so the page checks sooner).
 * POST { videoId }: shown, which also stops the email that would follow.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const [{ data: ready }, { count }] = await Promise.all([
    admin
      .from("generated_videos")
      .select("id, project_id, ready_notified_at")
      .eq("user_id", user.id)
      .eq("render_status", "completed")
      .not("ready_notified_at", "is", null)
      .is("ready_seen_at", null)
      .gte("ready_notified_at", since)
      .order("ready_notified_at", { ascending: false })
      .limit(3),
    admin
      .from("generated_videos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("render_status", "rendering")
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
  ]);

  const rows = (ready ?? []) as { id: string; project_id: string | null }[];
  const ids = rows.map((r) => r.project_id).filter((x): x is string => !!x);
  const { data: projects } = ids.length
    ? await admin.from("projects").select("id, title, thumbnail_url").in("id", ids)
    : { data: [] };
  const byId = new Map(((projects ?? []) as { id: string; title: string | null; thumbnail_url: string | null }[]).map((p) => [p.id, p]));

  return NextResponse.json({
    notices: rows.map((r) => ({
      videoId: r.id,
      projectId: r.project_id,
      title: (r.project_id && byId.get(r.project_id)?.title) || "Your video",
      thumbnail: (r.project_id && byId.get(r.project_id)?.thumbnail_url) || null,
    })),
    rendering: (count ?? 0) > 0,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { videoId?: unknown };
  const videoId = typeof body.videoId === "string" ? body.videoId : "";
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  await createAdminClient()
    .from("generated_videos")
    .update({ ready_seen_at: new Date().toISOString() })
    .eq("id", videoId)
    .eq("user_id", user.id)
    .is("ready_seen_at", null);
  return NextResponse.json({ ok: true });
}
