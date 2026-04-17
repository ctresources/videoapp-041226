import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateVideoAgent,
  getCinematicStyleId,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  DIMENSIONS,
  type VideoType,
} from "@/lib/api/heygen";

export const maxDuration = 60;

const MAX_SCRIPT_WORDS = 450;

function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}

function buildPrompt(params: {
  script: string;
  city: string;
  state: string;
  agentName?: string;
  isShortForm: boolean;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationDesc = location ? ` in ${location}` : "";
  const agentRef = params.agentName
    ? `real estate agent ${params.agentName}`
    : "a professional real estate agent";

  return `You are producing a professional real estate video for ${agentRef}${locationDesc}.

NARRATION SCRIPT — deliver this word-for-word as the voiceover:
${params.script}

VISUAL DIRECTION:
- Present the full-body avatar as the on-screen presenter throughout
- Generate cinematic b-roll footage of ${location || "the local area"}: neighborhood aerial views, tree-lined streets, home exteriors, modern interiors, lifestyle scenes
- Color palette: warm tones, clean whites, deep navy — professional luxury real estate aesthetic
- ${params.isShortForm
    ? "Vertical 9:16 format — fast-paced punchy cuts, bold text overlays, optimized for social media"
    : "Horizontal 16:9 format — smooth cinematic transitions, premium editorial feel"}
- Seamlessly intercut avatar presenter shots with b-roll footage

Deliver a polished real estate marketing video that builds trust and motivates buyers and sellers${locationDesc} to take action.`;
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

  const safeScript = clampScript(edits.script);
  const isShortForm = edits.format === "reel_9x16" || edits.format === "short_1x1";
  const orientation = isShortForm ? "portrait" : "landscape";
  const city = p.location_city || "";
  const state = p.location_state || "";

  try {
    const dimension = DIMENSIONS[edits.format] || DIMENSIONS.blog_long;

    const prompt = buildPrompt({
      script: safeScript,
      city,
      state,
      agentName: p.full_name || undefined,
      isShortForm,
    });

    const voiceId = edits.voiceId
      || p.heygen_voice_id
      || await getPrivateVoiceId().catch(() => null)
      || await getDefaultEnglishVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

    const styleId = isShortForm ? null : await getCinematicStyleId().catch(() => null);

    const { data: newVideo, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: video.project_id,
        user_id: user.id,
        video_type: edits.format,
        render_provider: "heygen_agent",
        render_status: "rendering",
        metadata: { dimension, orientation, city, state, title: edits.title },
      })
      .select()
      .single();

    if (insertErr || !newVideo) throw new Error(insertErr?.message || "Insert failed");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId: p.heygen_photo_id,
      voiceId,
      orientation,
      callbackUrl,
      callbackId: newVideo.id,
      styleId: styleId || undefined,
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

    console.log(`[rerender] Video Agent session ${sessionId} submitted (avatar: ${p.heygen_photo_id}, voice: ${voiceId})`);
    return NextResponse.json({
      video: { ...newVideo, render_job_id: sessionId, render_status: "rendering" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Re-render failed";
    console.error("[rerender] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
