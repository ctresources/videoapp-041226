import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  generateVideoV3,
  resolveVoiceId,
  getAvatarLooks,
  uploadTalkingPhoto,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
} from "@/lib/api/heygen";
import { sanitizeNarration } from "@/lib/utils/sanitize-narration";
import { buildCallbackUrl } from "@/lib/utils/webhook-callback";
import { cropPhotosToAspect } from "@/lib/utils/crop-photos";
import { MUSIC_PROMPT_INSTRUCTION } from "@/lib/utils/music-presets";
import { chargeFor, type VideoKind } from "@/lib/utils/video-allowance";
import { canUseDigitalTwin } from "@/lib/utils/plan-features";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

// Word budgets at a natural ~145 wpm delivery.
//
// SHORT videos render on the Video Agent, which carries the script inside its
// prompt — so length is capped by both plan AND the prompt budget. Past ~4 min
// the script squeezes out the quality instructions, and at ~4.8 min there is no
// room left for any of them, so 4 min is the practical ceiling.
const MAX_SHORT_WORDS_3MIN = 435;  // Starter
const MAX_SHORT_WORDS_4MIN = 580;  // Agent / Pro
// Back-compat default for any caller that doesn't resolve a plan.
const MAX_SCRIPT_WORDS = MAX_SHORT_WORDS_3MIN;

// LONG videos render on Direct Video (script is a separate field, no prompt
// limit), so this is a pure product/cost choice: 8 min at $1/min (Avatar III
// digital twin) or $2.60/min (Avatar III photo avatar).
const MAX_LONG_FORM_SCRIPT_WORDS = 1160; // ~8 min

// Admins render test videos beyond what any plan sells, so they get HeyGen's
// own practical ceiling (~15 min) rather than the product limit. Safe to raise
// only for long form: it uses Direct Video, where the script is a separate
// field with no prompt budget. The SHORT cap must stay put — that one is a
// technical ceiling, not a plan choice (see the note above).
const MAX_LONG_FORM_SCRIPT_WORDS_ADMIN = 2175; // ~15 min

// Short and long videos draw from SEPARATE monthly allowances (1 each), so
// there is no shared cost multiplier. See the plan allotments in lib/stripe.ts.

function clampScript(text: string, maxWords: number = MAX_SCRIPT_WORDS): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + ".";
}

/**
 * Expand common address/unit abbreviations into full words so the TTS engine
 * pronounces "Ln" as "Lane" instead of "L-N", "St" as "Street", etc.
 *
 * Also removes phone numbers from the narration entirely — contact info is
 * display-only (end-frame contact card / video description) and the avatar
 * must never speak it.
 *
 * Runs sanitizeNarration first: markdown, bullets, emoji, and citation
 * markers make the Video Agent rewrite the script in its own words instead
 * of speaking it verbatim.
 */
function normalizeScriptForTTS(text: string): string {
  if (!text) return text;
  text = sanitizeNarration(text);

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

  // Remove phone numbers from the narration entirely — contact info is
  // display-only (end-frame contact card / video description) and the avatar
  // must never speak it. Also swallows a leading "call/text (me/us) at" so
  // the sentence doesn't dangle.
  out = out.replace(
    /(?:(?:call|text)(?:\s+or\s+(?:call|text))?(?:\s+(?:me|us))?\s+(?:at|on)\s+)?\+?1?[\s.\-]?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]?\d{4}\b/gi,
    "",
  );
  out = out.replace(/ {2,}/g, " ").replace(/\s+([,.!?])/g, "$1");

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
  logoUrl?: string;
  keywords: string[];
  isShortForm: boolean;
  /** 1:1 square (1080×1080). Square is "short form" for pacing but is NOT vertical. */
  isSquare?: boolean;
  isLongForm?: boolean;
  burnCaptions?: boolean;
  hookText?: string;
  listingAddress?: string;
  listingPhotoCount?: number;
  extraPhotoCount?: number;
  pdfContent?: string;
}): { head: string; tail: string } {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const locationOr = location || "the local area";

  const ctaText =
    params.ctaPreference === "website" ? `Visit ${params.website || "Our Website"} to Learn More` :
    params.ctaPreference === "consultation" ? "Schedule Your Private Consultation Today" :
    "Call or Text Today to Get Started";

  // Display-only contact line for the final frame. BOTH phones appear on-screen;
  // neither is ever spoken (see PRONUNCIATION in the tail).
  const contactLine = [
    params.agentName,
    params.brokerage,
    params.phone1 ? `Mobile: ${params.phone1}` : "",
    params.phone2 ? `Office: ${params.phone2}` : "",
    params.website,
  ].filter(Boolean).join("  ·  ");

  const audienceVisual = params.audience ? AUDIENCE_VISUALS[params.audience] || "" : "";
  const toneVisual = params.tone ? TONE_VISUALS[params.tone] || "" : "";

  // Canvas label reused by every shared block, so a vertical or square render is
  // never told to "fill the 16:9 canvas".
  const canvasLabel = params.isSquare ? "1:1 square" : params.isShortForm ? "9:16 vertical" : "16:9 widescreen";

  const orientationBlock = params.isSquare
    ? `OUTPUT FORMAT — 1:1 SQUARE (NON-NEGOTIABLE)
CANVAS: 1080 × 1080, perfectly square. NOT vertical, NOT widescreen.
Fill the square edge-to-edge — no black bars. Zoom and crop the presenter to fill it (cropping edges is fine); if cropping alone can't fill the frame, place the presenter over a blurred enlarged copy of the same footage.`
    : params.isShortForm
    ? `OUTPUT FORMAT — 9:16 VERTICAL (NON-NEGOTIABLE)
CANVAS: 1080 wide × 1920 tall, portrait — like a Reel/TikTok. NOT landscape.
Fill the vertical frame edge-to-edge — no black bars. Zoom and crop the presenter (crop the sides) to fill it; if that can't fill the frame, place the presenter over a blurred enlarged copy of the same footage.`
    : `OUTPUT FORMAT — 16:9 WIDESCREEN (NON-NEGOTIABLE)
CANVAS: 1920 wide × 1080 tall, landscape. NEVER render vertical/portrait.
Fill the frame edge-to-edge — no black bars. The presenter's footage is portrait, so on every scene either zoom and crop it to fill the width (cropping top/bottom is fine), or put a full-frame background behind it (blurred enlarged footage, b-roll, or a branded backdrop). Black side panels are a failed render.`;

  const listingCount = params.listingPhotoCount ?? 0;
  const extraCount = params.extraPhotoCount ?? 0;
  const totalPhotos = listingCount + extraCount;

  const photoBlock = totalPhotos > 0
    ? `
ATTACHED PHOTOS — PRIMARY B-ROLL
${totalPhotos} photo(s) are attached${listingCount > 0 ? ` (${listingCount} of the property at ${params.listingAddress || "the listing address"}${extraCount > 0 ? `, ${extraCount} user-uploaded` : ""})` : ""}.
- Use ALL of them as the primary b-roll; cycle so each gets ~5–10s of screen time.
- Crop/scale every photo to FILL the frame edge-to-edge (cover scaling) — never letterbox or pillarbox, even for portrait photos.
- Gentle Ken Burns motion (slow pan + zoom) on each.
- Match each photo to the sentence describing it. Do NOT replace them with stock or generated imagery; stock b-roll only between photos for transitions.`
    : "";

  const monthName = new Date().toLocaleString("en-US", { month: "long" });

  // ── HEAD: must-have instructions + the full narration script. Never trimmed. ──
  const head = `You are producing a professional real estate marketing video.

${orientationBlock}

TEXT SAFE ZONE — NOTHING MAY COVER THE PRESENTER'S FACE (RULE #1)
- EVERY text or graphic element — captions, headlines, hooks, lower-thirds, stats, numbers, charts, infographics, logos, badges, arrows — must sit ENTIRELY inside the BOTTOM 20% of the canvas (on a 1080-tall frame that is the bottom ~216px; on a 1920-tall frame ~384px).
- The TOP 80% is a NO-OVERLAY ZONE. The presenter's head and face are there. Never center an overlay, never place text beside the head, never over the chest or shoulders. This applies even when the presenter is only partly visible.
- Standard treatment: a full-width semi-transparent dark bar pinned to the bottom edge, white or soft-gold text inside.
- A graphic too large for the bottom band must be SHRUNK to fit, or shown on a b-roll-only scene where the presenter is off camera. Never enlarge it into the face zone.
- When in doubt, move it DOWN. Bottom edge is always correct; middle of frame is always wrong.

AVATAR + B-ROLL INTERCUT (MANDATORY)
- When on camera the presenter is FULL SCREEN, filling the entire ${canvasLabel} canvas — no PiP, no corner bubble, no circular crop. Always the animated, lip-synced avatar; never a static image.
- Cut away to relevant b-roll every time the script mentions a property feature, neighborhood detail, statistic or lifestyle benefit, then cut back to the presenter. Target roughly 50/50 presenter/b-roll — never hold the presenter for the entire video.

LOCATION ACCURACY — ${locationOr}, ${monthName}
- Every visual must be believable for ${locationOr} during ${monthName}: correct hemisphere and season, foliage, weather, daylight, architecture, building materials, street layout, landscaping and terrain.
- Prohibited unless ${locationOr} genuinely has them: palm trees, tropical plants, desert cacti, snow-capped mountains, ocean beaches, glaciers, redwood forests, farm fields, or snow outside its real cold season.
- Unsure whether something fits? Use a neutral interior or a generic residential street — never invent dramatic or exotic scenery.

FAIR HOUSING + NAR COMPLIANCE (OVERRIDES EVERY OTHER INSTRUCTION)
- Never imply preference or limitation based on race, color, religion, sex, gender identity, sexual orientation, disability, familial status or national origin.
- No steering language ("perfect for a young family", "great for singles", "ideal for retirees", "safe neighborhood", "family-friendly", "exclusive community").
- Never cite crime rates, an area's demographic/religious makeup, religious institutions, or school quality as selling points.
- People shown in b-roll must be diverse and inclusive.
- Keep claims truthful (NAR Article 12) — never exaggerate or fabricate statistics.
- Render the script as written, but add no non-compliant visuals or overlays of your own.

SCENE 1 — TITLE CARD (this frame is also the thumbnail)
- Full-screen talking presenter filling the entire ${canvasLabel} canvas — the avatar IS the thumbnail; no separate background photo.
- MANDATORY OVERLAY: a full-width dark semi-transparent bar across the bottom 20% containing this EXACT text in large bold white letters: ${params.hookText ? `"${params.hookText}"` : '"Your Local Real Estate Expert"'}. It must stay visible for all of Scene 1. Do not omit it or change the wording. Style it as a bold, scroll-stopping social hook.
- No other text on this card. Narration begins immediately on the first frame — never hold a silent intro.

FINAL SCENE — CTA CONTACT CARD${params.logoUrl ? `
- Display the attached agent/brokerage logo prominently (top-left or top-center).` : ""}
- On-screen only, never narrated: ${contactLine}
- Show phone numbers exactly as provided — no leading "1", no country code.
- Bold CTA headline: "${ctaText}"
- Presenter full-screen or beside the card; fill the whole canvas (blurred enlarged footage or b-roll behind if needed) — never black bars.

DURATION (CRITICAL)
- Maximum ${params.isLongForm ? "40 scenes; vary the visuals every 20–30 seconds to hold attention" : "10 scenes"}.
- The voiceover must contain 100% of the narration script below, word for word, first word to last, at a natural unhurried ~145 wpm. Never summarize, paraphrase, shorten, trim or speed-read it. The video ends only after the FINAL word is spoken — ending before the script is finished is WRONG.
- No intro music, countdown or silent title scene. No filler or silent gaps.

DETAILS
- Agent: ${params.agentName || "Local Real Estate Agent"}${params.brokerage ? ` · ${params.brokerage}` : ""} · Market: ${locationOr}
- Audience: ${params.audience || "Mixed"} · Style: ${params.tone || "Modern"}
- DISPLAY ONLY, never spoken:${params.phone1 ? ` Mobile ${params.phone1}` : ""}${params.phone2 ? ` · Office ${params.phone2}` : ""}${params.website ? ` · Web ${params.website}` : ""}

NARRATION SCRIPT — SPEAK THIS EXACTLY, ONCE, IN FULL
Do not repeat the opening line. Never speak any headline, title-card, overlay or thumbnail text — those are visual only. The voiceover starts with the first words below:

${params.script}
`;

  // ── TAIL: refinement. Trimmed first if the prompt ever exceeds the cap. ──
  const tail = `${params.pdfContent ? `
PDF REFERENCE (supplemental context for b-roll, on-screen stats and talking points)
${params.pdfContent}
` : ""}
VISUAL SYNC — every b-roll clip must match what is being spoken at that moment
- Room mentioned → show that room. Neighborhood/street → that street type. Statistic or price → a data overlay of that exact number (in the bottom band). Lifestyle benefit → show it. Address → a matching home exterior.
- Cut to new b-roll whenever the topic changes. Never show Topic B while narrating Topic A.${photoBlock}

PRONUNCIATION
- The script is already normalized (abbreviations expanded) — read every word exactly as written, never spelling out letters.
- NEVER speak phone numbers, emails or URLs — they are display-only. Omit any from the voiceover and show them on screen instead. Add no contact info that isn't in the script.

B-ROLL CONTENT — ${locationOr} aerials/establishing shots, residential streets and curb appeal, interiors (kitchens, living spaces, open plans), lifestyle scenes (cafes, parks, people).${audienceVisual ? `
- Audience (${params.audience}): ${audienceVisual}` : ""}${params.keywords.length > 0 ? `
- Emphasis: ${params.keywords.slice(0, 5).join(", ")}` : ""}

STYLE
- B-roll: slight warm filter — inviting, not cool/blue.${toneVisual ? `
- Tone (${params.tone}): ${toneVisual}` : ""}
- ${params.isShortForm ? "Fast punchy cuts, bold overlays, social-optimized" : "Smooth cinematic transitions, premium editorial feel"}.
- Charts: bars → prices, lines → trends, infographics → inventory/demand. All obey the TEXT SAFE ZONE.${params.burnCaptions ? `
- BURNED CAPTIONS (required): synchronized captions for the ENTIRE video, 4–6 words at a time, bold white on semi-transparent dark, inside the bottom band — above the hook bar on Scene 1, above the contact card on the final scene. Never over the face.` : ""}
- Text: white or soft gold, gold/navy accents, bold and readable — no clutter.

Deliver a polished, scroll-stopping video that positions the agent as the trusted local expert and converts viewers into leads.`;

  return { head, tail };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script, cta, lookId, hook: requestHook, musicUrl, pdfUrl, pdfText, extraPhotoUrls, engine, longForm, captions = true } = await req.json();
  // Long videos (up to 8 min) are landscape-only and draw 3x from the allowance.
  const isLongForm = longForm === true && videoType !== "reel_9x16" && videoType !== "short_1x1";
  // engine "direct" routes to HeyGen's v3 Direct Video API (single talking-head)
  // instead of the default Video Agent.
  //
  // Long-form ALWAYS uses Direct Video. The Video Agent carries the narration
  // inside its prompt, which caps out around 800 words (~5.5 min) — short of the
  // advertised 8-minute length, and the
  // overflow would be trimmed away. Direct Video takes the script as its own
  // field, so the full script is spoken; visuals come from the user's uploaded
  // photos, composited behind the avatar after rendering.
  const useDirectVideo = engine === "direct" || isLongForm;
  const safeExtraPhotos: string[] = Array.isArray(extraPhotoUrls)
    ? extraPhotoUrls.filter((u) => typeof u === "string").slice(0, 3)
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

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, heygen_digital_twin_look_id, avatar_url, logo_url, full_name, company_name, phone, company_phone, location_city, location_state, website, voice_clone_id, credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, role, subscription_tier")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    heygen_voice_id: string | null;
    heygen_photo_id: string | null;
    heygen_digital_twin_look_id: string | null;
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
    long_credits_remaining: number;
    purchased_short_videos: number;
    purchased_long_videos: number;
    role: string | null;
    subscription_tier: string | null;
  } | null;

  // Auto-register the headshot with HeyGen if avatar_url exists but heygen_photo_id is not yet set
  if (profile && !profile.heygen_photo_id && profile.avatar_url) {
    try {
      const photoId = await uploadTalkingPhoto(profile.avatar_url);
      await admin.from("profiles").update({ heygen_photo_id: photoId }).eq("id", user.id);
      profile.heygen_photo_id = photoId;
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

  const isAdmin = profile.role === "admin";

  // ── Script length by plan ─────────────────────────────────────────────────
  // Short videos: Starter up to 3 min, Agent/Pro up to 4 min. Long videos: 8 min
  // on any plan. Word counts assume a natural ~145 wpm delivery. Short videos
  // also have a hard technical ceiling — they render on the Video Agent, whose
  // prompt carries the script, so past ~4 min the quality instructions get
  // squeezed out (see the head/tail budget below).
  const tier = profile.subscription_tier ?? "free";
  // Admins get the highest cap regardless of tier — otherwise an admin whose
  // tier is "free" is silently held to 3 minutes, which breaks the long-video
  // testing that being an admin is for. (canUseDigitalTwin already does this;
  // this cap was the one place still keyed on tier alone.)
  const shortFormMaxWords =
    isAdmin || tier === "agent" || tier === "pro" ? MAX_SHORT_WORDS_4MIN : MAX_SHORT_WORDS_3MIN;
  const longFormMaxWords = isAdmin ? MAX_LONG_FORM_SCRIPT_WORDS_ADMIN : MAX_LONG_FORM_SCRIPT_WORDS;
  const maxScriptWords = isLongForm ? longFormMaxWords : shortFormMaxWords;

  // The CTA arrives separately and is appended AFTER the body clamp. It lives
  // at the end of the spoken script, so a plain tail-clamp used to silently
  // delete it whenever the body ran long — the "missing CTA in video" bug.
  const ctaText = typeof cta === "string" && cta.trim() ? clampScript(normalizeScriptForTTS(cta.trim()), 200) : "";
  const ctaWordCount = ctaText ? ctaText.trim().split(/\s+/).length : 0;
  const bodyScript = clampScript(
    normalizeScriptForTTS(rawScript),
    Math.max(50, maxScriptWords - ctaWordCount),
  );
  const safeScript = ctaText ? `${bodyScript}\n\n${ctaText}` : bodyScript;

  // Log the delivered script length so a short render can be diagnosed as
  // "script was short" vs "HeyGen under-delivered the full script".
  const scriptWordCount = safeScript.trim().split(/\s+/).filter(Boolean).length;
  console.log(`[create-blog] script sent: ${scriptWordCount} words (~${Math.round(scriptWordCount / 145 * 60)}s at 145wpm), tier=${tier}, cap=${maxScriptWords}, videoType=${videoType}`);

  // Short and long are separate allowances, and within each the monthly plan
  // balance is spent before purchased add-ons (the plan balance expires at the
  // end of the cycle; purchased videos never do).
  const videoKind: VideoKind = isLongForm ? "long" : "short";
  const charge = chargeFor(profile, videoKind);
  const creditCost = 1;

  if (!isAdmin && !charge) {
    // `code` and `kind` let the client open the plan picker instead of
    // string-matching the message. Someone who just watched their free video
    // render is the most likely person to buy — a dead-end toast wastes that.
    return NextResponse.json(
      {
        code: "out_of_videos",
        kind: videoKind,
        tier,
        error: isLongForm
          ? "You've used all your long videos. Buy another for $39 in Billing, upgrade your plan, or record one free with the camera teleprompter."
          : "You've used all your short videos. Buy more in Billing or upgrade your plan.",
      },
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

    const hookText = requestHook || (aiScript?.hook as string) || undefined;
    const audience = (aiScript?.audience as string) || undefined;
    const tone = (aiScript?.tone as string) || undefined;
    const ctaPreference = (aiScript?.cta_preference as string) || undefined;
    const phones = Array.from(new Set([profile.phone, profile.company_phone].filter(Boolean))) as string[];

    const listingAddress = (listingData?.address as string | undefined) || undefined;

    // HeyGen's Video Agent caps the prompt at ~10,000 characters; we stay under
    // 8,500 for margin. buildVideoAgentPrompt() returns two parts:
    //   head — format rules, safe zone, compliance, title/CTA cards, and the FULL
    //          narration script. Never trimmed.
    //   tail — refinement (visual sync, pronunciation, location, b-roll, style).
    //          Trimmed from the end if we run out of budget.
    // A previous version concatenated everything and blind-sliced at the cap,
    // which silently cut the narration script and every rule after it.
    // 9,800 sits just under HeyGen's ~10k ceiling: at 8,500 a normal 500-word
    // script left room for only ~17% of the refinement rules.
    const HEYGEN_PROMPT_LIMIT = 9800;
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
      logoUrl: profile.logo_url || undefined,
      keywords: aiKeywords,
      isShortForm,
      isSquare: videoType === "short_1x1",
      isLongForm,
      burnCaptions: captions !== false,
      hookText,
      listingAddress,
      listingPhotoCount: listingPhotos.length,
      extraPhotoCount: safeExtraPhotos.length,
    };

    const fullPdf = pdfText ? String(pdfText) : undefined;
    const pdfForPrompt = fullPdf?.slice(0, 2000);

    // Music instruction is prepended so trimming can never cut it off. The track
    // itself is attached as a file where the files list is built.
    const musicPrefix = typeof musicUrl === "string" && musicUrl.trim() ? MUSIC_PROMPT_INSTRUCTION : "";

    let { head, tail } = buildVideoAgentPrompt({ ...promptParams, pdfContent: pdfForPrompt });

    // If the script is so long that the head alone blows the budget (long-form),
    // shorten the SCRIPT at a sentence boundary and rebuild. The agent carries the
    // script inside the prompt, so there is no way around the cap — but ending on
    // a complete sentence beats slicing the prompt mid-word (which used to drop
    // the script and every rule after it).
    if (musicPrefix.length + head.length > HEYGEN_PROMPT_LIMIT) {
      const overflow = musicPrefix.length + head.length - HEYGEN_PROMPT_LIMIT;
      const keep = Math.max(200, safeScript.length - overflow);
      const cut = safeScript.slice(0, keep);
      const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
      const trimmedScript = (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim();
      console.warn(
        `[create-blog] script too long for the Video Agent prompt ` +
        `(${scriptWordCount} words). Trimmed to ~${trimmedScript.split(/\s+/).length} words at a ` +
        `sentence boundary. Use engine="direct" to deliver long scripts in full.`,
      );
      ({ head, tail } = buildVideoAgentPrompt({ ...promptParams, script: trimmedScript, pdfContent: pdfForPrompt }));
    }

    const room = HEYGEN_PROMPT_LIMIT - musicPrefix.length - head.length;
    const prompt = musicPrefix + head + (room > 0 ? tail.slice(0, room) : "");

    console.log(
      `[create-blog] prompt ${prompt.length}/${HEYGEN_PROMPT_LIMIT} chars ` +
      `(head ${head.length}, tail ${Math.max(0, Math.min(room, tail.length))}/${tail.length} kept)`,
    );

    const callbackUrl = buildCallbackUrl();

    // avatarId is only set when the client explicitly selected a look (Avatar + Voice mode).
    // Voice Only mode sends no lookId, so no avatar is placed on screen.
    const avatarId: string | undefined = lookId || undefined;

    // ── Direct Video path (opt-in via engine="direct") ──────────────────────────
    // Experimental: HeyGen v3 Direct Video — a single talking-head from the
    // avatar look + a HeyGen voice + the full script. No photo/b-roll
    // composition (that's the Video Agent's job); used to compare raw avatar
    // output. Polled single-step via getVideoV3Status (render_provider tag).
    if (useDirectVideo) {
      // Resolve the avatar: explicit look → the user's digital twin → the
      // first completed look in their photo-avatar group. Direct Video always
      // needs an avatar, but paste-script users may not have picked one, so we
      // fall back to their default rather than erroring.
      // Digital twins are Agent/Pro only. Someone who trained one and then
      // downgraded still has the look id on their profile, so gate it here too
      // — the id is deliberately NOT cleared, so upgrading restores the twin
      // without retraining.
      const twinAllowed = canUseDigitalTwin(tier, profile.role);
      const twinLookId = profile.heygen_digital_twin_look_id;
      if (!twinAllowed && twinLookId) {
        console.log(`[create-blog] Digital twin ignored — tier=${tier} is not Agent/Pro; using photo avatar.`);
      }

      // A client can pass any lookId, so drop an explicitly-requested twin too
      // — checking only the profile fallback would leave the gate bypassable.
      const requestedAvatar = !twinAllowed && avatarId && avatarId === twinLookId ? undefined : avatarId;

      let directAvatarId = requestedAvatar || (twinAllowed ? twinLookId : null) || undefined;
      if (!directAvatarId && profile.heygen_photo_id) {
        try {
          const looks = await getAvatarLooks(profile.heygen_photo_id);
          const ready = looks.find((l) => l.status === "completed") || looks[0];
          if (ready?.id) directAvatarId = ready.id;
        } catch (e) {
          console.warn("[create-blog] Direct avatar resolution failed:", e instanceof Error ? e.message : e);
        }
      }
      if (!directAvatarId) throw new Error("Set up your avatar in Settings → Brand Profile to generate a talking-head video.");
      console.log(`[create-blog] Direct Video path (engine=direct) — avatar ${directAvatarId}`);

      // Direct Video needs a HeyGen voice_id. Only the user's OWN clone, or a
      // neutral public voice — never another account's private clone. See the
      // note on resolveVoiceId.
      const directVoiceId = await resolveVoiceId(profile.heygen_voice_id);
      if (!directVoiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

      // Photos to composite as b-roll behind the avatar (up to 8) — uploaded
      // photos take priority, then any listing photos.
      const directPhotos = [
        ...(Array.isArray(extraPhotoUrls) ? extraPhotoUrls.filter((u): u is string => typeof u === "string") : []),
        ...listingPhotos,
      ].slice(0, 8);

      const { data: videoRow, error: videoRowErr } = await admin
        .from("generated_videos")
        .insert({
          project_id: projectId,
          user_id: user.id,
          video_type: videoType,
          render_provider: "heygen_v3_direct",
          render_status: "rendering",
          metadata: {
            dimension, orientation, city, state, title,
            ...(typeof musicUrl === "string" && musicUrl.trim() && { music_url: musicUrl.trim() }),
            // Direct Video is a bare talking head — the webhook composites these
            // uploaded photos as background b-roll behind the avatar PiP.
            ...(directPhotos.length > 0 && { photo_urls: directPhotos }),
          },
        })
        .select()
        .single();

      if (videoRowErr || !videoRow) {
        throw new Error(`Failed to create video record: ${videoRowErr?.message ?? "unknown"}`);
      }

      const isDigitalTwin = directAvatarId === profile.heygen_digital_twin_look_id;

      // Engine choice is a cost/quality trade (HeyGen bills per second):
      //   avatar_iii  digital twin $1.00/min · photo avatar $2.60/min
      //   avatar_iv   photo avatar $3.00/min · digital twin $4.00/min
      //   avatar_v    digital twin $4.00/min — highest-fidelity motion/lip-sync
      //
      // LONG videos run 8 minutes, so the per-minute rate dominates: Avatar III
      // keeps a 10-min twin render at ~$8 instead of ~$32, and the avatar shares
      // the screen with the user's photos rather than carrying it alone.
      // SHORT Direct Video renders are 1-4 min, where the delta is a few dollars
      // and the face fills the frame — so those keep the best engine available.
      const directEngine = isLongForm
        ? ("avatar_iii" as const)
        : isDigitalTwin
          ? ("avatar_v" as const)
          : undefined; // photo avatars use HeyGen's default (avatar_iv)

      const directVideoId = await generateVideoV3({
        avatarId: directAvatarId,
        voiceId: directVoiceId,
        scriptText: safeScript,
        dimension,
        title,
        callbackUrl,
        callbackId: videoRow.id,
        ...(directEngine && { engine: directEngine }),
      });

      await admin
        .from("generated_videos")
        // credit_cost enables an automatic refund if the render later fails
        .update({ render_job_id: directVideoId, metadata: { ...(videoRow.metadata ?? {}), credit_cost: creditCost, credit_kind: videoKind, credit_source: charge?.source ?? "plan" } })
        .eq("id", videoRow.id);

      // Admins are never charged. Previously only the REFUSAL was skipped for
      // them, so balances still drained to zero and had to be topped up by hand
      // (one admin account was manually set to 9999 short videos).
      if (charge && !isAdmin) await admin.from("profiles").update({ [charge.column]: charge.newValue }).eq("id", user.id);
      await admin.from("api_usage_log").insert({
        user_id: user.id,
        api_provider: "heygen",
        endpoint: "video-v3-direct",
        credits_used: creditCost,
        response_status: 202,
      });

      console.log(`[create-blog] Direct Video ${directVideoId} submitted (avatar: ${avatarId}, voice: ${directVoiceId})`);
      return NextResponse.json({
        video: {
          ...videoRow,
          render_job_id: directVideoId,
          render_status: "rendering",
        },
      });
    }

    // ── Video Agent path (v3): the presenter + listing photos + b-roll are
    // composed by HeyGen's Video Agent using the user's cloned HeyGen voice. ───
    const voiceId = await resolveVoiceId(profile.heygen_voice_id);

    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

    const files: VideoAgentFile[] = [];
    if (profile.logo_url) {
      files.push({ type: "url", url: profile.logo_url });
    }
    // Attach listing photos + user-uploaded photos, capped at 5 total.
    // Fewer files = faster Video Agent processing time.
    //
    // Cropped to the frame first: the Video Agent decides its own framing, so
    // a square photo otherwise renders with bars in a 16:9 video. The Direct
    // Video path doesn't need this — it composites through composite-photos.ts,
    // which already fills the frame. Failures return the original URL.
    const combinedPhotos = await cropPhotosToAspect(
      [...listingPhotos, ...safeExtraPhotos].slice(0, 5),
      dimension.width,
      dimension.height,
      user.id,
    );
    for (const url of combinedPhotos) {
      files.push({ type: "url", url });
    }
    // Background music is NOT attached here — the Video Agent rejects audio
    // files. The chosen track URL is stored in the row's metadata and mixed
    // under the voiceover by the webhook when the finished render is stored.
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
        metadata: {
          dimension, orientation, city, state, title,
          // Mixed under the voiceover by the webhook at store time.
          ...(typeof musicUrl === "string" && musicUrl.trim() && { music_url: musicUrl.trim() }),
        },
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
      // credit_cost enables an automatic refund if the render later fails
      .update({ render_job_id: sessionId, metadata: { ...(videoRow?.metadata ?? {}), credit_cost: creditCost, credit_kind: videoKind, credit_source: charge?.source ?? "plan" } })
      .eq("id", videoRow?.id);

    // Admins are never charged. Previously only the REFUSAL was skipped for
      // them, so balances still drained to zero and had to be topped up by hand
      // (one admin account was manually set to 9999 short videos).
      if (charge && !isAdmin) await admin.from("profiles").update({ [charge.column]: charge.newValue }).eq("id", user.id);
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-agent-v3",
      credits_used: creditCost,
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
