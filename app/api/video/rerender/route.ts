import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateVideoAgent,
  generateVideo,
  uploadAudioAsset,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  DIMENSIONS,
  type VideoType,
} from "@/lib/api/heygen";
import { generateSpeech } from "@/lib/api/elevenlabs";

export const maxDuration = 60;

const MAX_SCRIPT_WORDS = 200;

function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}

const AUDIENCE_VISUALS: Record<string, string> = {
  "Buyers": "Entry-level to mid-range homes, young couples and families arriving, neighborhood community feel",
  "Sellers": "Curb-appeal-focused exteriors, well-maintained homes, proud homeowner moments",
  "Investors": "Duplexes, multi-unit properties, city growth aerial shots, ROI chart overlays",
  "First-Time Buyers": "Welcoming neighborhood homes, approachable community scenes, first-key-handover moments",
  "Luxury": "High-end home exteriors and interiors, waterfront or hilltop properties, premium finishes and details",
  "Mixed": "Range of homes from starter to luxury, diverse buyers and sellers",
};

const TONE_VISUALS: Record<string, string> = {
  "Luxury": "Cinematic slow-motion shots, subtle gold color grading, premium interior close-ups",
  "Friendly": "Warm daylight exterior shots, families in yards, walkable neighborhood street scenes",
  "High-Energy": "Fast dynamic cuts, bold animated text overlays, high-contrast motion graphics",
  "Educational": "Clean data overlays, bar and line chart animations, split-screen comparisons",
  "Modern": "Minimal clean aesthetic, sharp cuts, geometric overlay elements",
};

function buildPrompt(params: {
  script: string;
  city: string;
  state: string;
  agentName?: string;
  brokerage?: string;
  audience?: string;
  tone?: string;
  ctaPreference?: string;
  phone1?: string;
  phone2?: string;
  website?: string;
  isShortForm: boolean;
  hookText?: string;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationOr = location || "the local area";

  const ctaText =
    params.ctaPreference === "text" ? "Call or Text Today to Get Started" :
    params.ctaPreference === "website" ? `Visit ${params.website || "Our Website"} to Learn More` :
    params.ctaPreference === "consultation" ? "Schedule Your Private Consultation Today" :
    "Call or Text Today to Get Started";

  const contactParts = [
    params.agentName,
    params.brokerage,
    params.phone1,
    params.phone2,
    params.website,
  ].filter(Boolean);
  const contactLine = contactParts.join("  ·  ");

  const audienceVisual = params.audience ? AUDIENCE_VISUALS[params.audience] || "" : "";
  const toneVisual = params.tone ? TONE_VISUALS[params.tone] || "" : "";

  return `You are producing a high-end, professional real estate marketing video.

=====================================
AVATAR — NON-NEGOTIABLE REQUIREMENT
=====================================
The presenter's avatar MUST appear on screen for the ENTIRE duration of the video — no exceptions.
- Show the avatar as a circular picture-in-picture (PiP) anchored to the BOTTOM-RIGHT corner
- PiP size: ~20–25% of screen width, with a clean white or soft gold circular border
- B-roll fills the full frame BEHIND the PiP — the avatar never disappears
- NEVER show a frame without the avatar visible
- NEVER show the avatar full-screen — circular bottom-right PiP only

=====================================
AGENT + MARKET DETAILS
=====================================
- Agent: ${params.agentName || "Local Real Estate Agent"}${params.brokerage ? `\n- Brokerage: ${params.brokerage}` : ""}
- Market: ${locationOr}
- Audience: ${params.audience || "Mixed"}
- Brand Style: ${params.tone || "Modern"}${params.phone1 ? `\n- Phone 1: ${params.phone1}` : ""}${params.phone2 ? `\n- Phone 2: ${params.phone2}` : ""}${params.website ? `\n- Website: ${params.website}` : ""}

=====================================
NARRATION SCRIPT (DELIVER WORD-FOR-WORD)
=====================================
${params.script}

=====================================
B-ROLL
=====================================
- Aerial drone shots of ${locationOr} neighborhoods
- Tree-lined streets, home exteriors, curb appeal${audienceVisual ? `\n- Audience-specific visuals (${params.audience}): ${audienceVisual}` : ""}
- Interior shots: modern kitchens, open living spaces
- Lifestyle: cafes, parks, families, walkability scenes

=====================================
COLOR + STYLE
=====================================
- B-roll: slight warm filter — inviting, emotional (avoid cool/blue tones)${toneVisual ? `\n- Tone (${params.tone}): ${toneVisual}` : ""}
- ${params.isShortForm ? "Vertical 9:16 — fast punchy cuts, bold text overlays, social media optimized" : "Horizontal 16:9 — smooth cinematic transitions, premium editorial feel"}

=====================================
DATA VISUALIZATION
=====================================
When stats or numbers are spoken:
- Bar charts → home prices
- Line graphs → market trends
- Infographic overlays → inventory/demand levels

=====================================
TEXT OVERLAYS
=====================================
- Highlight key stats and insights as they are mentioned in the script
- Background: semi-transparent dark gray
- Text: white or soft gold
- Accent lines/icons: gold or navy
- Bold, minimal, readable — no clutter
- CRITICAL POSITIONING: All text overlays must appear at the TOP or BOTTOM of the frame ONLY
- NEVER place any text overlay in the vertical center of the frame — the avatar's face occupies that area
- Safe zones: top 25% of frame (above avatar face) or bottom 15% of frame (below avatar chin)

=====================================
FIRST FRAME (THUMBNAIL-STYLE OPENER)
=====================================
RIGHT side: full-body avatar against a warm, bright lifestyle image of ${locationOr}
LEFT side: bold headline at the TOP-LEFT — "${params.hookText || "Your Local Real Estate Expert"}"

- LEFT panel: dark gray blending into deep navy gradient (high contrast, text readable)
- RIGHT panel: warm natural tones behind the agent (inviting, lifestyle feel)
- Fill ENTIRE frame edge-to-edge — zero empty pixels, zero black areas
- Style like a scroll-stopping YouTube thumbnail

=====================================
FINAL FRAME (CTA)
=====================================
Clean contact overlay: ${contactLine}

Bold CTA on screen: "${ctaText}"

Deliver a polished, scroll-stopping video that positions the agent as the trusted local expert and converts viewers into leads.`;
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

  // Tracks the placeholder generated_videos row so we can mark it failed if
  // HeyGen rejects the job (otherwise it lingers as "rendering" forever).
  let placeholderVideoId: string | null = null;

  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, full_name, company_name, phone, company_phone, location_city, location_state, website, voice_clone_id, credits_remaining")
    .eq("id", user.id)
    .single();

  const p = profile as {
    heygen_voice_id: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    location_city: string | null;
    location_state: string | null;
    website: string | null;
    voice_clone_id: string | null;
    credits_remaining: number;
  } | null;

  if (!p?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  if (p.credits_remaining < 1) {
    return NextResponse.json(
      { error: "No videos remaining this month. Please upgrade your plan." },
      { status: 402 },
    );
  }

  const safeScript = clampScript(edits.script);
  const isShortForm = edits.format === "reel_9x16" || edits.format === "short_1x1";
  const orientation = isShortForm ? "portrait" : "landscape";
  const city = p.location_city || "";
  const state = p.location_state || "";

  try {
    const dimension = DIMENSIONS[edits.format] || DIMENSIONS.blog_long;

    const proj = video.projects as { ai_script?: Record<string, unknown> } | null;
    const hookText = (proj?.ai_script?.hook as string) || undefined;
    const audience = (proj?.ai_script?.audience as string) || undefined;
    const tone = (proj?.ai_script?.tone as string) || undefined;
    const ctaPreference = (proj?.ai_script?.cta_preference as string) || undefined;
    const phones = Array.from(new Set([p.phone, p.company_phone].filter(Boolean))) as string[];

    const prompt = buildPrompt({
      script: safeScript,
      city,
      state,
      agentName: p.full_name || undefined,
      brokerage: p.company_name || undefined,
      audience,
      tone,
      ctaPreference,
      phone1: phones[0],
      phone2: phones[1],
      website: p.website || undefined,
      isShortForm,
      hookText,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const avatarId = edits.avatarId || p.heygen_photo_id;

    // ── ElevenLabs TTS path: user has a cloned voice ──────────────────────────
    if (p.voice_clone_id) {
      console.log(`[rerender] EL voice path — voice ${p.voice_clone_id}`);
      const elAudioBuffer = await generateSpeech(safeScript, p.voice_clone_id);
      const audioAssetId = await uploadAudioAsset(elAudioBuffer);

      const { data: newVideo, error: insertErr } = await admin
        .from("generated_videos")
        .insert({
          project_id: video.project_id,
          user_id: user.id,
          video_type: edits.format,
          render_provider: "heygen_v2",
          render_status: "rendering",
          metadata: { dimension, orientation, city, state, title: edits.title },
        })
        .select()
        .single();

      if (insertErr || !newVideo) throw new Error(insertErr?.message || "Insert failed");
      placeholderVideoId = newVideo.id;

      const videoId = await generateVideo({
        scenes: [{ scriptText: safeScript, audioAssetId }],
        talkingPhotoId: avatarId,
        photoPosition: "bottom-right",
        dimension,
        title: edits.title,
        callbackUrl,
        callbackId: newVideo.id,
      });

      await admin
        .from("generated_videos")
        .update({ render_job_id: videoId })
        .eq("id", newVideo.id);

      await admin.from("profiles").update({ credits_remaining: p.credits_remaining - 1 }).eq("id", user.id);
      await admin.from("api_usage_log").insert({
        user_id: user.id,
        api_provider: "heygen",
        endpoint: "video-v2-el-tts-rerender",
        credits_used: 1,
        response_status: 202,
      });

      console.log(`[rerender] v2 video ${videoId} submitted with EL audio (avatar: ${avatarId})`);
      return NextResponse.json({
        video: { ...newVideo, render_job_id: videoId, render_status: "rendering" },
      });
    }

    // ── Video Agent path: no EL voice → use HeyGen voice ID ──────────────────
    let voiceId = edits.voiceId || p.heygen_voice_id;
    if (!voiceId) {
      const privateVoiceId = await getPrivateVoiceId().catch(() => null);
      if (privateVoiceId) {
        voiceId = privateVoiceId;
        void admin.from("profiles").update({ heygen_voice_id: privateVoiceId }).eq("id", user.id);
      }
    }
    voiceId = voiceId || await getDefaultEnglishVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

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
    placeholderVideoId = newVideo.id;

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId,
      voiceId,
      orientation,
      callbackUrl,
      callbackId: newVideo.id,
    });

    await admin
      .from("generated_videos")
      .update({ render_job_id: sessionId })
      .eq("id", newVideo.id);

    await admin.from("profiles").update({ credits_remaining: p.credits_remaining - 1 }).eq("id", user.id);
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-agent-v3-rerender",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[rerender] Video Agent session ${sessionId} submitted (avatar: ${avatarId}, voice: ${voiceId})`);
    return NextResponse.json({
      video: { ...newVideo, render_job_id: sessionId, render_status: "rendering" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Re-render failed";
    console.error("[rerender] error:", msg);

    // Mark the placeholder row as failed so it doesn't linger as "rendering"
    if (placeholderVideoId) {
      await admin
        .from("generated_videos")
        .update({ render_status: "failed" })
        .eq("id", placeholderVideoId)
        .then(() => undefined, () => undefined);
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
