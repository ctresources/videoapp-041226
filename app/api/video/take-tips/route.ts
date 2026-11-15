import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET ?videoId= → { tips } for the signed-in owner's camera take (2026-11-15). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("videoId");
  if (!id) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  const { data } = await supabase.from("generated_videos").select("metadata, render_provider")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  const row = data as { metadata: Record<string, unknown> | null; render_provider: string | null } | null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ tips: row.metadata?.take_tips ?? null, camera: row.render_provider === "camera" });
}
