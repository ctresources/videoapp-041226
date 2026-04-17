import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateVideoV3,
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
    const dimension = DIMENSIONS[edits.format] || DIMENSIONS.blog_long;

    const voiceId = edits.voiceId
      || p?.heygen_voice_id
      || await getPrivateVoiceId().catch(() => null)
      || await getDefaultEnglishVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

    const avatarId = edits.avatarId || p.heygen_photo_id;
    if (!avatarId) throw new Error("No avatar found. Please upload your photo in Settings.");

    const { data: newVideo, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: video.project_id,
        user_id: user.id,
        video_type: edits.format,
        render_provider: "heygen",
        render_status: "rendering",
        metadata: { dimension, orientation, title: edits.title, quickMode },
      })
      .select()
      .single();

    if (insertErr || !newVideo) throw new Error(insertErr?.message || "Insert failed");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const videoId = await generateVideoV3({
      avatarId,
      voiceId,
      scriptText: safeScript,
      dimension,
      title: edits.title,
      callbackUrl,
      callbackId: newVideo.id,
    });

    await admin
      .from("generated_videos")
      .update({ render_job_id: videoId })
      .eq("id", newVideo.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "v3-videos-rerender",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[rerender] v3 video submitted: ${videoId}, avatar: ${avatarId}, voice: ${voiceId}`);
    return NextResponse.json({
      video: { ...newVideo, render_job_id: videoId, render_status: "rendering" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Re-render failed";
    console.error("[rerender] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
