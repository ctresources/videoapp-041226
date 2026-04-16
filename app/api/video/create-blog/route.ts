import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  DIMENSIONS,
  type VideoType,
} from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_SCRIPT_WORDS = 250;   // ~90s video — keeps render times reasonable
const QUICK_SCRIPT_WORDS = 150; // ~60s video — quick mode

function clampScript(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(" ") + ".";
}

function buildPrompt(params: {
  script: string;
  city: string;
  state: string;
  agentName?: string;
  isShortForm: boolean;
  quickMode: boolean;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationDesc = location ? ` in ${location}` : "";
  const agentRef = params.agentName
    ? `real estate agent ${params.agentName}`
    : "a professional real estate agent";
  const format = params.isShortForm
    ? "Vertical 9:16, fast cuts, bold text overlays for social media."
    : "Horizontal 16:9, smooth transitions, professional editorial feel.";

  if (params.quickMode) {
    return `Professional real estate video for ${agentRef}${locationDesc}.

Script (deliver word-for-word): ${params.script}

Full-body avatar presenter. ${format}`;
  }

  return `Professional real estate video for ${agentRef}${locationDesc}.

Script (deliver word-for-word as voiceover):
${params.script}

Visuals: full-body avatar presenter throughout; b-roll of ${location || "the local area"} (streets, home exteriors, modern interiors); warm tones, clean whites, deep navy palette. ${format}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script, quickMode = false } = await req.json();
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
  const seoData = project.seo_data as Record<string, unknown> | null;

  const wordLimit = quickMode ? QUICK_SCRIPT_WORDS : MAX_SCRIPT_WORDS;
  const rawScript = script || (aiScript?.script as string) || project.title;
  const safeScript = clampScript(rawScript, wordLimit);

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, avatar_url, full_name, heygen_photo_id, location_city, location_state")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    heygen_voice_id: string | null;
    avatar_url: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!profile?.heygen_photo_id && !profile?.avatar_url) {
    return NextResponse.json(
      { error: "Please upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    const isShortForm = videoType === "reel_9x16" || videoType === "short_1x1";
    const orientation = isShortForm ? "portrait" : "landscape";

    const scriptLocation = aiScript?.location as string | undefined;
    const city = scriptLocation?.split(",")[0]?.trim() || profile?.location_city || "";
    const state = scriptLocation?.split(",")[1]?.trim() || profile?.location_state || "";

    const prompt = buildPrompt({
      script: safeScript,
      city,
      state,
      agentName: profile?.full_name || undefined,
      isShortForm,
      quickMode,
    });

    const dimension = DIMENSIONS[videoType as VideoType] || DIMENSIONS.blog_long;

    const { data: videoRow, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "heygen_agent",
        render_status: "rendering",
        metadata: { dimension, orientation, city, state, title, quickMode },
      })
      .select()
      .single();

    if (insertErr || !videoRow) {
      throw new Error(`Failed to create video record: ${insertErr?.message || "unknown"}`);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId: profile?.heygen_photo_id || undefined,
      voiceId: profile?.heygen_voice_id || undefined,
      orientation,
      callbackUrl,
      callbackId: videoRow.id,
    });

    await admin
      .from("generated_videos")
      .update({ render_job_id: sessionId })
      .eq("id", videoRow.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-agent-v3",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[create-blog] ${quickMode ? "Quick" : "Standard"} render submitted: session ${sessionId}`);
    return NextResponse.json({
      video: { ...videoRow, render_job_id: sessionId, render_status: "rendering" },
    });

  } catch (err) {
    await admin.from("projects").update({ status: "error" }).eq("id", projectId);
    await admin
      .from("generated_videos")
      .update({ render_status: "failed" })
      .eq("project_id", projectId)
      .eq("render_status", "rendering");

    const msg = err instanceof Error ? err.message : "Video generation failed";
    console.error("[create-blog] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
