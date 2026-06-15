import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  generateVideo,
  uploadAudioAsset,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  getAvatarLooks,
  uploadTalkingPhoto,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
  type SceneInput,
} from "@/lib/api/heygen";
import { generateSpeech } from "@/lib/api/elevenlabs";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const MAX_SCRIPT_WORDS = 300;

function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}

function splitScriptIntoChunks(text: string, n: number): string[] {
  if (n <= 1) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const count = Math.min(n, sentences.length);
  if (count <= 1) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.round((i * sentences.length) / count);
    const end = Math.round(((i + 1) * sentences.length) / count);
    const chunk = sentences.slice(start, end).join(" ").trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Expand common address/unit abbreviations into full words so the TTS engine
 * pronounces "Ln" as "Lane" instead of "L-N", "St" as "Street", etc.
 *
 * Also strips any leading "+1 " or "1 " country-code prefix from phone-number
 * patterns the user may have included in the script — phones are shown on
 * screen, not spoken, but if one slips into narration we don't want the avatar
 * to say "one ..." in front of it.
 */
function normalizeScriptForTTS(text: string): string {
  if (!text) return text;

  const STREET_SUFFIX: Record<string, string> = {
    Ln: "Lane",
    St: "Street",
    Rd: "Road",
    Ave: "Avenue",
    Blvd: "Boulevard",
    Dr: "Drive",
    Ct: "Court",
    Cir: "Circle",
    Pl: "Place",
    Pkwy: "Parkway",
    Hwy: "Highway",
    Ter: "Terrace",
    Trl: "Trail",
    Pt: "Point",
    Sq: "Square",
    Apt: "Apartment",
    Ste: "Suite",
    Bldg: "Building",
  };

  const DIRECTION: Record<string, string> = {
    NE: "Northeast",
    NW: "Northwest",
    SE: "Southeast",
    SW: "Southwest",
  };

  let out = text;

  // Replace street-suffix tokens. Match case-insensitively but only as whole
  // words, optionally followed by a period. Avoid replacing inside other words
  // (e.g. "Stuart" must not become "Streetuart").
  for (const [abbr, full] of Object.entries(STREET_SUFFIX)) {
    const re = new RegExp(`\\b${abbr}\\.?(?=\\s|,|\\.|$|!|\\?|;|:)`, "gi");
    out = out.replace(re, full);
  }

  // Two-letter directions (must come before single-letter directions).
  for (const [abbr, full] of Object.entries(DIRECTION)) {
    const re = new RegExp(`\\b${abbr}\\.?(?=\\s|,|\\.|$)`, "g");
    out = out.replace(re, full);
  }

  // Single-letter directions: only when sandwiched in an address pattern
  // (number then direction then capitalized street word) — avoids mangling
  // sentences that happen to contain "I", "A", etc. Example: "123 N Oak Lane"
  // -> "123 North Oak Lane".
  const SINGLE_DIR: Record<string, string> = {
    N: "North",
    S: "South",
    E: "East",
    W: "West",
  };
  for (const [abbr, full] of Object.entries(SINGLE_DIR)) {
    const re = new RegExp(`(\\d+\\s+)${abbr}\\.?(\\s+[A-Z])`, "g");
    out = out.replace(re, `$1${full}$2`);
  }

  // Strip leading "+1 " or "1-" or "1 " in front of a 10-digit phone pattern
  // (e.g. "+1 555-123-4567" or "1 (555) 123-4567"). Keep the local number.
  out = out.replace(
    /(?:\+?1[\s.\-])(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g,
    "$1",
  );

  return out;
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
 * e.g. snow in June, or palm trees in Pennsylvania. We derive the current
 * meteorological season from the server date and pass the state through so
 * the agent only composes scenes that are believable for that market.
 */
function buildLocationSeasonGuidance(state: string, city: string): string {
  const place = [city, state].filter(Boolean).join(", ") || "the local market";
  const stateName = state || "the listing's state";

  // Meteorological season (Northern Hemisphere) from the current month.
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
  extraPhotoCount?: number;
  pdfContent?: string;
}): string {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationOr = location || "the local area";

  const ctaText =
    params.ctaPreference === "text" ? "Call or Text Today to Get Started" :
    params.ctaPreference === "website" ? `Visit ${params.website || "Our Website"} to Learn More` :
    params.ctaPreference === "consultation" ? "Schedule Your Private Consultation Today" :
    "Call or Text Today to Get Started";

  // Display-only contact line for the final-frame overlay. BOTH phone numbers
  // appear on-screen, but only the mobile (phone1) should be SPOKEN — see
  // PRONUNCIATION RULES below.
  const phone1Display = params.phone1 ? `Mobile: ${params.phone1}` : "";
  const phone2Display = params.phone2 ? `Office: ${params.phone2}` : "";
  const contactParts = [
    params.agentName,
    params.brokerage,
    phone1Display,
    phone2Display,
    params.website,
  ].filter(Boolean);
  const contactLine = contactParts.join("  ·  ");

  const audienceVisual = params.audience ? AUDIENCE_VISUALS[params.audience] || "" : "";
  const toneVisual = params.tone ? TONE_VISUALS[params.tone] || "" : "";

  const listingCount = params.listingPhotoCount ?? 0;
  const extraCount = params.extraPhotoCount ?? 0;
  const totalPhotos = listingCount + extraCount;
  const hasPhotos = totalPhotos > 0;

  const photoLines = [
    listingCount > 0
      ? `- ${listingCount} listing photo(s) of the property at ${params.listingAddress || "the listing address"}`
      : "",
    extraCount > 0
      ? `- ${extraCount} additional photo(s) uploaded by the user`
      : "",
  ].filter(Boolean).join("\n");

  const listingPhotoBlock = hasPhotos
    ? `

=====================================
ATTACHED PHOTOS (PRIMARY B-ROLL — USE THESE)
=====================================
${totalPhotos} photo(s) are attached as files:
${photoLines}
- Use ALL attached photos as the PRIMARY b-roll throughout the video
- Cycle through every photo so each gets screen time (~5–10 seconds)
- CROP/SCALE every photo to FILL the entire frame edge-to-edge (cover/crop scaling) — NEVER letterbox or pillarbox. No black bars on the sides or top/bottom, even for portrait/vertical photos. Zoom and crop to fill rather than fitting the whole photo with empty space around it.
- Apply gentle Ken Burns motion (slow pan + zoom) on each photo to keep the frame alive
- Match photos to whatever the script is describing at each moment
- DO NOT replace these photos with stock or generated imagery
- Stock cinematic b-roll of ${params.city || "the area"} may ONLY be used between photos for transitions or neighborhood context`
    : "";

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
- Brand Style: ${params.tone || "Modern"}${params.phone1 ? `\n- Mobile (PRIMARY — the only phone the avatar should ever read aloud if any phone is spoken): ${params.phone1}` : ""}${params.phone2 ? `\n- Office (DISPLAY ONLY — appears on-screen but is NEVER spoken): ${params.phone2}` : ""}${params.website ? `\n- Website: ${params.website}` : ""}

=====================================
NARRATION SCRIPT (DELIVER WORD-FOR-WORD — SPEAK THIS EXACTLY ONCE)
=====================================
Speak ONLY the script below, start to finish, exactly once. Do NOT repeat the opening line. Do NOT speak any headline, title card, on-screen overlay, or thumbnail text — those are visual only. The first words of the voiceover are the first words of this script:

${params.script}
${params.pdfContent ? `
=====================================
PDF REFERENCE DOCUMENT
=====================================
The user attached a PDF with supplemental context. Use its content to inform the
video's b-roll choices, on-screen statistics, and key talking points:

${params.pdfContent}
` : ""}
=====================================
PRONUNCIATION RULES (CRITICAL FOR VOICEOVER)
=====================================
- The script above has already been normalized for speech. Read every word as written.
- ALWAYS pronounce street-suffix words in full — never spell letters: "Lane" (not "L-N"), "Street" (not "S-T"), "Road", "Avenue", "Boulevard", "Drive", "Court", "Circle", "Place", "Parkway", "Highway", "Terrace", "Trail", "Point", "Square", "Apartment", "Suite", "Building".
- Pronounce directional words in full: "North", "South", "East", "West", "Northeast", "Northwest", "Southeast", "Southwest" — never as single letters.
- Phone numbers: read each digit naturally (e.g. "five five five, one two three, four five six seven"). DO NOT prepend "one" or "plus one" — never add a "1" country-code in front of any phone number, even if you see one. If two phone numbers appear in the agent details, ONLY the Mobile number is ever spoken; the Office number is for on-screen display only and must NEVER be read aloud.
- If the script does not contain a phone number, do not add one to the narration. Phone numbers belong in the on-screen contact overlay, not the spoken track.

${buildLocationSeasonGuidance(params.state, params.city)}=====================================
B-ROLL
=====================================${listingPhotoBlock}
${hasPhotos ? "\nSECONDARY / FILLER B-ROLL (only between listing photos):" : ""}
- Aerial drone shots of ${locationOr} neighborhoods (season- and region-accurate per the rules above)
- Tree-lined streets, home exteriors, curb appeal — foliage must match the current season${audienceVisual ? `\n- Audience-specific visuals (${params.audience}): ${audienceVisual}` : ""}
- Interior shots: modern kitchens, open living spaces
- Lifestyle: cafes, parks, families, walkability scenes${params.keywords.length > 0 ? `\n- Visual emphasis: ${params.keywords.slice(0, 5).join(", ")}` : ""}
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
- The video's VERY FIRST FRAME must be a designed thumbnail-style title card (this frame becomes the video thumbnail).
- Full-frame warm lifestyle image of ${locationOr} filling the entire background
- Bold headline at the TOP of the frame, left-aligned or horizontally centered: "${params.hookText || "Your Local Real Estate Expert"}"
- This headline is a VISUAL OVERLAY ONLY — DO NOT read it aloud, DO NOT narrate it, DO NOT speak any text shown on this title card. The voiceover begins with the first line of the NARRATION SCRIPT and nothing before it.
- Presenter as circular PiP in the bottom-right corner (same as the rest of the video)
- Fill ENTIRE frame edge-to-edge — zero empty pixels, zero black areas
- Style like a scroll-stopping YouTube thumbnail

=====================================
FINAL FRAME (CTA)
=====================================
Clean contact overlay (TEXT ON SCREEN ONLY — do not narrate): ${contactLine}
- Both Mobile and Office numbers are visible in the overlay, but only the Mobile may ever be spoken (and only if the script explicitly says it).
- Phone numbers in the overlay must be displayed exactly as provided — no leading "1", no country code added.

Bold CTA on screen: "${ctaText}"

Deliver a polished, scroll-stopping video that positions the agent as the trusted local expert and converts viewers into leads.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script, lookId, musicUrl, pdfUrl, pdfText, extraPhotoUrls } = await req.json();
  const safeExtraPhotos: string[] = Array.isArray(extraPhotoUrls)
    ? extraPhotoUrls.filter((u) => typeof u === "string").slice(0, 12)
    : [];
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
  const safeScript = clampScript(normalizeScriptForTTS(rawScript));

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, avatar_url, logo_url, full_name, company_name, phone, company_phone, location_city, location_state, website, voice_clone_id, credits_remaining")
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
    voice_clone_id: string | null;
    credits_remaining: number;
  } | null;

  // Auto-register the headshot with HeyGen if avatar_url exists but heygen_photo_id is not yet set
  if (profile && !profile.heygen_photo_id && profile.avatar_url) {
    try {
      const imgRes = await fetch(profile.avatar_url);
      if (imgRes.ok) {
        const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const photoId = await uploadTalkingPhoto(imageBuffer, contentType);
        await admin.from("profiles").update({ heygen_photo_id: photoId }).eq("id", user.id);
        profile.heygen_photo_id = photoId;
      }
    } catch (err) {
      console.warn("[create-blog] HeyGen auto-register failed:", err);
    }
  }

  if (!profile?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Avatar photo not set up. Go to Settings → Profile and upload your photo to generate videos." },
      { status: 400 },
    );
  }

  if (profile.credits_remaining < 1) {
    return NextResponse.json(
      { error: "No videos remaining this month. Please upgrade your plan." },
      { status: 402 },
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

    // HeyGen's Video Agent caps the prompt at 10,000 characters. The PDF/URL
    // reference text is the largest variable part, so fit it to whatever room
    // is left after the structural instructions rather than letting it overflow.
    const HEYGEN_PROMPT_LIMIT = 10000;
    const promptParams = {
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
      extraPhotoCount: safeExtraPhotos.length,
    };

    const fullPdf = pdfText ? String(pdfText) : undefined;
    let prompt = buildVideoAgentPrompt({ ...promptParams, pdfContent: fullPdf?.slice(0, 3000) });

    if (prompt.length > HEYGEN_PROMPT_LIMIT && fullPdf) {
      // Measure the prompt with no PDF, then allocate the remaining budget
      // (minus a small margin for the section wrapper) to the PDF text.
      const baseLength = buildVideoAgentPrompt({ ...promptParams, pdfContent: undefined }).length;
      const room = HEYGEN_PROMPT_LIMIT - baseLength - 200;
      const trimmedPdf = room > 200 ? fullPdf.slice(0, room) : undefined;
      prompt = buildVideoAgentPrompt({ ...promptParams, pdfContent: trimmedPdf });
    }

    // Final hard safety clamp in case the base prompt alone is still too long.
    if (prompt.length > HEYGEN_PROMPT_LIMIT) {
      prompt = prompt.slice(0, HEYGEN_PROMPT_LIMIT);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    // profile.heygen_photo_id is an avatar GROUP id, which HeyGen cannot render
    // directly as the on-screen avatar — it needs a concrete look id. The client
    // normally passes one as lookId, but if it didn't (looks failed to load, or
    // none were completed yet), resolve the group's first completed look here so
    // the avatar still appears on screen instead of being dropped.
    let avatarId = lookId || profile.heygen_photo_id;
    if (!lookId && profile.heygen_photo_id) {
      try {
        const looks = await getAvatarLooks(profile.heygen_photo_id);
        const ready = looks.find((l) => l.status === "completed") || looks[0];
        if (ready?.id) {
          avatarId = ready.id;
          console.log(`[create-blog] Resolved group ${profile.heygen_photo_id} → look ${avatarId}`);
        }
      } catch (e) {
        console.warn("[create-blog] Look resolution failed, using group id:", e instanceof Error ? e.message : e);
      }
    }

    // ── ElevenLabs TTS + listing photos: multi-scene v2 API ──────────────────────
    // Split the script into N chunks (one per photo, capped at 5), generate EL
    // audio for each chunk, then submit a multi-scene v2 video where each scene
    // uses that photo as its background.
    if (profile.voice_clone_id && listingPhotos.length > 0) {
      console.log(`[create-blog] EL multi-scene path — ${listingPhotos.length} photos, voice ${profile.voice_clone_id}`);
      try {
        const numScenes = Math.min(listingPhotos.length, 5);
        const scriptChunks = splitScriptIntoChunks(safeScript, numScenes);
        const photoSlice = listingPhotos.slice(0, scriptChunks.length);

        const audioBuffers = await Promise.all(
          scriptChunks.map((chunk) => generateSpeech(chunk, profile.voice_clone_id!)),
        );
        const audioAssetIds = await Promise.all(
          audioBuffers.map((buf) => uploadAudioAsset(buf)),
        );

        const scenes: SceneInput[] = scriptChunks.map((scriptText, i) => ({
          scriptText,
          audioAssetId: audioAssetIds[i],
          backgroundImageUrl: photoSlice[i],
        }));

        const { data: videoRow, error: videoRowErr } = await admin
          .from("generated_videos")
          .insert({
            project_id: projectId,
            user_id: user.id,
            video_type: videoType,
            render_provider: "heygen_v2",
            render_status: "rendering",
            metadata: { dimension, orientation, city, state, title },
          })
          .select()
          .single();

        if (videoRowErr || !videoRow) {
          throw new Error(`Failed to create video record: ${videoRowErr?.message ?? "unknown"}`);
        }

        const heygenVideoId = await generateVideo({
          scenes,
          talkingPhotoId: avatarId,
          photoPosition: "bottom-right",
          dimension,
          title,
          callbackUrl,
          callbackId: videoRow.id,
        });

        await admin
          .from("generated_videos")
          .update({ render_job_id: heygenVideoId })
          .eq("id", videoRow.id);

        await admin.from("profiles").update({ credits_remaining: profile.credits_remaining - 1 }).eq("id", user.id);
        await admin.from("api_usage_log").insert({
          user_id: user.id,
          api_provider: "heygen",
          endpoint: "video-v2-el-tts-photos",
          credits_used: 1,
          response_status: 202,
        });

        console.log(`[create-blog] v2 multi-scene video ${heygenVideoId} submitted (${scenes.length} scenes, EL voice)`);
        return NextResponse.json({
          video: {
            ...videoRow,
            render_job_id: heygenVideoId,
            render_status: "rendering",
          },
        });
      } catch (elErr) {
        console.error("[create-blog] EL multi-scene failed, falling back to Video Agent:", elErr instanceof Error ? elErr.message : elErr);
        // Fall through to Video Agent path below
      }
    }

    // ── Video Agent path: no EL voice (or EL failed) → use HeyGen voice ID ───
    let voiceId = profile.heygen_voice_id;
    if (!voiceId) {
      const privateVoiceId = await getPrivateVoiceId().catch(() => null);
      if (privateVoiceId) {
        voiceId = privateVoiceId;
        // Save so future videos use it directly without a fallback lookup
        void admin.from("profiles").update({ heygen_voice_id: privateVoiceId }).eq("id", user.id);
      }
    }
    voiceId = voiceId || await getDefaultEnglishVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

    const files: VideoAgentFile[] = [];
    if (profile.logo_url) {
      files.push({ type: "url", url: profile.logo_url });
    }
    // Attach listing photos + user-uploaded photos, combined cap of 12.
    const combinedPhotos = [...listingPhotos, ...safeExtraPhotos].slice(0, 12);
    for (const url of combinedPhotos) {
      files.push({ type: "url", url });
    }
    // PDF content is already injected into the prompt via pdfText — don't pass
    // the PDF URL to HeyGen as a file since it rejects application/pdf content type.

    const { data: videoRow, error: videoRowErr } = await admin
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

    if (videoRowErr || !videoRow) {
      throw new Error(`Failed to create video record: ${videoRowErr?.message ?? "unknown"}`);
    }

    const sessionId = await generateVideoAgent({
      prompt,
      avatarId,
      voiceId,
      orientation,
      files: files.length > 0 ? files : undefined,
      callbackUrl,
      callbackId: videoRow?.id,
    });

    await admin
      .from("generated_videos")
      .update({ render_job_id: sessionId })
      .eq("id", videoRow?.id);

    await admin.from("profiles").update({ credits_remaining: profile.credits_remaining - 1 }).eq("id", user.id);
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-agent-v3",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[create-blog] Video Agent session ${sessionId} submitted (avatar: ${avatarId}, voice: ${voiceId})`);
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
