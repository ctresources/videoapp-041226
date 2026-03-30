// ============================================================
// Perplexity Sonar API — Real Estate Video Script Prompts
// Presets: Market Update | Why Live Here | Community Events
// + fully custom topic support for any location-based content
// All prompts include Fair Housing compliance guardrail.
// ============================================================

import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export type LocationVideoType =
  | "market_update"
  | "why_live_here"
  | "community_events"
  | "custom";

export interface LocationParams {
  city: string;
  state: string;
  zip?: string;
  month?: string;        // Required for market_update + community_events
  year?: number;         // Required for market_update + community_events
  customTopic?: string;  // Required for custom type — any location topic
}

// ─── Shared API call wrapper ──────────────────────────────────────────────────

async function callPerplexity(requestBody: Record<string, unknown>): Promise<string> {
  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content as string;
}

// ─── VIDEO TYPE 1: Market Update Report ──────────────────────────────────────

function buildMarketUpdateRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip, month, year } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;
  const monthYear = `${month} ${year}`;

  const monthIndex = new Date(`${month} 1, ${year}`).getMonth() + 1;
  const afterDate = `${String(monthIndex).padStart(2, "0")}/01/${year}`;

  return {
    model: "sonar",
    messages: [
      {
        role: "system",
        content: `You are a real estate market analyst writing content for a short social video script.

Your job is to gather current, factual real estate market data for a specific location and return it in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure, no extra commentary:

HOOK: [One punchy sentence that would stop someone scrolling — include a surprising or specific stat]

MARKET STATS:
- Median home price: [value + % change vs last month if available]
- Average days on market: [value]
- Active listings / inventory: [value + months of supply if available]
- List-to-sale price ratio: [value if available]
- New listings this month: [value if available]
- Mortgage rate context: [current 30-yr fixed rate if mentioned in sources]

MARKET NARRATIVE: [2-3 sentences summarizing what the data means for buyers and sellers right now in this specific market. Be specific — mention the city by name.]

CALL TO ACTION: [One sentence prompting viewers to contact a local agent or visit a website]

VIDEO TITLE OPTIONS:
1. [Option 1 — data-driven, specific]
2. [Option 2 — curiosity/question format]
3. [Option 3 — trend/news format]

BLOG POST INTRO: [2-3 sentences expanding on the hook, suitable for a blog post introduction]

SOURCES USED: [List the domains you pulled data from]

Rules:
- Use only data from the specified trusted domains
- If a specific stat is not available for that city, say "data not available for this market" — do not fabricate numbers
- Keep language conversational, not academic
- Write as if speaking directly to home buyers and sellers in that area

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Generate a real estate market update video script for ${location} for the month of ${monthYear}.

Include current median home prices, days on market, inventory levels, and what this means for buyers and sellers right now. Pull only from trusted real estate data sources.`,
      },
    ],
    search_domain_filter: [
      "zillow.com", "redfin.com", "nar.realtor", "realtors.com",
      "realtor.com", "housingwire.com", "freddiemac.com",
      "bankrate.com", "mba.org",
    ],
    search_recency_filter: "month",
    search_after_date_filter: afterDate,
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.2,
    max_tokens: 1000,
  };
}

// ─── VIDEO TYPE 2: Why Live Here ─────────────────────────────────────────────

function buildWhyLiveHereRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;

  return {
    model: "sonar",
    messages: [
      {
        role: "system",
        content: `You are a real estate lifestyle writer creating content for a short social video script about why someone should consider living in a specific city or neighborhood.

Your job is to research the lifestyle, quality of life, demographics, and community characteristics of the location and return it in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One compelling sentence about what makes this place special or surprising — something most people wouldn't know]

TOP 5 REASONS TO LIVE HERE:
1. [Reason with specific supporting detail — school ratings, commute times, income data, etc.]
2. [Reason with specific supporting detail]
3. [Reason with specific supporting detail]
4. [Reason with specific supporting detail]
5. [Reason with specific supporting detail]

QUICK STATS:
- Median household income: [value]
- Population: [value]
- School rating: [value out of 10 or letter grade if available]
- Commute to nearest major city: [approximate time and city name]
- Walkability / livability score: [value if available]
- Crime rating: [relative to national average if available]
- Cost of living vs national average: [above/below/at average + %]

WHO THIS PLACE IS PERFECT FOR: [1-2 sentences describing the ideal resident — families, young professionals, retirees, etc.]

VIDEO TITLE OPTIONS:
1. [Option 1 — lifestyle focused]
2. [Option 2 — comparison or ranking angle]
3. [Option 3 — "hidden gem" or discovery angle]

BLOG POST INTRO: [2-3 sentences that could open a blog post about moving to this area]

SOURCES USED: [List the domains you pulled data from]

Rules:
- Use only data from the specified trusted domains
- Be specific — use actual numbers, ratings, and rankings where available
- Keep tone warm, inviting, and honest — not promotional fluff
- If data is unavailable for a specific metric, skip it rather than fabricate

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Create a "Why Live in ${location}" video script. Research the quality of life, schools, community feel, demographics, commute, and what makes this area attractive to home buyers and relocating families.`,
      },
    ],
    search_domain_filter: [
      "niche.com", "greatschools.org", "areavibes.com",
      "neighborhoodscout.com", "bestplaces.net", "walkscore.com",
      "city-data.com", "census.gov", "datausa.io",
    ],
    search_recency_filter: "month",
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.3,
    max_tokens: 1000,
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
    model: "sonar",
    messages: [
      {
        role: "system",
        content: `You are a local community content writer creating a short social video script about upcoming events in a specific city or neighborhood.

Your job is to find real upcoming local events for the specified month and location and return them in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One energetic sentence that captures the excitement of things happening in this community this month]

TOP EVENTS THIS MONTH:
1. EVENT NAME | Date | Location/Venue | Brief description (1 sentence)
2. EVENT NAME | Date | Location/Venue | Brief description (1 sentence)
3. EVENT NAME | Date | Location/Venue | Brief description (1 sentence)
4. EVENT NAME | Date | Location/Venue | Brief description (1 sentence)
5. EVENT NAME | Date | Location/Venue | Brief description (1 sentence)

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
- Include event URLs from the source platform where available

${FAIR_HOUSING_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `Find local community events happening in ${location} during ${monthYear}.

Search Eventbrite, Ticketmaster, and Meetup specifically for events listed in ${city}, ${state}. Focus on family-friendly events, festivals, farmers markets, outdoor activities, community gatherings, arts events, and local meetups. Include specific dates, venue names, and a brief description for each event.`,
      },
    ],
    search_domain_filter: [
      "eventbrite.com", "ticketmaster.com", "meetup.com",
      "allevents.in", "10times.com",
    ],
    search_recency_filter: "month",
    search_after_date_filter: afterDate,
    search_before_date_filter: beforeDate,
    web_search_options: { search_context_size: "high" },
    return_citations: true,
    temperature: 0.4,
    max_tokens: 1200,
  };
}

// ─── VIDEO TYPE 4: Custom Topic ──────────────────────────────────────────────

function buildCustomRequest(params: LocationParams): Record<string, unknown> {
  const { city, state, zip, customTopic } = params;
  const location = `${city}, ${state}${zip ? ` (zip ${zip})` : ""}`;

  if (!customTopic) throw new Error("customTopic is required for custom video type");

  return {
    model: "sonar",
    messages: [
      {
        role: "system",
        content: `You are a real estate content writer creating a short social video script about a specific topic for a specific location.

Your job is to research the topic thoroughly for the given location and return it in a structured format ready for video production.

REQUIRED OUTPUT FORMAT — return exactly this structure:

HOOK: [One compelling opening sentence that would stop someone scrolling — make it specific and surprising]

MAIN CONTENT:
[3-5 key points or sections about the topic. Use bullet points, numbered lists, or short paragraphs as appropriate. Include specific data, stats, or facts where available. Be concise — each point should be 1-2 sentences max.]

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
- Use real, verifiable data where available — say "data not available" rather than guess
- Keep language conversational and direct — write for home buyers, sellers, and residents
- Aim for content that's genuinely useful, not just promotional

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
    max_tokens: 1000,
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

export async function generateLocationScript(
  videoType: LocationVideoType,
  params: LocationParams
): Promise<string> {
  const requestBody = buildRequest(videoType, params);
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
  state: string
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

  // Script body: main content varies by type
  let script = "";
  if (videoType === "market_update") {
    const stats = extractSection(raw, "MARKET STATS", allHeadings);
    const narrative = extractSection(raw, "MARKET NARRATIVE", allHeadings);
    script = [stats && `📊 Market Stats:\n${stats}`, narrative && `📝 What This Means:\n${narrative}`]
      .filter(Boolean).join("\n\n");
  } else if (videoType === "why_live_here") {
    const reasons = extractSection(raw, "TOP 5 REASONS TO LIVE HERE", allHeadings);
    const stats = extractSection(raw, "QUICK STATS", allHeadings);
    const perfect = extractSection(raw, "WHO THIS PLACE IS PERFECT FOR", allHeadings);
    script = [
      reasons && `🏡 Top 5 Reasons:\n${reasons}`,
      stats && `📊 Quick Stats:\n${stats}`,
      perfect && `👥 Perfect For:\n${perfect}`,
    ].filter(Boolean).join("\n\n");
  } else if (videoType === "community_events") {
    const events = extractSection(raw, "TOP EVENTS THIS MONTH", allHeadings);
    const vibe = extractSection(raw, "COMMUNITY VIBE", allHeadings);
    const recurring = extractSection(raw, "RECURRING HIGHLIGHTS", allHeadings);
    script = [
      events && `🎉 Events:\n${events}`,
      vibe && `✨ Community Vibe:\n${vibe}`,
      recurring && `🔄 Recurring Events:\n${recurring}`,
    ].filter(Boolean).join("\n\n");
  } else {
    // custom — generic content + key takeaway
    const content = extractSection(raw, "MAIN CONTENT", allHeadings);
    const takeaway = extractSection(raw, "KEY TAKEAWAY", allHeadings);
    script = [
      content && `📋 Key Points:\n${content}`,
      takeaway && `💡 Key Takeaway:\n${takeaway}`,
    ].filter(Boolean).join("\n\n");
  }

  const cta = extractSection(raw, "CALL TO ACTION", allHeadings) ||
    `Contact a local real estate agent in ${city}, ${state} today to learn more!`;

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
    script: script || raw,      // Fallback to full raw if parsing fails
    cta,
    description: blogIntro || hook,
    hashtags,
    keywords,
    blog_intro: blogIntro,
    blog_body: script,
    blog_conclusion: cta,
    sources,
    raw,
    video_type: videoType,
    location: `${city}, ${state}`,
  };
}
