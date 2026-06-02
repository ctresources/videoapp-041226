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
  const projectId = formData.get("projectId") as string | null;
  const videoType = (formData.get("videoType") as string) || "reel_9x16";
  const title = ((formData.get("title") as string) || "Camera Recording").slice(0, 120);

  if (!file) return NextResponse.json({ error: "No video file provided" }, { status: 400 });

  const admin = createAdminClient();

  // Resolve project — use the existing script project if supplied, else create a stub
  let resolvedProjectId: string;

  if (projectId) {
    const { data: existing, error } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (error || !existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    resolvedProjectId = existing.id as string;
  } else {
    const { data: newProject, error: projectErr } = await admin
      .from("projects")
      .insert({ user_id: user.id, title, project_type: "location_script", status: "ready" })
      .select("id")
      .single();

    if (projectErr || !newProject) {
      return NextResponse.json({ error: projectErr?.message || "Failed to create project" }, { status: 500 });
    }
    resolvedProjectId = (newProject as { id: string }).id;
  }

  // Upload to the public assets bucket
  const ext = file.type.includes("mp4") ? "mp4" : "webm";
  const path = `camera-recordings/${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

  // Save as a completed video — no HeyGen or ElevenLabs involved
  const { data: videoRow, error: videoErr } = await admin
    .from("generated_videos")
    .insert({
      project_id: resolvedProjectId,
      user_id: user.id,
      video_url: publicUrl,
      video_type: videoType,
      render_provider: "camera",
      render_status: "completed",
      metadata: { source: "teleprompter" },
    })
    .select("id")
    .single();

  if (videoErr || !videoRow) {
    await admin.storage.from("assets").remove([path]);
    return NextResponse.json({ error: videoErr?.message || "Failed to save video" }, { status: 500 });
  }

  return NextResponse.json({ video: { id: (videoRow as { id: string }).id } });
}
