import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAvatarVideo } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "reel_9x16", script } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: projectData } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!projectData) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = projectData as { id: string; title: string; ai_script: Record<string, unknown> | null };
  const aiScript = project.ai_script as Record<string, unknown> | null;

  // Use hook as the short-form script for punchiness (under ~150 words)
  const shortScript = script
    || (aiScript?.hook as string)
    || (aiScript?.script as string)?.split(" ").slice(0, 150).join(" ")
    || project.title;

  // Get user's avatar if set
  const { data: profile } = await admin.from("profiles").select("heygen_avatar_id").eq("id", user.id).single();
  const avatarId = (profile as { heygen_avatar_id: string | null } | null)?.heygen_avatar_id || undefined;

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    const dimensions = videoType === "short_1x1"
      ? { width: 1080, height: 1080 }
      : { width: 1080, height: 1920 };

    const result = await createAvatarVideo({
      script: shortScript,
      avatar_id: avatarId,
      ...dimensions,
    });

    const { data: videoRow } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "heygen",
        render_job_id: result.video_id,
        render_status: "rendering",
        metadata: { video_id: result.video_id } as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video/generate",
      credits_used: 1,
      response_status: 200,
    });

    return NextResponse.json({ video: videoRow, videoId: result.video_id });
  } catch (err) {
    await admin.from("projects").update({ status: "error" }).eq("id", projectId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Avatar video generation failed" },
      { status: 500 }
    );
  }
}
