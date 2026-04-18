import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("video") as File | null;
  const title = ((formData.get("title") as string) || "Camera Recording").slice(0, 120);

  if (!file) return NextResponse.json({ error: "No video file provided" }, { status: 400 });

  const admin = createAdminClient();
  const ext = file.type.includes("mp4") ? "mp4" : "webm";
  const path = `camera-recordings/${user.id}/${Date.now()}.${ext}`;

  // Upload to public assets bucket
  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

  // Create a minimal project row (required by generated_videos FK)
  const { data: project, error: projectErr } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      project_type: "camera_recording",
      status: "ready",
    })
    .select("id")
    .single();

  if (projectErr || !project) {
    await admin.storage.from("assets").remove([path]);
    return NextResponse.json({ error: projectErr?.message || "Failed to create project" }, { status: 500 });
  }

  // Create generated_videos row so PublishModal can post it
  const { data: videoRow, error: videoErr } = await admin
    .from("generated_videos")
    .insert({
      project_id: project.id,
      user_id: user.id,
      video_url: publicUrl,
      video_type: "blog_long",
      render_provider: "heygen",
      render_status: "completed",
    })
    .select("id")
    .single();

  if (videoErr || !videoRow) {
    await admin.storage.from("assets").remove([path]);
    return NextResponse.json({ error: videoErr?.message || "Failed to save video" }, { status: 500 });
  }

  return NextResponse.json({ videoId: videoRow.id, title });
}
