import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  getCinematicStyleId,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
} from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

// Fire-and-forget: we submit to HeyGen Video Agent then return immediately.
// The client polls /api/video/status which queries DB (updated by webhook)
// or falls back to HeyGen session polling when webhook isn't reachable (local dev).
export const maxDuration = 60;

// 3-minute max for ALL video types / templates / platforms
const MAX_SCRIPT_WORDS = 450;  // ~3 min at 150 wpm

/** Clamp script to stay within 3-minute video limit. */
function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}

/**
 * Build a rich Video Agent prompt for real estate content.
 *
 * The v3 agent uses this prompt to autonomously generate:
 *   - Full-body avatar narrating on screen
 *   - Cinematic b-roll from city/state context
 *   - Data visualizations where relevant
 *   - Scene layout, pacing, and transitions
 */
function buildVideoAgentPrompt(params: {
  script: string;
  title: string;
  city: string;
  state: string;
  agentName?: string;
  keywords: string[];
  isShortForm: boolean;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationDesc = location ? ` in ${location}` : "";
  const agentRef = params.agentName ? `real estate agent ${params.agentName}` : "a professional real estate agent";

  return `You are producing a professional real estate video for ${agentRef}${locationDesc}.

NARRATION SCRIPT — deliver this word-for-word as the voiceover:
${params.script}

VISUAL DIRECTION:
- Present the full-body avatar as the on-screen presenter throughout
- Generate cinematic b-roll footage of ${location || "the local area"}: neighborhood aerial views, tree-lined streets, home exteriors, modern interiors, lifestyle scenes (coffee shops, parks, families)
- Where market statistics or prices are mentioned, add clean data visualizations: bar charts for home prices, line graphs for market trends, infographic overlays for inventory levels
- Color palette: warm tones, clean whites, deep navy — professional luxury real estate aesthetic
- ${params.isShortForm
    ? "Vertical 9:16 format — fast-paced punchy cuts, bold text overlays, optimized for social media"
    : "Horizontal 16:9 format — smooth cinematic transitions, premium editorial feel"}
- Seamlessly intercut avatar presenter shots with b-roll footage
- Visually highlight key stats and property details as text overlays
- Keywords for visual emphasis: ${params.keywords.slice(0, 5).join(", ")}

Deliver a single continuous, polished real estate marketing video that builds trust and motivates buyers and sellers${locationDesc} to take action.`;
}

// ─── Main Route ──────────────────────────────────────────────────────────────

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

  const aiScript = project.ai_script as Record<string, unknown> | null;
  const seoData = project.seo_data as Record<string, unknown> | null;

  // Extract script — clamp to 3-minute max
  const rawScript = script || (aiScript?.script as string) || project.title;
  const safeScript = clampScript(rawScript);

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  // Load user profile
  const { data: profileData } = await admin
    .from("profiles")
    .select("voice_clone_id, avatar_url, logo_url, full_name, heygen_photo_id, location_city, location_state")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    voice_clone_id: string | null;
    avatar_url: string | null;
    logo_url: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  // Require at minimum a registered HeyGen avatar
  if (!profile?.heygen_photo_id && !profile?.avatar_url) {
    return NextResponse.json(
      { error: "Please upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    // ── Determine orientation from video type ────────────────────────────────
    const isShortForm = videoType === "reel_9x16" || videoType === "short_1x1";
    const orientation = isShortForm ? "portrait" : "landscape";

    // ── Resolve location from script or profile ──────────────────────────────
    const scriptLocation = aiScript?.location as string | undefined;
    const city = scriptLocation?.split(",")[0]?.trim() || profile?.location_city || "";
    const state = scriptLocation?.split(",")[1]?.trim() || profile?.location_state || "";
    const aiKeywords = (aiScript?.keywords as string[]) || [];

    // ── Build rich agent prompt ──────────────────────────────────────────────
    const prompt = buildVideoAgentPrompt({
      script: safeScript,
      title,
      city,
      state,
      agentName: profile?.full_name || undefined,
      keywords: aiKeywords,
      isShortForm,
    });

    // ── Fetch cinematic style (non-blocking, optional) ───────────────────────
    const styleId = await getCinematicStyleId().catch(() => null);

    // ── Attach reference files for visual context ────────────────────────────
    // Pass logo as a branding reference if available
    const files: VideoAgentFile[] = [];
    if (profile?.logo_url) {
      files.push({ type: "url", url: profile.logo_url });
    }

    // ── Create DB row before submitting ─────────────────────────────────────
    const dimension = DIMENSIONS[videoType as VideoType] || DIMENSIONS.blog_long;

    const { data: videoRow } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "heygen_agent",
        render_status: "rendering",
        metadata: { dimension, orientation, city, state, title },
      })
      .select()
      .single();

    // ── Submit to HeyGen Video Agent v3 (fire-and-forget) ───────────────────
    // Returns a session_id — the agent renders asynchronously.
    // The client polls /api/video/status which handles two-step session → video_id flow.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId: profile?.heygen_photo_id || undefined,
      orientation,
      files: files.length > 0 ? files : undefined,
      callbackUrl,
      callbackId: videoRow?.id,
      styleId: styleId || undefined,
    });

    // ── Save session_id as render_job_id ─────────────────────────────────────
    await admin
      .from("generated_videos")
      .update({ render_job_id: sessionId })
      .eq("id", videoRow?.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-agent-v3",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[create-blog] Video Agent session ${sessionId} submitted — client will poll for completion`);
    return NextResponse.json({
      video: {
        ...videoRow,
        render_job_id: sessionId,
        render_status: "rendering",
      },
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
