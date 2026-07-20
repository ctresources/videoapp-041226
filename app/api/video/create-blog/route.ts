import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideoAgent,
  generateVideoV3,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  uploadTalkingPhoto,
  DIMENSIONS,
  type VideoType,
  type VideoAgentFile,
} from "@/lib/api/heygen";
import { sanitizeNarration } from "@/lib/utils/sanitize-narration";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const MAX_SCRIPT_WORDS = 500;
// ~10 min at a natural ~145 wpm speaking pace — matches the long-form cap.
// Capped at 10 (not 15) minutes: HeyGen's Video Agent bills $0.0333/sec, so a
// 15-min render costs ~$30 vs ~$20 at 10 min, and 8+ min still qualifies for
// YouTube mid-roll ads — the whole point of long-form for our users.
const MAX_LONG_FORM_SCRIPT_WORDS = 1450;

// Long-form AI videos (8–10 min) cost more credits because HeyGen bills per
// rendered minute — a 10-min render costs ~5× a standard 2-min video.
const LONG_FORM_CREDIT_COST = 6;

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

/**
 * Build explicit b-roll accuracy guidance so the Video Agent never shows
 * scenery that contradicts the listing's real-world location or the current
 * season. Users are worldwide, so we do NOT assume a US state or a
 * Northern-Hemisphere season here — we pass the actual location string plus
 * the current month and let the agent reason about the correct local climate,
 * hemisphere, terrain, and architecture.
 */
function buildLocationSeasonGuidance(state: string, city: string): string {
  const place = [city, state].filter(Boolean).join(", ") || "the listing's local area";
  const region = [city, state].filter(Boolean).join(", ") || "the listing's location";

  // Pass the current month through and let the agent infer the correct local
  // season. We intentionally avoid hardcoding a hemisphere — June is summer in
  // the Northern Hemisphere but winter in the Southern Hemisphere.
  const monthName = new Date().toLocaleString("en-US", { month: "long" });

  return `=====================================
LOCATION ACCURACY (CRITICAL — READ CAREFULLY)
=====================================
- This listing is located in: ${region}. All visuals must be geographically accurate for THIS location — not a generic or US-default look.
- The current month is ${monthName}. Use foliage, weather, daylight, and seasonal cues that are correct for ${region} during ${monthName}, accounting for that location's real hemisphere and climate (e.g. ${monthName} is summer in the Northern Hemisphere but winter in the Southern Hemisphere).
- Match the architecture, building materials, street layout, landscaping, plant life, and terrain that genuinely exist in ${region}.
- Do NOT show landscape features that do not belong in ${region}: e.g. no palm trees or tropical beaches in cold or inland climates, no snow-capped mountains in flat coastal areas, no deserts in temperate regions, and no snow outside of that location's actual cold season.
- When uncertain whether a visual fits ${region}, use neutral interior shots or generic residential street scenes that cannot contradict the location — do NOT invent dramatic or exotic scenery.
- ${place} is the market being marketed; keep every outdoor scene believable for someone who actually lives there.

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
  logoUrl?: string;
  keywords: string[];
  isShortForm: boolean;
  isLongForm?: boolean;
  burnCaptions?: boolean;
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

  const orientationBlock = params.isShortForm
    ? `=====================================
OUTPUT FORMAT — 9:16 VERTICAL (NON-NEGOTIABLE)
=====================================
CANVAS: 1080 pixels wide × 1920 pixels tall. Vertical portrait orientation — taller than wide.
- Produce this video in VERTICAL 9:16 format, like an Instagram Reel / TikTok.
- Fill the entire vertical frame edge-to-edge — no black bars.
- PRESENTER FILL RULE: if the presenter's source footage is wider than 9:16, ZOOM AND CROP it (crop the sides) so the presenter fills the full vertical frame — NEVER letterbox with black bars above/below or beside the presenter. If cropping alone cannot fill the frame, place the presenter over a blurred, enlarged copy of the same footage so every pixel of the canvas is covered.

`
    : `=====================================
OUTPUT FORMAT — 16:9 WIDESCREEN (NON-NEGOTIABLE)
=====================================
CANVAS: 1920 pixels wide × 1080 pixels tall. Horizontal landscape orientation — wider than tall.
- This is a LANDSCAPE video. The frame is wider than it is tall. Do NOT produce portrait/vertical output.
- Fill the entire 1920×1080 canvas edge-to-edge — ZERO black bars on any side, left, right, top, or bottom.
- NEVER render this as a vertical or portrait video. The output MUST be horizontal widescreen.
- All b-roll, backgrounds, and photo crops must fill the full 1920×1080 widescreen frame.
- PRESENTER FILL RULE (CRITICAL): the presenter's source footage is portrait/square, NOT widescreen. Do NOT place it in the center with black side bars — that is a failed render. Instead, on EVERY scene where the presenter appears (including the title card and the final contact card), do ONE of the following so the full 1920×1080 canvas is covered: (a) ZOOM AND CROP the presenter footage to fill the frame width (cropping top/bottom is fine — head and shoulders visible is enough), or (b) place the presenter over a full-frame background that covers the entire canvas — a blurred, enlarged copy of the presenter footage, a b-roll clip, or a branded color backdrop. Black or empty side panels are NEVER acceptable.

`;

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

${orientationBlock}=====================================
AVATAR + B-ROLL — INTERCUTTING FORMAT (NON-NEGOTIABLE)
=====================================
This video uses the talking-head + b-roll intercut format — like a TV news segment or documentary.
- PRESENTER ON CAMERA: When the presenter appears, show the avatar FULL SCREEN, filling the entire 16:9 canvas edge-to-edge — NO PiP, no corner bubble, no circular crop. The avatar face MUST move and lip-sync to the narration (animated talking photo — never a static image).
- B-ROLL CUTAWAYS ARE MANDATORY: Every time the script mentions a property feature, neighborhood detail, market statistic, or lifestyle benefit, CUT AWAY from the presenter to relevant b-roll footage. Do NOT keep the presenter on screen for the full video — intercut with b-roll throughout.
- After each b-roll clip, CUT BACK to the full-screen presenter to continue narration.
- Target roughly 40–60% presenter / 40–60% b-roll split across the video — the presenter should NOT dominate every scene.
- NEVER use a static image for the presenter — the avatar must always be the animated, talking version when on screen.

=====================================
FAIR HOUSING + NAR COMPLIANCE (MANDATORY — ZERO TOLERANCE, OVERRIDES ALL OTHER INSTRUCTIONS)
=====================================
This video MUST comply with the U.S. Fair Housing Act and the National Association of REALTORS® (NAR) Code of Ethics. These rules override every other creative instruction in this prompt.
- NEVER express or imply any preference, limitation, or discrimination based on a protected class: race, color, religion, sex, gender identity, sexual orientation, disability/handicap, familial status (presence or absence of children), or national origin.
- Do NOT target or exclude any group, verbally or visually. Avoid phrases such as "perfect for a young family," "great for singles," "ideal for retirees," "safe neighborhood," "exclusive community," "family-friendly," or any wording that steers viewers toward or away from an area.
- Do NOT reference crime rates, racial/ethnic/religious makeup of an area, religious institutions, or school quality as selling points — these are steering and Fair Housing violations.
- B-roll showing people must depict a DIVERSE and INCLUSIVE range of individuals. Never visually signal that a property or neighborhood is meant for one particular demographic.
- Keep all claims TRUTHFUL and not misleading (NAR Article 12). Do not exaggerate property features, pricing, or market conditions, and do not fabricate statistics.
- If any wording in the narration script below appears to conflict with these rules, still render the script as written by the user, but do NOT add any non-compliant visuals, captions, overlays, or embellishments of your own.

=====================================
SCENE 1 — TITLE CARD (OPENING FRAME / THUMBNAIL)
=====================================
The very first scene of the video MUST be a designed title card. This is mandatory — do not skip it or replace it with plain b-roll.

Title card layout:
• PRESENTER: Full-screen talking presenter filling the entire 16:9 canvas — the avatar IS the thumbnail image, no separate background photo
• MANDATORY TEXT OVERLAY — render a full-width dark semi-transparent bar across the very bottom 20% of the frame (lower-third). Inside that bar display this EXACT text in large bold white letters: ${params.hookText ? `"${params.hookText}"` : '"Your Local Real Estate Expert"'}. This overlay MUST appear and stay visible for the entire duration of Scene 1. Do NOT omit it. Do NOT change the wording. Style it as a bold social-media stop-scrolling hook — oversized font, high contrast, impossible to miss.
• NO OTHER TEXT on this title card
• The narrator STARTS SPEAKING the script immediately as this title card appears — do NOT hold the title card in silence before the narration begins

This first-scene title card also serves as the video's thumbnail image — make it bold and scroll-stopping.

=====================================
FINAL SCENE — CTA CONTACT CARD
=====================================
The last scene must be a dedicated contact card. Layout:
${params.logoUrl ? `• LOGO: Display the agent/brokerage logo image (it is attached as a file) prominently — top-left corner or top-center of the frame` : ""}
• CONTACT TEXT (on screen only — do NOT narrate): ${contactLine}
• Phone numbers must be displayed exactly as provided — no leading "1", no country code
• Bold CTA headline on screen: "${ctaText}"
• Presenter visible full-screen or alongside the contact card elements
• FILL THE WHOLE FRAME: the contact card scene must cover the entire canvas edge-to-edge. If the presenter footage does not span the full frame, put a full-frame background behind it (blurred enlarged presenter footage, b-roll, or a branded color backdrop) — NEVER black side bars

=====================================
PRODUCTION CONSTRAINTS (REQUIRED FOR FAST RENDER)
=====================================
- Maximum ${params.isLongForm ? "40 scenes total — vary visuals every 20–30 seconds to hold attention across the full runtime" : "10 scenes — but the video must run as long as it takes to speak EVERY word of the narration script below, start to finish"}
- CRITICAL DURATION RULE: the spoken voiceover must include 100% of the narration script, word for word, from the first word to the last. Do NOT summarize, paraphrase, shorten, trim, speed-read, or cut the script to fit a shorter runtime. The video ends only after the FINAL word of the script has been spoken at a natural, unhurried pace (~145 words per minute). A video that ends before the script is fully spoken is WRONG.
- Do NOT add padding, filler, or silent gaps — but never sacrifice any script words to keep it short.
- Do NOT add intro music, countdown, or a separate silent title scene before the narration
- The narration begins IMMEDIATELY on the first frame — the SCENE 1 title card above is the opening of scene 1, NOT a silent intro held before speaking
- The FINAL SCENE contact card above must be the last scene rendered, after the narration ends

=====================================
AGENT + MARKET DETAILS
=====================================
- Agent: ${params.agentName || "Local Real Estate Agent"}${params.brokerage ? `\n- Brokerage: ${params.brokerage}` : ""}
- Market: ${locationOr}
- Audience: ${params.audience || "Mixed"}
- Brand Style: ${params.tone || "Modern"}${params.phone1 ? `\n- Mobile (DISPLAY ONLY — appears on-screen, NEVER spoken): ${params.phone1}` : ""}${params.phone2 ? `\n- Office (DISPLAY ONLY — appears on-screen, NEVER spoken): ${params.phone2}` : ""}${params.website ? `\n- Website (DISPLAY ONLY — appears on-screen, NEVER spoken as a URL): ${params.website}` : ""}

=====================================
NARRATION SCRIPT (DELIVER WORD-FOR-WORD — SPEAK THIS EXACTLY ONCE)
=====================================
Speak EVERY WORD of the script below, start to finish, exactly once — do not stop early, do not summarize, do not skip sentences. The voiceover is complete ONLY when the last word below has been spoken. Do NOT repeat the opening line. Do NOT speak any headline, title card, on-screen overlay, or thumbnail text — those are visual only. The first words of the voiceover are the first words of this script:

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
SCENE-BY-SCENE VISUAL SYNC (CRITICAL — READ CAREFULLY)
=====================================
Every b-roll clip MUST visually match exactly what is being spoken at that moment in the script. This is the single most important visual rule — generic or unrelated footage is not acceptable.
- When the script mentions a specific room (kitchen, bedroom, backyard, living room), show footage of THAT room
- When the script mentions the neighborhood, street, or area, show THAT neighborhood or street type
- When the script mentions a market statistic or price, immediately show a data overlay for that EXACT number
- When the script mentions a lifestyle benefit (walkability, schools, parks, commute), show that benefit visually at that moment
- When the script mentions the property address, show the exterior or curb of a matching home style
- If listing photos are attached, match each photo to the sentence in the script that describes what is shown in that photo
- Cut to a new b-roll clip every time the script topic changes — do NOT hold one clip while multiple unrelated topics are discussed
- NEVER show footage of Topic B while the narrator is speaking about Topic A

=====================================
PRONUNCIATION RULES (CRITICAL FOR VOICEOVER)
=====================================
- The script above has already been normalized for speech. Read every word as written.
- ALWAYS pronounce street-suffix words in full — never spell letters: "Lane" (not "L-N"), "Street" (not "S-T"), "Road", "Avenue", "Boulevard", "Drive", "Court", "Circle", "Place", "Parkway", "Highway", "Terrace", "Trail", "Point", "Square", "Apartment", "Suite", "Building".
- Pronounce directional words in full: "North", "South", "East", "West", "Northeast", "Northwest", "Southeast", "Southwest" — never as single letters.
- CONTACT INFO IS NEVER SPOKEN. Phone numbers, email addresses, and website URLs must NEVER be read aloud under any circumstances — they are DISPLAY ONLY and belong exclusively in the on-screen contact overlay (final-scene contact card). If any phone number, email, or URL somehow appears in the narration script, OMIT it from the voiceover and show it on screen instead.
- Do NOT add any contact information to the narration that is not in the script. The spoken close directs viewers to the description and the on-screen card — that is intentional.

${buildLocationSeasonGuidance(params.state, params.city)}=====================================
B-ROLL — LOCATION-LOCKED TO ${locationOr.toUpperCase()}
=====================================${listingPhotoBlock}

GEOGRAPHIC RULES FOR ALL B-ROLL (NO EXCEPTIONS):
Every single b-roll clip must be believable for ${locationOr}. Use ONLY footage that could realistically exist there:
- Architecture: match the home styles, street layouts, and building materials typical of ${locationOr}
- Vegetation: ONLY trees, plants, and landscaping that actually grow in ${locationOr} during the current month
- ABSOLUTELY PROHIBITED unless ${locationOr} genuinely has them: palm trees, tropical plants, desert cacti, snow-capped mountains, ocean beaches, glacier scenery, redwood forests, farm fields
- If unsure whether a visual element belongs in ${locationOr}, use a safe interior or neighborhood shot instead — do NOT guess
- Generic residential neighborhoods, local-style streets, and home interiors are always safe choices

${hasPhotos ? "SECONDARY / FILLER B-ROLL (only between listing photos):" : "B-ROLL CONTENT:"}
- Aerial / establishing shots of ${locationOr}-style neighborhoods matching the local architecture
- Residential streets and curb-appeal exteriors that genuinely belong in ${locationOr}${audienceVisual ? `\n- Audience-specific visuals (${params.audience}): ${audienceVisual}` : ""}
- Interior shots: kitchens, living spaces, open floor plans
- Lifestyle: cafes, parks, people — scenes appropriate for ${locationOr}${params.keywords.length > 0 ? `\n- Visual emphasis: ${params.keywords.slice(0, 5).join(", ")}` : ""}

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
- Position ALL charts and data graphics in the LOWER THIRD band (bottom 20% of frame) only — never overlapping the presenter's face in the center or upper portion of the frame

=====================================
TEXT OVERLAYS
=====================================
${params.burnCaptions ? `- SPOKEN-WORD CAPTIONS (REQUIRED): Burn synchronized captions of the narration throughout the ENTIRE video — every spoken sentence appears as on-screen text in sync with the voiceover. Style: 4–6 words at a time, bold white text on a semi-transparent dark backing, social-media caption style. Position captions INSIDE the lower-third band. On Scene 1, captions must sit ABOVE the title-card hook bar (never overlapping it); on the final scene, captions sit above the contact card. Captions must never cover the presenter's face or any other overlay.
` : ""}- Highlight key stats and insights as they are mentioned in the script
- Background: semi-transparent dark gray
- Text: white or soft gold
- Accent lines/icons: gold or navy
- Bold, minimal, readable — no clutter
- CRITICAL POSITIONING — TEXT MUST NEVER COVER THE PRESENTER'S FACE:
  • The avatar is FULL SCREEN. The presenter's face occupies the upper-center portion of the frame.
  • Place ALL text overlays, captions, stats, and data visualizations in the LOWER THIRD of the frame — the bottom 20% strip (approximately the bottom 216 pixels of a 1080p frame). This is the broadcast-standard lower-third zone.
  • NEVER place any text, caption, stat, chart, or graphic in the upper 80% of the frame while the presenter is visible — overlays in that zone will land directly on the presenter's face.
  • Lower-third style: a semi-transparent dark bar spanning the full width near the bottom of the frame, with white or gold text inside.
  • When in doubt, keep all text at the very BOTTOM of the frame.

Deliver a polished, scroll-stopping video that positions the agent as the trusted local expert and converts viewers into leads.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script, cta, lookId, hook: requestHook, musicUrl, pdfUrl, pdfText, extraPhotoUrls, engine, longForm, captions = true } = await req.json();
  // Long-form (8–10 min) is landscape-only and Pro-plan-only; costs more credits.
  const isLongForm = longForm === true && videoType !== "reel_9x16" && videoType !== "short_1x1";
  // Opt-in experimental render path: engine "direct" routes to HeyGen's v3
  // Direct Video API (single talking-head) instead of the default Video Agent,
  // so its output can be compared. Any other value keeps existing behavior.
  const useDirectVideo = engine === "direct";
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
  const maxScriptWords = isLongForm ? MAX_LONG_FORM_SCRIPT_WORDS : MAX_SCRIPT_WORDS;
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
  console.log(`[create-blog] script sent: ${scriptWordCount} words (~${Math.round(scriptWordCount / 145 * 60)}s at 145wpm), videoType=${videoType}`);

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, heygen_digital_twin_look_id, avatar_url, logo_url, full_name, company_name, phone, company_phone, location_city, location_state, website, voice_clone_id, credits_remaining, role, subscription_tier")
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

  // Long-form is included in Pro's monthly credits; every other plan can use it
  // pay-as-you-go — any user with enough credits (e.g. the 6-credit Long-Form
  // pack) may render one. The only gate is the credit balance below.
  const creditCost = isLongForm ? LONG_FORM_CREDIT_COST : 1;

  if (!isAdmin && profile.credits_remaining < creditCost) {
    return NextResponse.json(
      {
        error: isLongForm
          ? `Long-form AI videos use ${LONG_FORM_CREDIT_COST} credits and you have ${profile.credits_remaining}. Upgrade to Pro (12 credits/month) or buy the 6-credit Long-Form pack in Billing — or record long-form free with the teleprompter.`
          : "No videos remaining this month. Please upgrade your plan.",
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

    // HeyGen's Video Agent caps the prompt at 10,000 characters. The
    // structural sections in buildVideoAgentPrompt() are ordered so every
    // must-have instruction (orientation, avatar, fair housing, title card,
    // CTA/logo, scene cap, agent details, narration script) appears BEFORE
    // the elaboration/refinement sections (scene sync detail, pronunciation,
    // b-roll geography, color, data viz, text overlay positioning). If the
    // hard clamp below ever fires, it only ever truncates that trailing
    // elaboration content — never the title card or CTA contact card.
    const HEYGEN_PROMPT_LIMIT = 8500;
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
      isLongForm,
      burnCaptions: captions !== false,
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

    // avatarId is only set when the client explicitly selected a look (Avatar + Voice mode).
    // Voice Only mode sends no lookId, so no avatar is placed on screen.
    const avatarId: string | undefined = lookId || undefined;

    // ── Direct Video path (opt-in via engine="direct") ──────────────────────────
    // Experimental: HeyGen v3 Direct Video — a single talking-head from the
    // avatar look + a HeyGen voice + the full script. No photo/b-roll
    // composition (that's the Video Agent's job); used to compare raw avatar
    // output. Polled single-step via getVideoV3Status (render_provider tag).
    if (useDirectVideo) {
      if (!avatarId) throw new Error("Select an avatar look before generating a Direct Video.");
      console.log(`[create-blog] Direct Video path (engine=direct) — avatar ${avatarId}`);

      // Direct Video needs a HeyGen voice_id (not the ElevenLabs voice_clone_id).
      let directVoiceId = profile.heygen_voice_id;
      if (!directVoiceId) {
        const privateVoiceId = await getPrivateVoiceId().catch(() => null);
        if (privateVoiceId) {
          directVoiceId = privateVoiceId;
          void admin.from("profiles").update({ heygen_voice_id: privateVoiceId }).eq("id", user.id);
        }
      }
      directVoiceId = directVoiceId || await getDefaultEnglishVoiceId().catch(() => null);
      if (!directVoiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

      const { data: videoRow, error: videoRowErr } = await admin
        .from("generated_videos")
        .insert({
          project_id: projectId,
          user_id: user.id,
          video_type: videoType,
          render_provider: "heygen_v3_direct",
          render_status: "rendering",
          metadata: { dimension, orientation, city, state, title },
        })
        .select()
        .single();

      if (videoRowErr || !videoRow) {
        throw new Error(`Failed to create video record: ${videoRowErr?.message ?? "unknown"}`);
      }

      // Digital Twin looks render on Avatar V — highest-fidelity motion/lip-sync,
      // same per-second price as the default engine and slightly faster in testing.
      // Photo-avatar looks stay on HeyGen's default engine (avatar_iv).
      const isDigitalTwin = avatarId === profile.heygen_digital_twin_look_id;

      const directVideoId = await generateVideoV3({
        avatarId,
        voiceId: directVoiceId,
        scriptText: safeScript,
        dimension,
        title,
        callbackUrl,
        callbackId: videoRow.id,
        ...(isDigitalTwin && { engine: "avatar_v" as const }),
      });

      await admin
        .from("generated_videos")
        // credit_cost enables an automatic refund if the render later fails
        .update({ render_job_id: directVideoId, metadata: { ...(videoRow.metadata ?? {}), credit_cost: creditCost } })
        .eq("id", videoRow.id);

      await admin.from("profiles").update({ credits_remaining: profile.credits_remaining - creditCost }).eq("id", user.id);
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
    // Attach listing photos + user-uploaded photos, capped at 5 total.
    // Fewer files = faster Video Agent processing time.
    const combinedPhotos = [...listingPhotos, ...safeExtraPhotos].slice(0, 5);
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
      // credit_cost enables an automatic refund if the render later fails
      .update({ render_job_id: sessionId, metadata: { ...(videoRow?.metadata ?? {}), credit_cost: creditCost } })
      .eq("id", videoRow?.id);

    await admin.from("profiles").update({ credits_remaining: profile.credits_remaining - creditCost }).eq("id", user.id);
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
