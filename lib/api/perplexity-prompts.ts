// ============================================================
// Perplexity Sonar API — Real Estate Video Script Prompts
// Presets: Market Update | Why Live Here | Community Events
// + fully custom topic support for any location-based content
// All prompts include Fair Housing compliance guardrail.
// ============================================================

import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { sanitizeNarration } from "@/lib/utils/sanitize-narration";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// Shared rule appended to every script prompt: the script sections are spoken
// aloud by an avatar, so they must contain nothing a voice can't say. (The
// render pipeline also sanitizes, but clean generation means what the user
// sees in the editor is what gets spoken.)
const NARRATION_STYLE_RULE = `
NARRATION STYLE (applies to HOOK, all content sections, KEY TAKEAWAY, and CALL TO ACTION):
- These sections are read aloud word-for-word by a video narrator. Write them as natural spoken language.
- Plain text ONLY: no markdown (**, #, backticks), no emoji, no citation markers like [2] — list sources only under SOURCES USED.
- Every line must be a complete conversational sentence a person would actually say out loud.`;

export type LocationVideoType =
  | "market_update"
  | "why_live_here"
  | "community_events"
  | "custom";

export interface LocationParams {
  city: string;
  state: string;
  zip?: string;
  month?: string;
  year?: number;
  customTopic?: string;
  audience?: string;      // e.g. "Buyers", "Sellers", "Investors", "First-Time Buyers", "Luxury", "Mixed"
  tone?: string;          // e.g. "Friendly", "Modern", "Luxury", "High-Energy", "Educational"
  ctaPreference?: string; // e.g. "call", "text", "website", "consultation"
}

// ─── Shared API call wrapper ──────────────────────────────────────────────────

async function callPerplexity(requestBody: Record<string, unknown>): Promise<string> {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY is not configured.");
  }

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown");
    console.error(`Perplexity ${response.status}:`, err);
    throw new Error(`Perplexity ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Perplexity returned empty content");
  return content as string;
}

// ─── VIDEO TYPE 1: Market Update Report ──────────────────────────────────────

function buildMarketUpdateRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip, month, year } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;
  const monthYear = `${month} ${year}`;

  const monthIndex = new Date(`${month} 1, ${year}`).getMonth() + 1;
  const afterDate = `${String(monthIndex).padStart(2, "0")}/01/${year}`;

  return {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content: `You are a real estate market analyst and content writer. You have live web search — use it aggressively to find current, specific data.

YOUR JOB: Search the web RIGHT NOW for current real estate market data for the specific city/area requested, then write a video script using that real data.

SEARCH STRATEGY:
1. Search "[city] [state] real estate market [month] [year]"
2. Search "[city] median home price [year]"
3. Search "redfin [city] [state] housing market" or "zillow [city] [state] market"
4. Use whatever sources have the data — Zillow, Redfin, Realtor.com, local MLS, news articles, city-specific reports

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One punchy sentence that would stop someone scrolling — include a REAL specific stat you found]

MARKET STATS:
[4-6 lines, one stat per line. Each line must be a complete spoken sentence, e.g. "The median home price is now around $450,000, up 5% from last year." Cover: median price, days on market, inventory, list-to-sale ratio, and current mortgage rates — skip any you can't find.]

MARKET NARRATIVE: [2-3 sentences using the REAL data you found, explaining what it means for buyers and sellers in ${location} right now. Be specific — use actual numbers.]

CALL TO ACTION: [One sentence prompting viewers to act]

VIDEO TITLE OPTIONS:
1. [Option 1 — include a real data point]
2. [Option 2 — curiosity/question format]
3. [Option 3 — trend/news format]

BLOG POST INTRO: [2-3 sentences expanding on the hook with real data]

SOURCES USED: [List every URL or domain you pulled data from]

CRITICAL RULES:
- You MUST search the web before writing — do not rely on training data for current prices
- Use real numbers you find — approximate is fine ("around $X" or "roughly X days")
- If you truly cannot find a specific stat after searching, skip that line entirely (do NOT write "data not available")
- Never make up numbers — but always find SOMETHING real to report
- Keep language conversational, like you're talking to a neighbor
${NARRATION_STYLE_RULE}

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Search the web and generate a real estate market update video script for ${location} for ${monthYear}.

Search for: current median home price in ${location}, days on market, active listings, and recent market trends. Use Zillow, Redfin, Realtor.com, local news, or any source that has current data for ${city}, ${state}. The more specific and current the data, the better.`,
      },
    ],
    search_recency_filter: "month",
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.2,
    max_tokens: 1200,
  };
}

// ─── VIDEO TYPE 2: Why Live Here ─────────────────────────────────────────────

function buildWhyLiveHereRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;

  return {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content: `You are a real estate lifestyle writer creating content for a short social video script about why someone should consider living in a specific city or neighborhood.

Your job is to research the lifestyle, quality of life, demographics, and community characteristics of the location and return it in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One compelling sentence about what makes this place special or surprising — something most people wouldn't know]

TOP 5 REASONS TO LIVE HERE:
1. [Each reason written as 1-2 complete conversational sentences with a specific supporting detail — school ratings, commute times, income data, etc.]
2. [Reason as spoken sentences]
3. [Reason as spoken sentences]
4. [Reason as spoken sentences]
5. [Reason as spoken sentences]

QUICK STATS:
[3-5 lines, each a complete spoken sentence, e.g. "The median household income here is about $95,000, well above the national average." Cover income, population, school ratings, commute, and cost of living — skip any you can't find.]

WHO THIS PLACE IS PERFECT FOR: [1-2 sentences describing the ideal resident — families, young professionals, retirees, etc.]

VIDEO TITLE OPTIONS:
1. [Option 1 — lifestyle focused]
2. [Option 2 — comparison or ranking angle]
3. [Option 3 — "hidden gem" or discovery angle]

BLOG POST INTRO: [2-3 sentences that could open a blog post about moving to this area]

SOURCES USED: [List the domains you pulled data from]

Rules:
- Search the web for current data — use any reliable source (Niche, GreatSchools, Census, local news, city websites)
- Be specific — use actual numbers, ratings, and rankings that you find
- Keep tone warm, inviting, and honest — not promotional fluff
- If you can't find a specific metric, skip that line entirely — do not write "data not available"
${NARRATION_STYLE_RULE}

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Search the web and create a "Why Live in ${location}" video script.

Search for: "${city} ${state} school district name", "${city} ${state} school district rating GreatSchools", "${city} ${state} median income", "${city} ${state} cost of living", "${city} ${state} crime rate", "${city} ${state} things to do", walkability score for ${city}${zip ? ` ${zip}` : ""}. Use Niche.com, GreatSchools, Census data, or any current source that has real numbers for ${city}, ${state}. When reporting school data, name the exact school district that serves ${city}${zip ? ` zip ${zip}` : ""} — do not use a neighboring district's data.`,
      },
    ],
    search_recency_filter: "month",
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.3,
    max_tokens: 1200,
  };
}

// ─── VIDEO TYPE 3: Community Events ──────────────────────────────────────────

function buildCommunityEventsRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip, month, year } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;
  const monthYear = `${month} ${year}`;

  const monthIndex = new Date(`${month} 1, ${year}`).getMonth() + 1;
  const afterDate = `${String(monthIndex).padStart(2, "0")}/01/${year}`;
  const nextMonthIndex = monthIndex === 12 ? 1 : monthIndex + 1;
  const nextMonthYear = monthIndex === 12 ? Number(year) + 1 : year;
  const beforeDate = `${String(nextMonthIndex).padStart(2, "0")}/01/${nextMonthYear}`;

  return {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content: `You are a local community content writer creating a short social video script about upcoming events in a specific city or neighborhood.

Your job is to find real upcoming local events for the specified month and location and return them in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One energetic sentence that captures the excitement of things happening in this community this month]

TOP EVENTS THIS MONTH:
1. [Each event as 1-2 complete spoken sentences naming the event, date, and venue, e.g. "On Saturday the 14th, the Riverside Farmers Market returns to Main Street Plaza with over forty local vendors." Do NOT use pipes, tables, or fragments.]
2. [Event as spoken sentences]
3. [Event as spoken sentences]
4. [Event as spoken sentences]
5. [Event as spoken sentences]

[Include up to 8 events if available. Prioritize family-friendly and community events over large commercial concerts. Mix Eventbrite/Ticketmaster/Meetup sources so content feels varied.]

COMMUNITY VIBE: [1-2 sentences capturing what this month's events say about the community — active, family-oriented, arts-focused, outdoorsy, etc.]

RECURRING HIGHLIGHTS: [Any weekly/regular events worth mentioning — farmers markets, free concerts, recurring meetups, etc.]

VIDEO TITLE OPTIONS:
1. [Option 1 — month + city specific]
2. [Option 2 — "don't miss" angle]
3. [Option 3 — community character angle]

BLOG POST INTRO: [2-3 sentences introducing a blog post about events in this area this month]

SOURCES USED: [List which platforms each event came from]

Rules:
- Search specifically for "${city}, ${state}" — do not return events from other cities in the state
- Only include events with confirmed specific dates in the target month
- If fewer than 3 confirmed events are found, honestly state that rather than padding with uncertain entries
- List event URLs only under SOURCES USED — never inside the event descriptions (URLs cannot be spoken)
${NARRATION_STYLE_RULE}

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Find local community events happening in ${location} during ${monthYear}.

Search Eventbrite, Ticketmaster, and Meetup specifically for events listed in ${city}, ${state}. Focus on family-friendly events, festivals, farmers markets, outdoor activities, community gatherings, arts events, and local meetups. Include specific dates, venue names, and a brief description for each event.`,
      },
    ],
    search_after_date_filter: afterDate,
    search_before_date_filter: beforeDate,
    search_recency_filter: "month",
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.4,
    max_tokens: 1400,
  };
}

// ─── VIDEO TYPE 4: Custom Topic ──────────────────────────────────────────────

function buildCustomRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip, customTopic } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;

  if (!customTopic) throw new Error("customTopic is required for custom video type");

  return {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content: `You are a real estate content writer creating a short social video script about a specific topic for a specific location.

Your job is to research the topic thoroughly for the given location and return it in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One compelling opening sentence that would stop someone scrolling — make it specific and surprising]

MAIN CONTENT:
[Write this as flowing spoken narration — the exact words a video presenter will say aloud, in short conversational paragraphs that transition naturally from one point to the next. Cover 3-5 key points about the topic with specific data, stats, or facts where available. Aim for 250-320 words total (about two minutes of speech). NO bullet points, NO numbered lists, NO headers — narration prose only.]

KEY TAKEAWAY: [One sentence summarizing the most important insight]

CALL TO ACTION: [One sentence prompting viewers to take a next step — contact an agent, visit a site, share the video, etc.]

VIDEO TITLE OPTIONS:
1. [Option 1 — direct and informative]
2. [Option 2 — curiosity or question format]
3. [Option 3 — "did you know" or discovery angle]

BLOG POST INTRO: [2-3 sentences that could open a blog post about this topic in this area]

SOURCES USED: [List the domains you pulled data from]

Rules:
- Focus exclusively on ${location} — do not generalize or pull from other cities
- Search the web for real, current data — skip any metric you can't find rather than writing "data not available"
- Keep language conversational and direct — write for home buyers, sellers, and residents
- Aim for content that's genuinely useful, not just promotional
${NARRATION_STYLE_RULE}

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Create a short social video script about "${customTopic}" for ${location}. Research this topic thoroughly and provide specific, factual content that would be valuable to real estate agents, buyers, and sellers in this area.`,
      },
    ],
    search_recency_filter: "month",
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.3,
    // Headroom for ~320 words of narration plus titles, blog intro, and sources.
    max_tokens: 1400,
  };
}

// ─── Master builder ───────────────────────────────────────────────────────────

export function buildRequest(videoType: LocationVideoType, params: LocationParams): Record<string, unknown> {
  switch (videoType) {
    case "market_update":    return buildMarketUpdateRequest(params);
    case "why_live_here":    return buildWhyLiveHereRequest(params);
    case "community_events": return buildCommunityEventsRequest(params);
    case "custom":           return buildCustomRequest(params);
    default:
      throw new Error(`Unknown video type: ${videoType}`);
  }
}

const AUDIENCE_SCRIPT_GUIDANCE: Record<string, string> = {
  "Buyers": "Focus on timing, market opportunities, competition dynamics, and smart buying strategy. Speak to people ready to make a move.",
  "Sellers": "Emphasize pricing power, buyer demand, and how to maximize home value. Speak to homeowners thinking about selling.",
  "Investors": "Highlight ROI potential, appreciation trends, rental demand, and cash flow opportunities. Use numbers and data.",
  "First-Time Buyers": "Reduce fear, simplify the process, and build confidence. Avoid jargon. Be encouraging and supportive.",
  "Luxury": "Use elevated, polished language. Focus on exclusivity, lifestyle, and premium positioning. Avoid anything that sounds generic.",
  "Mixed": "Speak broadly — address both buyers and sellers. Balance opportunity messaging for both sides of the market.",
};

const TONE_SCRIPT_GUIDANCE: Record<string, string> = {
  "Friendly": "Conversational, warm, approachable. Write like you're talking to a neighbor. Use short sentences.",
  "Modern": "Clean, direct, professional. Crisp language, no filler words, confident delivery.",
  "Luxury": "Polished and elevated. Use premium vocabulary. Avoid casual phrases. Project authority and taste.",
  "High-Energy": "Punchy, urgent, action-oriented. Short bursts. Exclamation points where appropriate. Build momentum.",
  "Educational": "Helpful, informative, authoritative. Explain things clearly. Position the agent as a knowledgeable guide.",
};

export async function generateLocationScript(
  videoType: LocationVideoType,
  params: LocationParams,
  agentName?: string
): Promise<string> {
  const requestBody = buildRequest(videoType, params);
  const messages = requestBody.messages as { role: string; content: string }[];
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    const nameClause = agentName
      ? `Agent name: "${agentName}". The CALL TO ACTION must use "${agentName}" by name — e.g. "Contact ${agentName} today". Never use generic phrases like "contact a local agent".`
      : `The CALL TO ACTION must be specific and action-oriented. Never use generic phrases like "contact a local agent".`;

    const audienceGuidance = params.audience && AUDIENCE_SCRIPT_GUIDANCE[params.audience]
      ? `\nTarget Audience: ${params.audience}. ${AUDIENCE_SCRIPT_GUIDANCE[params.audience]}`
      : "";
    const toneGuidance = params.tone && TONE_SCRIPT_GUIDANCE[params.tone]
      ? `\nBrand Tone: ${params.tone}. ${TONE_SCRIPT_GUIDANCE[params.tone]}`
      : "";

    systemMsg.content += `\n\n${nameClause}${audienceGuidance}${toneGuidance}\n\nCRITICAL: Do NOT include any phone numbers in the narration script. Phone numbers appear only as a text overlay at the end of the video — never spoken aloud.`;
  }
  return callPerplexity(requestBody);
}

// ─── Output parser ────────────────────────────────────────────────────────────
// Converts Perplexity's structured text output into the ai_script JSON shape
// used by the project editor (same shape as voice-based script generation).

export interface ParsedLocationScript {
  title: string;
  hook: string;
  hooks: string[];        // VIDEO TITLE OPTIONS become hooks/title variants
  script: string;         // Main body (stats + narrative / reasons / events)
  cta: string;
  description: string;
  hashtags: string[];
  keywords: string[];
  blog_intro: string;
  blog_body: string;
  blog_conclusion: string;
  sources: string[];
  raw: string;            // Full raw output preserved for reference
  video_type: LocationVideoType;
  location: string;
}

function extractSection(text: string, heading: string, nextHeadings: string[]): string {
  const headingRegex = new RegExp(`${heading}:?\\s*`, "i");
  const start = text.search(headingRegex);
  if (start === -1) return "";

  // Find the end — next known heading
  let end = text.length;
  for (const next of nextHeadings) {
    const nextRegex = new RegExp(`${next}:?\\s*`, "i");
    const pos = text.search(nextRegex);
    if (pos > start && pos < end) end = pos;
  }

  return text.slice(start, end)
    .replace(headingRegex, "")
    .trim();
}

export function parseLocationScript(
  raw: string,
  videoType: LocationVideoType,
  city: string,
  state: string,
  agentName?: string
): ParsedLocationScript {
  // All section headings across all four video types
  const allHeadings = [
    "HOOK", "MARKET STATS", "MARKET NARRATIVE", "CALL TO ACTION",
    "VIDEO TITLE OPTIONS", "BLOG POST INTRO", "SOURCES USED",
    "TOP 5 REASONS TO LIVE HERE", "QUICK STATS", "WHO THIS PLACE IS PERFECT FOR",
    "TOP EVENTS THIS MONTH", "COMMUNITY VIBE", "RECURRING HIGHLIGHTS",
    "MAIN CONTENT", "KEY TAKEAWAY",
  ];

  const hook = extractSection(raw, "HOOK", allHeadings.filter((h) => h !== "HOOK"));

  // Script body: main content varies by type.
  // The narration script must be plain speakable prose — markdown, bullets,
  // emoji, and section labels make the Video Agent paraphrase instead of
  // delivering it word-for-word. The decorated version (labels + emoji) is
  // kept separately for the blog post only.
  let narrationSections: string[] = [];
  let blogBody = "";
  if (videoType === "market_update") {
    const stats = extractSection(raw, "MARKET STATS", allHeadings);
    const narrative = extractSection(raw, "MARKET NARRATIVE", allHeadings);
    narrationSections = [stats, narrative];
    blogBody = [stats && `📊 Market Stats:\n${stats}`, narrative && `📝 What This Means:\n${narrative}`]
      .filter(Boolean).join("\n\n");
  } else if (videoType === "why_live_here") {
    const reasons = extractSection(raw, "TOP 5 REASONS TO LIVE HERE", allHeadings);
    const stats = extractSection(raw, "QUICK STATS", allHeadings);
    const perfect = extractSection(raw, "WHO THIS PLACE IS PERFECT FOR", allHeadings);
    narrationSections = [reasons, stats, perfect];
    blogBody = [
      reasons && `🏡 Top 5 Reasons:\n${reasons}`,
      stats && `📊 Quick Stats:\n${stats}`,
      perfect && `👥 Perfect For:\n${perfect}`,
    ].filter(Boolean).join("\n\n");
  } else if (videoType === "community_events") {
    const events = extractSection(raw, "TOP EVENTS THIS MONTH", allHeadings);
    const vibe = extractSection(raw, "COMMUNITY VIBE", allHeadings);
    const recurring = extractSection(raw, "RECURRING HIGHLIGHTS", allHeadings);
    narrationSections = [events, vibe, recurring];
    blogBody = [
      events && `🎉 Events:\n${events}`,
      vibe && `✨ Community Vibe:\n${vibe}`,
      recurring && `🔄 Recurring Events:\n${recurring}`,
    ].filter(Boolean).join("\n\n");
  } else {
    // custom — generic content + key takeaway
    const content = extractSection(raw, "MAIN CONTENT", allHeadings);
    const takeaway = extractSection(raw, "KEY TAKEAWAY", allHeadings);
    narrationSections = [content, takeaway];
    blogBody = [
      content && `📋 Key Points:\n${content}`,
      takeaway && `💡 Key Takeaway:\n${takeaway}`,
    ].filter(Boolean).join("\n\n");
  }
  const script = sanitizeNarration(narrationSections.filter(Boolean).join("\n\n"));

  const cta = extractSection(raw, "CALL TO ACTION", allHeadings) ||
    (agentName
      ? `Contact ${agentName} today to learn more about ${city}, ${state}!`
      : `Reach out today to learn more about ${city}, ${state}!`);

  const blogIntro = extractSection(raw, "BLOG POST INTRO", allHeadings);
  const sourcesRaw = extractSection(raw, "SOURCES USED", []);

  // Extract VIDEO TITLE OPTIONS (numbered list → array)
  const titlesSection = extractSection(raw, "VIDEO TITLE OPTIONS", allHeadings);
  const titleLines = titlesSection.split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  const defaultTitle: Record<LocationVideoType, string> = {
    market_update: `Market Update: ${city}, ${state}`,
    why_live_here: `Why Live in ${city}, ${state}`,
    community_events: `Events in ${city}, ${state}`,
    custom: `${city}, ${state}`,
  };
  const primaryTitle = titleLines[0] || defaultTitle[videoType];

  // Generate relevant hashtags from type + location
  const baseHashtags: Record<LocationVideoType, string[]> = {
    market_update: ["RealEstateMarket", "HousingMarket", "RealEstateTips", "MarketUpdate", "HomeValues"],
    why_live_here: ["MovingTo", "LiveHere", "Relocation", "BestPlacesToLive", "RealEstate"],
    community_events: ["LocalEvents", "CommunityEvents", "ThingsToDo", "WeekendEvents", "LocalLife"],
    custom: ["RealEstate", "LocalInfo", "RealEstateTips", "HomeBuyers", "Community"],
  };
  const locationHashtags = [
    city.replace(/\s+/g, ""),
    state,
    `${city.replace(/\s+/g, "")}RealEstate`,
    `${city.replace(/\s+/g, "")}Homes`,
  ];
  const hashtags = [...baseHashtags[videoType], ...locationHashtags];

  const keywords = [
    `${city} ${state} real estate`,
    `homes for sale ${city}`,
    `${city} housing market`,
    `real estate agent ${city}`,
    `${city} neighborhood`,
  ];

  const sources = sourcesRaw
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

  return {
    title: primaryTitle,
    hook,
    hooks: titleLines,          // Title options as "hooks" for the editor
    script: script || sanitizeNarration(raw), // Fallback to sanitized raw if parsing fails
    cta,
    description: blogIntro || hook,
    hashtags,
    keywords,
    blog_intro: blogIntro,
    blog_body: blogBody || script,
    blog_conclusion: cta,
    sources,
    raw,
    video_type: videoType,
    location: `${city}, ${state}`,
  };
}
