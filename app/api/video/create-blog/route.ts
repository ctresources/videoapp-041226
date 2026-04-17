import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  getCinematicStyleId,
  getPrivateVoiceId,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
} from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_SCRIPT_WORDS = 450;
const QUICK_SCRIPT_WORDS = 150;

function clampScript(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(" ") + ".";
}

function buildContactLine(profile: {
  full_name: string | null;
  company_name?: string | null;
  phone?: string | null;
  company_phone?: string | null;
}): string {
  const parts: string[] = [];
  if (profile.full_name) parts.push(profile.full_name);
  if (profile.company_name) parts.push(profile.company_name);
  const phone = profile.phone || profile.company_phone;
  if (phone) parts.push(phone);
  return parts.join("  ·  ");
}

function buildVideoAgentPrompt(params: {
  script: string;
  title: string;
  city: string;
  state: string;
  agentName?: string;
  keywords: string[];
  isShortForm: boolean;
  quickMode: boolean;
  hookText?: string;
  contactLine?: string;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationDesc = location ? ` in ${location}` : "";
  const agentRef = params.agentName ? `real estate agent ${params.agentName}` : "a professional real estate agent";

  const leftOverlays = [
    params.hookText ? `Headline: "${params.hookText}"` : "",
    params.contactLine ? `Contact: "${params.contactLine}"` : "",
  ].filter(Boolean).join("\n- ");

  const layoutDir = `LAYOUT: Place the avatar presenter on the RIGHT side of the frame throughout the entire video.${leftOverlays ? `\nDisplay these text overlays on the LEFT half of the frame:\n- ${leftOverlays}` : ""}`;

  if (params.quickMode) {
    return `Professional real estate video for ${agentRef}${locationDesc}.

NARRATION — read word-for-word with clear audio voiceover:
${params.script}

${layoutDir}

B-roll: ${location ? `${location} streets, neighborhoods, home exteriors, lifestyle scenes.` : "local streets, home exteriors, neighborhood lifestyle scenes."}
${params.isShortForm ? "Vertical 9:16, fast cuts, bold text overlays for social media." : "Horizontal 16:9, smooth cinematic transitions, premium editorial feel."}
Full-body avatar presenter on RIGHT side with audible voiceover narration throughout.`;
  }

  return `You are producing a professional real estate video for ${agentRef}${locationDesc}.

NARRATION SCRIPT — deliver this word-for-word as the voiceover:
${params.script}

${layoutDir}

VISUAL DIRECTION:
- Full-body avatar presenter on the RIGHT side of frame with clear audible voiceover narration
- Generate cinematic b-roll footage of ${location || "the local area"}: neighborhood aerial views, tree-lined streets, home exteriors, modern interiors, lifestyle scenes (coffee shops, parks, families). Use footage specifically from ${location || "the local area"} — do not use generic stock footage.
- Where market statistics or prices are mentioned, add clean data visualizations: bar charts for home prices, line graphs for market trends, infographic overlays for inventory levels
- Color palette: warm tones, clean whites, deep navy — professional luxury real estate aesthetic
- ${params.isShortForm
    ? "Vertical 9:16 format — fast-paced punchy cuts, bold text overlays, optimized for social media"
    : "Horizontal 16:9 format — smooth cinematic transitions, premium editorial feel"}
- Seamlessly intercut avatar presenter shots with b-roll footage
- Visually highlight key stats and property details as text overlays${params.keywords.length > 0 ? `\n- Keywords for visual emphasis: ${params.keywords.slice(0, 5).join(", ")}` : ""}

Deliver a single continuous, polished real estate marketing video that builds trust and motivates buyers and sellers${locationDesc} to take action.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script, hook, quickMode = false } = await req.json();
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

  const hookText = hook || (aiScript?.hook as string) || "";

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, avatar_url, logo_url, full_name, company_name, phone, company_phone, heygen_photo_id, location_city, location_state")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    heygen_voice_id: string | null;
    avatar_url: string | null;
    logo_url: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
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
    const isShortForm = videoType === "reel_9x16";
    const orientation = isShortForm ? "portrait" : "landscape";

    const scriptLocation = aiScript?.location as string | undefined;
    const city = scriptLocation?.split(",")[0]?.trim() || profile?.location_city || "";
    const state = scriptLocation?.split(",")[1]?.trim() || profile?.location_state || "";
    const aiKeywords = (aiScript?.keywords as string[]) || [];
    const contactLine = profile ? buildContactLine(profile) : "";

    const prompt = buildVideoAgentPrompt({
      script: safeScript,
      title,
      city,
      state,
      agentName: profile?.full_name || undefined,
      keywords: aiKeywords,
      isShortForm,
      quickMode,
      hookText: hookText || undefined,
      contactLine: contactLine || undefined,
    });

    const styleId = await getCinematicStyleId().catch(() => null);

    const files: VideoAgentFile[] = [];
    if (profile?.logo_url) {
      files.push({ type: "url", url: profile.logo_url });
    }

    const dimension = DIMENSIONS[videoType as VideoType] || DIMENSIONS.blog_long;

    const voiceId = profile?.heygen_voice_id
      || await getPrivateVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice available. Please set up your voice clone in Settings.");

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
      avatarId: profile!.heygen_photo_id || undefined,
      voiceId,
      orientation,
      files: files.length > 0 ? files : undefined,
      callbackUrl,
      callbackId: videoRow.id,
      styleId: styleId || undefined,
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

    console.log(`[create-blog] v3 agent session: ${sessionId}, voice: ${voiceId}`);
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
