import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateVideoAgent,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  DIMENSIONS,
  type VideoType,
} from "@/lib/api/heygen";

export const maxDuration = 60;

const MAX_SCRIPT_WORDS = 250;
const QUICK_SCRIPT_WORDS = 150;

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
  hookText?: string;
  contactLine?: string;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const agentRef = params.agentName
    ? `real estate agent ${params.agentName}`
    : "a professional real estate agent";
  const format = params.isShortForm
    ? "Vertical 9:16, fast cuts, bold text overlays for social media."
    : "Horizontal 16:9, smooth transitions, professional editorial feel.";

  const brollDir = location
    ? `B-roll must show footage specifically from ${location}: ${location} streets, ${location} neighborhoods, ${location} home exteriors, ${location} lifestyle scenes. Do not use generic or unrelated city footage.`
    : "B-roll: local streets, home exteriors, neighborhood lifestyle scenes.";

  const leftOverlays = [
    params.hookText ? `Headline text: "${params.hookText}"` : "",
    params.contactLine ? `Contact info: "${params.contactLine}"` : "",
  ].filter(Boolean).join("\n- ");

  const layoutDir = `LAYOUT: Place the avatar presenter on the RIGHT side of the frame throughout the entire video.${leftOverlays ? `\nOn the LEFT half of the frame display these text overlays:\n- ${leftOverlays}` : ""}`;

  if (params.quickMode) {
    return `Professional real estate video for ${agentRef}${location ? ` in ${location}` : ""}.

NARRATION — read word-for-word with clear audio voiceover:
${params.script}

${layoutDir}

${brollDir} ${format} Full-body avatar presenter on RIGHT side with audible voiceover narration throughout.`;
  }

  return `Professional real estate video for ${agentRef}${location ? ` in ${location}` : ""}.

NARRATION — read word-for-word with clear audio voiceover:
${params.script}

${layoutDir}

VISUALS:
- Full-body avatar presenter on the RIGHT side of frame with clear audible voiceover narration
- ${brollDir}
- Warm tones, clean whites, deep navy color palette
- ${format}`;
}

export interface RerenderEdits {
  script: string;
  title: string;
  format: VideoType;
  quickMode?: boolean;
  brandColor?: string;
  logoEnabled?: boolean;
  captionsEnabled?: boolean;
  voiceId?: string | null;
  avatarId?: string | null;
  captionColor?: string;
  captionHighlightColor?: string;
  musicUrl?: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, edits } = (await req.json()) as { videoId: string; edits: RerenderEdits };
  if (!videoId || !edits?.script) {
    return NextResponse.json({ error: "videoId and edits.script required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: video } = await admin
    .from("generated_videos")
    .select("*, projects(user_id, ai_script)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, full_name, location_city, location_state")
    .eq("id", user.id)
    .single();

  const p = profile as {
    heygen_voice_id: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!p?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  const quickMode = edits.quickMode ?? false;
  const wordLimit = quickMode ? QUICK_SCRIPT_WORDS : MAX_SCRIPT_WORDS;
  const safeScript = clampScript(edits.script, wordLimit);
  const isShortForm = edits.format === "reel_9x16";
  const orientation = isShortForm ? "portrait" : "landscape";
  const city = p.location_city || "";
  const state = p.location_state || "";

  try {
    const aiScript = (video.projects as { ai_script?: Record<string, unknown> } | null)?.ai_script;
    const hookText = (aiScript?.hook as string) || undefined;

    const prompt = buildPrompt({
      script: safeScript,
      city,
      state,
      agentName: p.full_name || undefined,
      isShortForm,
      quickMode,
      hookText,
    });

    const dimension = DIMENSIONS[edits.format] || DIMENSIONS.blog_long;

    const { data: newVideo, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: video.project_id,
        user_id: user.id,
        video_type: edits.format,
        render_provider: "heygen_agent",
        render_status: "rendering",
        metadata: { dimension, orientation, city, state, title: edits.title, quickMode },
      })
      .select()
      .single();

    if (insertErr || !newVideo) throw new Error(insertErr?.message || "Insert failed");

    const voiceId = edits.voiceId
      || p?.heygen_voice_id
      || await getPrivateVoiceId().catch(() => null)
      || await getDefaultEnglishVoiceId().catch(() => null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const sessionId = await generateVideoAgent({
      prompt,
      voiceId: voiceId || undefined,
      orientation,
      callbackUrl,
      callbackId: newVideo.id,
    });

    await admin
      .from("generated_videos")
      .update({ render_job_id: sessionId })
      .eq("id", newVideo.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-agent-v3-rerender",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[rerender] ${quickMode ? "Quick" : "Standard"} render submitted: session ${sessionId}, voice: ${voiceId || "none"}`);
    return NextResponse.json({
      video: { ...newVideo, render_job_id: sessionId, render_status: "rendering" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Re-render failed";
    console.error("[rerender] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
