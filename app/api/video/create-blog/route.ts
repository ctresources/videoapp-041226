import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRender, buildBlogVideoSource, buildShortFormSource } from "@/lib/api/creatomate";
import { generateAndWaitForAssets } from "@/lib/api/blotato";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();

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

  const aiScript = project.ai_script as Record<string, unknown> | null;
  const videoScript = script || aiScript?.script as string || project.title;
  const title = aiScript?.title as string || project.title;

  // Load user profile (avatar + Blotato key)
  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_avatar_id, heygen_voice_id, elevenlabs_voice_id, blotato_api_key")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    heygen_avatar_id: string | null;
    heygen_voice_id: string | null;
    elevenlabs_voice_id: string | null;
    blotato_api_key: string | null;
  } | null;

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    // Generate b-roll assets from Blotato AI (non-blocking — graceful fallback to gradient)
    let backgroundUrls: string[] = [];
    if (profile?.blotato_api_key) {
      const keywords = ((aiScript?.keywords as string[]) || []).slice(0, 4).join(", ");
      const assetPrompt = `real estate ${keywords || "property home"} professional photography`;
      backgroundUrls = await generateAndWaitForAssets(profile.blotato_api_key, assetPrompt);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const isShortForm = videoType === "reel_9x16" || videoType === "short_1x1";

    // Single Creatomate render job:
    //   - Blotato b-roll images as background
    //   - ElevenLabs native TTS (user's cloned voice if set) + karaoke captions
    //   - HeyGen avatar PiP via Creatomate native connector (same render call)
    const source = isShortForm
      ? buildShortFormSource({
          title,
          voiceoverText: videoScript,
          backgroundUrls,
          avatarId: profile?.heygen_avatar_id || undefined,
          heygenVoiceId: profile?.heygen_voice_id || undefined,
          elevenLabsVoiceId: profile?.elevenlabs_voice_id || undefined,
        })
      : buildBlogVideoSource({
          title,
          voiceoverText: videoScript,
          backgroundUrls,
          avatarId: profile?.heygen_avatar_id || undefined,
          heygenVoiceId: profile?.heygen_voice_id || undefined,
          elevenLabsVoiceId: profile?.elevenlabs_voice_id || undefined,
        });

    const renders = await createRender({
      source,
      webhook_url: `${appUrl}/api/video/webhook`,
      metadata: JSON.stringify({ projectId, userId: user.id, videoType }),
    });

    const render = renders[0];

    const { data: videoRow } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "creatomate",
        render_job_id: render.id,
        render_status: "rendering",
        metadata: {
          render_id: render.id,
          has_avatar: !!profile?.heygen_avatar_id,
          has_broll: backgroundUrls.length > 0,
          broll_count: backgroundUrls.length,
        } as unknown as Record<string, unknown>,
      })
      .select()
      .single();

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
