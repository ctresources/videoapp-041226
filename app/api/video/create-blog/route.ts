import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRender, buildBlogVideoSource, buildShortFormSource } from "@/lib/api/creatomate";
import { searchRealEstateAssets } from "@/lib/api/freepik";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();

  // Load project
  const { data: projectData } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!projectData) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = projectData as {
    id: string;
    title: string;
    ai_script: Record<string, unknown> | null;
    seo_data: Record<string, unknown> | null;
  };

  const aiScript = project.ai_script as Record<string, string> | null;
  const videoScript = script || aiScript?.script || aiScript?.description || project.title;
  const title = aiScript?.title || project.title;

  // Mark project as generating
  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    // Get background footage from Freepik
    const keywords = ((aiScript?.keywords as unknown as string[]) || []).join(" ") || "real estate property";
    const assets = await searchRealEstateAssets(`real estate ${keywords}`, "photo", 3);
    const backgroundUrl = assets[0]?.preview_url;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookUrl = `${appUrl}/api/video/webhook`;
    const logoUrl = "https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif";

    // Build video source based on type
    const isShortForm = videoType === "reel_9x16" || videoType === "short_1x1";
    const source = isShortForm
      ? buildShortFormSource({ title, voiceoverText: videoScript, backgroundVideoUrl: backgroundUrl })
      : buildBlogVideoSource({ title, script: videoScript, voiceoverText: videoScript, backgroundVideoUrl: backgroundUrl, logoUrl });

    // Submit render to Creatomate
    const renders = await createRender({
      source,
      webhook_url: webhookUrl,
      metadata: JSON.stringify({ projectId, userId: user.id, videoType }),
    });

    const render = renders[0];

    // Create generated_video row
    const { data: videoRow } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "creatomate",
        render_job_id: render.id,
        render_status: "rendering",
        metadata: { render_id: render.id, source_url: render.url } as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    // Log API usage
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "creatomate",
      endpoint: "create-render",
      credits_used: 1,
      response_status: 200,
    });

    return NextResponse.json({ video: videoRow, renderId: render.id });
  } catch (err) {
    await admin.from("projects").update({ status: "error" }).eq("id", projectId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video generation failed" },
      { status: 500 }
    );
  }
}
