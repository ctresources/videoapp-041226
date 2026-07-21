import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateVideoAgent,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  getAvatarLooks,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
} from "@/lib/api/heygen";
import { sanitizeNarration } from "@/lib/utils/sanitize-narration";
import { MUSIC_PROMPT_INSTRUCTION } from "@/lib/utils/music-presets";

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

/**
 * Build explicit b-roll accuracy guidance so the Video Agent never shows
 * scenery that contradicts the listing's location or the current season —
 * e.g. snow in June, or palm trees in Pennsylvania.
 */
function buildLocationSeasonGuidance(state: string, city: string): string {
  const place = [city, state].filter(Boolean).join(", ") || "the local market";
  const stateName = state || "the listing's state";

  const month = new Date().getMonth(); // 0 = Jan
  const season =
    month <= 1 || month === 11 ? "Winter" :
    month <= 4 ? "Spring" :
    month <= 7 ? "Summer" :
    "Fall";

  const seasonVisual: Record<string, string> = {
    Winter: "bare or evergreen trees, cool low sun, possible light snow ONLY if the state genuinely has snowy winters",
    Spring: "budding green trees, blooming flowers, fresh grass, mild bright daylight",
    Summer: "full green foliage, lush lawns, warm bright sunlight, leafy mature trees",
    Fall: "autumn foliage in warm tones, crisp clear light, fallen leaves",
  };

  return `=====================================
LOCATION + SEASON ACCURACY (CRITICAL — READ CAREFULLY)
=====================================
- This listing is in ${place}. The current season is ${season}.
- Every outdoor scene MUST be believable for ${stateName} in ${season}: ${seasonVisual[season]}.
- NEVER show snow unless it is Winter AND ${stateName} actually gets snow. It is currently ${season} — do not show snow this season.
- NEVER show palm trees, tropical beaches, deserts, or mountains unless ${stateName} genuinely has them. (e.g. Pennsylvania has NO palm trees, NO beaches, NO deserts — show northeastern deciduous trees, rolling green hills, and brick/colonial architecture instead.)
- Match home architecture, landscaping, and plant life to what is typical for ${stateName}.
- When in doubt, use generic neighborhood and interior shots that cannot contradict the location — do NOT invent dramatic scenery.

`;
}

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
- Brand Style: ${params.tone || "Modern"}${params.phone1 ? `\n- Phone 1 (DISPLAY ONLY — appears on-screen, NEVER spoken): ${params.phone1}` : ""}${params.phone2 ? `\n- Phone 2 (DISPLAY ONLY — appears on-screen, NEVER spoken): ${params.phone2}` : ""}${params.website ? `\n- Website (DISPLAY ONLY — appears on-screen, NEVER spoken as a URL): ${params.website}` : ""}

=====================================
NARRATION SCRIPT (DELIVER WORD-FOR-WORD — SPEAK THIS EXACTLY ONCE)
=====================================
Speak ONLY the script below, start to finish, exactly once. Do NOT repeat the opening line. Do NOT speak any headline, title card, on-screen overlay, or thumbnail text — those are visual only. CONTACT INFO IS NEVER SPOKEN: phone numbers, email addresses, and website URLs are display-only — if one appears in the script, omit it from the voiceover and show it on screen instead. The first words of the voiceover are the first words of this script:

${params.script}

${buildLocationSeasonGuidance(params.state, params.city)}=====================================
B-ROLL
=====================================
- Aerial drone shots of ${locationOr} neighborhoods (season- and region-accurate per the rules above)
- Tree-lined streets, home exteriors, curb appeal — foliage must match the current season${audienceVisual ? `\n- Audience-specific visuals (${params.audience}): ${audienceVisual}` : ""}
- Interior shots: modern kitchens, open living spaces
- Lifestyle: cafes, parks, families, walkability scenes
- Do NOT show any scenery that contradicts ${params.state || "the listing's state"} or the current season

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
- Position ALL charts and data graphics on the TOP or LEFT of the frame — NEVER in the bottom-right quadrant where the avatar PiP sits

=====================================
TEXT OVERLAYS
=====================================
- Highlight key stats and insights as they are mentioned in the script
- Background: semi-transparent dark gray
- Text: white or soft gold
- Accent lines/icons: gold or navy
- Bold, minimal, readable — no clutter
- CRITICAL POSITIONING — THE AVATAR PiP IS ANCHORED TO THE BOTTOM-RIGHT CORNER:
  • Place ALL text overlays and data visualizations along the TOP edge or the LEFT side of the frame
  • NEVER place any text, stat, chart, or caption in the BOTTOM-RIGHT quadrant — that is where the avatar's face/PiP lives and text there lands ON the presenter's face
  • Preferred safe zone: top 20% strip across the frame, or the left 40% column
  • Keep the entire bottom-right quadrant (right half × bottom half) completely clear of overlays at all times

=====================================
FIRST FRAME (THUMBNAIL-STYLE OPENER) — REQUIRED, DO NOT SKIP
=====================================
The video's VERY FIRST FRAME must be a designed thumbnail-style title card (this frame becomes the video thumbnail).
RIGHT side: full-body avatar against a warm, bright lifestyle image of ${locationOr}
LEFT side: bold headline at the TOP-LEFT — "${params.hookText || "Your Local Real Estate Expert"}"

- This headline is a VISUAL OVERLAY ONLY — DO NOT read it aloud, DO NOT narrate it, DO NOT speak any text shown on this title card. The voiceover begins with the first line of the NARRATION SCRIPT and nothing before it.
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
  /**
   * Avatar selection: a HeyGen look/stock id, the user's avatar group id
   * (resolved to a look server-side), the literal "none" for voiceover-only,
   * or null/undefined to default to the user's avatar.
   */
  avatarId?: string | null;
  captionColor?: string;
  captionHighlightColor?: string;
  musicUrl?: string | null;
  /** Listing/b-roll photos for the Video Agent to weave in (up to 8). */
  photoUrls?: string[];
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

  // Strip markdown/bullets/emoji first — non-speakable formatting makes the
  // Video Agent paraphrase instead of delivering the script verbatim.
  const safeScript = clampScript(sanitizeNarration(edits.script));
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

    // Background music can't be attached — the Video Agent rejects audio
    // files. Tell the agent to render clean voiceover-only audio; the chosen
    // track is stored in metadata and mixed in by the webhook at store time.
    const musicInstruction = edits.musicUrl ? MUSIC_PROMPT_INSTRUCTION : "";

    const prompt = (musicInstruction + buildPrompt({
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
    })).slice(0, 10000); // HeyGen Video Agent caps the prompt at 10,000 chars

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    // Avatar selection: "none" = explicit voiceover-only; null/undefined =
    // default to the user's own avatar; anything else is used as-is (stock
    // avatar or explicit look id).
    //
    // p.heygen_photo_id is an avatar GROUP id, which HeyGen cannot render
    // directly as the on-screen avatar — whenever the group id is what we're
    // about to send (defaulted OR explicitly clicked in the editor), resolve
    // it to the group's first completed look. Previously the explicit-click
    // path skipped this resolution, so choosing "your avatar" sent the raw
    // group id and the Video Agent rendered a generic stock presenter.
    let avatarId: string | undefined;
    if (edits.avatarId !== "none") {
      avatarId = edits.avatarId || p.heygen_photo_id || undefined;
      if (avatarId && avatarId === p.heygen_photo_id) {
        try {
          const looks = await getAvatarLooks(p.heygen_photo_id);
          const ready = looks.find((l) => l.status === "completed") || looks[0];
          if (ready?.id) {
            avatarId = ready.id;
            console.log(`[rerender] Resolved group ${p.heygen_photo_id} → look ${avatarId}`);
          }
        } catch (e) {
          console.warn("[rerender] Look resolution failed, using group id:", e instanceof Error ? e.message : e);
        }
      }
    }

    // ── Video Agent path (v3): render with the user's cloned HeyGen voice ──────
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
        metadata: {
          dimension, orientation, city, state, title: edits.title,
          // Mixed under the voiceover by the webhook at store time.
          ...(edits.musicUrl && { music_url: edits.musicUrl }),
        },
      })
      .select()
      .single();

    if (insertErr || !newVideo) throw new Error(insertErr?.message || "Insert failed");
    placeholderVideoId = newVideo.id;

    // Attach uploaded photos as b-roll for the Video Agent to weave in (≤8).
    const photoFiles: VideoAgentFile[] = Array.isArray(edits.photoUrls)
      ? edits.photoUrls.filter((u): u is string => typeof u === "string").slice(0, 8).map((url) => ({ type: "url", url }))
      : [];

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId,
      voiceId,
      orientation,
      files: photoFiles.length > 0 ? photoFiles : undefined,
      callbackUrl,
      callbackId: newVideo.id,
    });

    await admin
      .from("generated_videos")
      // credit_cost enables an automatic refund if the render later fails
      .update({ render_job_id: sessionId, metadata: { ...(newVideo.metadata ?? {}), credit_cost: 1 } })
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
