import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  getCinematicStyleId,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
} from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

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

function buildVideoAgentPrompt(params: {
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
  keywords: string[];
  isShortForm: boolean;
  hookText?: string;
  listingAddress?: string;
  listingPhotoCount?: number;
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

  const hasListingPhotos = (params.listingPhotoCount ?? 0) > 0;
  const listingPhotoBlock = hasListingPhotos
    ? `

=====================================
LISTING PHOTOS (PRIMARY B-ROLL — USE THESE)
=====================================
${params.listingPhotoCount} actual photos of THIS property at ${params.listingAddress || "the listing address"} are attached as files.
- Use the attached listing photos as the PRIMARY b-roll throughout the video — these are the actual property
- Cycle through ALL provided photos so every photo gets screen time (~5–10 seconds each)
- Apply gentle Ken Burns motion (slow pan + zoom) on each photo to keep the frame alive
- Match each photo to whatever room/feature the script is describing at that moment
- DO NOT replace these photos with stock or generated imagery for the property itself
- Stock cinematic b-roll of ${params.city || "the area"} may ONLY be used between listing photos for transitions or for neighborhood/lifestyle context`
    : "";

  return `You are producing a high-end, professional real estate marketing video.

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
VISUAL DIRECTION
=====================================
- Full-body avatar presenter on screen — confident, approachable, professional
- Seamlessly intercut with cinematic b-roll of ${locationOr}
- CRITICAL: Frame must be 100% filled at ALL times — no empty space, no black bars

=====================================
B-ROLL
=====================================${listingPhotoBlock}
${hasListingPhotos ? "\nSECONDARY / FILLER B-ROLL (only between listing photos):" : ""}
- Aerial drone shots of ${locationOr} neighborhoods
- Tree-lined streets, home exteriors, curb appeal${audienceVisual ? `\n- Audience-specific visuals (${params.audience}): ${audienceVisual}` : ""}
- Interior shots: modern kitchens, open living spaces
- Lifestyle: cafes, parks, families, walkability scenes${params.keywords.length > 0 ? `\n- Visual emphasis: ${params.keywords.slice(0, 5).join(", ")}` : ""}

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

=====================================
FIRST FRAME (THUMBNAIL-STYLE OPENER)
=====================================
RIGHT side: full-body avatar against a warm, bright lifestyle image of ${locationOr}
LEFT side: bold headline — "${params.hookText || "Your Local Real Estate Expert"}"

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
    project_type: string | null;
    ai_script: Record<string, unknown> | null;
    seo_data: Record<string, unknown> | null;
    listing_data: Record<string, unknown> | null;
  };

  const aiScript = project.ai_script as Record<string, unknown> | null;
  const seoData = project.seo_data as Record<string, unknown> | null;
  const listingData = project.listing_data as Record<string, unknown> | null;
  const listingPhotos = (listingData?.photoUrls as string[] | undefined)?.filter(
    (u) => typeof u === "string" && u.startsWith("http"),
  ) ?? [];

  const rawScript = script || (aiScript?.script as string) || project.title;
  const safeScript = clampScript(rawScript);

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, avatar_url, logo_url, full_name, company_name, phone, company_phone, location_city, location_state, website")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    heygen_voice_id: string | null;
    heygen_photo_id: string | null;
    avatar_url: string | null;
    logo_url: string | null;
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    location_city: string | null;
    location_state: string | null;
    website: string | null;
  } | null;

  if (!profile?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Please upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    const isShortForm = videoType === "reel_9x16" || videoType === "short_1x1";
    const orientation = isShortForm ? "portrait" : "landscape";
    const dimension = DIMENSIONS[videoType as VideoType] || DIMENSIONS.blog_long;

    const scriptLocation = aiScript?.location as string | undefined;
    const city = scriptLocation?.split(",")[0]?.trim() || profile.location_city || "";
    const state = scriptLocation?.split(",")[1]?.trim() || profile.location_state || "";
    const aiKeywords = (aiScript?.keywords as string[]) || [];

    const hookText = (aiScript?.hook as string) || undefined;
    const audience = (aiScript?.audience as string) || undefined;
    const tone = (aiScript?.tone as string) || undefined;
    const ctaPreference = (aiScript?.cta_preference as string) || undefined;
    const phones = Array.from(new Set([profile.phone, profile.company_phone].filter(Boolean))) as string[];

    const listingAddress = (listingData?.address as string | undefined) || undefined;

    const prompt = buildVideoAgentPrompt({
      script: safeScript,
      city,
      state,
      agentName: profile.full_name || undefined,
      brokerage: profile.company_name || undefined,
      audience,
      tone,
      ctaPreference,
      phone1: phones[0],
      phone2: phones[1],
      website: profile.website || undefined,
      keywords: aiKeywords,
      isShortForm,
      hookText,
      listingAddress,
      listingPhotoCount: listingPhotos.length,
    });

    const voiceId = profile.heygen_voice_id
      || await getPrivateVoiceId().catch(() => null)
      || await getDefaultEnglishVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

    // Fetch cinematic style for landscape videos to get proper b-roll composition
    const styleId = isShortForm ? null : await getCinematicStyleId().catch(() => null);

    const files: VideoAgentFile[] = [];
    if (profile.logo_url) {
      files.push({ type: "url", url: profile.logo_url });
    }
    // Attach listing photos as files so the Video Agent uses them as primary b-roll.
    // Cap at 12 to keep the agent responsive — matches the upload limit.
    for (const url of listingPhotos.slice(0, 12)) {
      files.push({ type: "url", url });
    }

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId: profile.heygen_photo_id,
      voiceId,
      orientation,
      files: files.length > 0 ? files : undefined,
      callbackUrl,
      callbackId: videoRow?.id,
      styleId: styleId || undefined,
    });

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

    console.log(`[create-blog] Video Agent session ${sessionId} submitted (avatar: ${profile.heygen_photo_id}, voice: ${voiceId})`);
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
