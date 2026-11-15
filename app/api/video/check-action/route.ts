import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST { videoId, action: "post_anyway" }: lets a held automatic post go ahead (2026-11-15). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { videoId, action } = (await req.json().catch(() => ({}))) as { videoId?: string; action?: string };
  if (!videoId || action !== "post_anyway") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from("generated_videos").select("metadata").eq("id", videoId).eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const meta = ((data as { metadata: Record<string, unknown> | null }).metadata) ?? {};
  const vc = { ...((meta.video_check ?? {}) as Record<string, unknown>), post_anyway: true };
  await admin.from("generated_videos").update({ metadata: { ...meta, video_check: vc } }).eq("id", videoId);
  return NextResponse.json({ ok: true });
}
