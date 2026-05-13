import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// PATCH — update a video's title without re-rendering.
// Used by the editor when the only change is metadata (no HeyGen call needed).
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, title } = await req.json();
  if (!videoId || typeof title !== "string") {
    return NextResponse.json({ error: "videoId and title required" }, { status: 400 });
  }
  const newTitle = title.trim();
  if (!newTitle) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });

  const admin = createAdminClient();

  const { data: video } = await admin
    .from("generated_videos")
    .select("id, project_id, metadata")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const v = video as { id: string; project_id: string; metadata: Record<string, unknown> | null };
  const newMetadata = { ...(v.metadata || {}), title: newTitle };

  await admin
    .from("generated_videos")
    .update({ metadata: newMetadata })
    .eq("id", v.id);

  await admin
    .from("projects")
    .update({ title: newTitle })
    .eq("id", v.project_id)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true, title: newTitle });
}
