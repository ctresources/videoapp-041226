import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVERYONE_KEY } from "@/lib/video/video-check";
import { geminiUsage, SEARCH_CAP } from "@/lib/api/gemini";

export const dynamic = "force-dynamic";

/**
 * Admin → Video checks (2026-11-15, the owner's approved mockup #2).
 *   GET  → { everyone, checks, usage, searchCap }
 *   POST { everyone: boolean } → turns "Fix and hold for everyone" on or off
 */
async function adminOnly() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return (me as { role: string } | null)?.role === "admin";
}

export async function GET() {
  if (!(await adminOnly())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: setting }, { data: checks }, usage] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", EVERYONE_KEY).maybeSingle(),
    admin.from("video_checks").select("id, video_id, user_id, mode, status, problems, action, seconds, created_at")
      .order("created_at", { ascending: false }).limit(100),
    geminiUsage().catch(() => ({})),
  ]);
  const rows = (checks ?? []) as { video_id: string; user_id: string }[];
  const videoIds = Array.from(new Set(rows.map((r) => r.video_id)));
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: vids }, { data: profs }] = await Promise.all([
    videoIds.length ? admin.from("generated_videos").select("id, projects(title)").in("id", videoIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const title = new Map(((vids ?? []) as unknown as { id: string; projects: { title: string | null } | { title: string | null }[] | null }[])
    .map((v) => [v.id, (Array.isArray(v.projects) ? v.projects[0]?.title : v.projects?.title) ?? "Untitled"]));
  const name = new Map(((profs ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => [p.id, p.full_name || p.email?.split("@")[0] || "Agent"]));
  return NextResponse.json({
    everyone: !!(setting as { value: { on?: boolean } | null } | null)?.value?.on,
    checks: (checks ?? []).map((c) => ({ ...c, title: title.get((c as { video_id: string }).video_id) ?? "Untitled", agent: name.get((c as { user_id: string }).user_id) ?? "Agent" })),
    usage,
    searchCap: SEARCH_CAP,
  });
}

export async function POST(req: NextRequest) {
  if (!(await adminOnly())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { everyone } = (await req.json().catch(() => ({}))) as { everyone?: boolean };
  await createAdminClient().from("app_settings").upsert({
    key: EVERYONE_KEY, value: { on: everyone === true, at: new Date().toISOString() }, updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ everyone: everyone === true });
}
