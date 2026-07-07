import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";

const PERPLEXITY_API = "https://api.perplexity.ai";

/**
 * Robustly extract and parse the first JSON object from a Perplexity response.
 * Handles markdown fences, preamble text, and trailing commentary.
 */
function parseJson<T>(raw: string, context: string): T {
  // 1. Strip markdown code fences
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // 2. Find the first { and last } — extract just the JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    const preview = text.slice(0, 120).replace(/\n/g, " ");
    throw new Error(`${context}: could not parse AI response as JSON. Preview: "${preview}"`);
  }
}

interface ScriptOutput {
  title: string;
  hook: string;
  hooks: string[];
  script: string;
  cta: string;
  description: string;
  hashtags: string[];
  keywords: string[];
  blog_intro: string;
  blog_body: string;
  blog_conclusion: string;
}

interface SeoOutput {
  title: string;
  meta_description: string;
  slug: string;
  keywords: string[];
  hashtags: string[];
  youtube_title: string;
  youtube_description: string;
  instagram_caption: string;
  linkedin_post: string;
  email_blurb: string;
}

export async function perplexityChat(messages: { role: string; content: string }[], model = "sonar-pro") {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY is not set. Add it to .env.local and restart the server.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000); // 50s — leaves buffer before Vercel's 60s limit

  const res = await fetch(`${PERPLEXITY_API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`Perplexity API error ${res.status}:`, errText);
    throw new Error(`Perplexity ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Perplexity returned empty content");
  return content as string;
}

export async function generateVideoScript(
  transcript: string,
  agentName: string,
  projectType: "blog_video" | "short_form" | "carousel"
): Promise<ScriptOutput> {
  const systemPrompt = `You are an expert real estate video content strategist AND a real-time market data researcher. You create compelling, data-driven video scripts for real estate agents.

YOUR PROCESS:
1. Read the agent's transcript to understand the topic, location, and key points
2. Use your web search to find CURRENT, REAL market data for that specific location (median prices, days on market, inventory, recent trends — from Zillow, Redfin, Realtor.com, MLS aggregates, etc.)
3. Weave that real data into the script to make it authoritative and credible
4. Always write in the agent's authentic voice — conversational, trustworthy, not salesy

ABSOLUTE RULES:
- ALWAYS return complete, publish-ready JSON — never refuse, never say you need more data
- If you cannot find specific stats, use the best available recent data and note it as approximate
- Never fabricate numbers — use real searched data or write around stats naturally
- Return ONLY valid JSON, no markdown fences, no explanations outside the JSON

${FAIR_HOUSING_GUARDRAIL}`;

  const userPrompt = `Real estate agent "${agentName}" recorded this voice note:

TRANSCRIPT:
"${transcript}"

Project type: ${projectType}

STEP 1: Search for current real estate market data for the specific city/area mentioned in this transcript (median sale price, days on market, inventory levels, year-over-year trends, recent sold prices). Use Zillow, Redfin, Realtor.com, or any current MLS data source.

STEP 2: Generate the complete content package below, incorporating the real data you found. Return ONLY this JSON object:

{
  "title": "compelling title under 60 chars that includes the location and a specific data point if available",
  "hook": "powerful 1-2 sentence hook that opens with a surprising stat or bold insight from the market data",
  "hooks": ["hook option 1 — data-driven", "hook option 2 — question format", "hook option 3 — bold statement"],
  "script": "complete 2-4 minute video script in ${agentName}'s voice. Include specific market stats you found (prices, DOM, inventory). Structure: hook → market overview with data → what it means for buyers/sellers → agent insight → CTA. Write as natural spoken words.",
  "cta": "call-to-action that uses '${agentName}' by name — specific and action-oriented",
  "description": "YouTube description 150-200 words including the real market stats and keywords",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "blog_intro": "engaging blog intro ~100 words that leads with a key market stat",
  "blog_body": "blog body 300-400 words with data points, analysis, and insights from your search",
  "blog_conclusion": "strong closing ~80 words with a clear CTA mentioning ${agentName}"
}`;

  const raw = await perplexityChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return parseJson<ScriptOutput>(raw, "generateVideoScript");
}

export interface YoutubeMetadata {
  youtube_title: string;
  youtube_description: string;
  hashtags: string[];
}

/**
 * Generate SEO/GEO/AEO-optimized YouTube title + description for a real estate video.
 *
 *   - SEO (Search Engine Optimization): keyword-rich front-loaded copy, structured
 *     content, geographic and topical signals for Google/YouTube search.
 *   - GEO (Generative Engine Optimization): clear factual statements with explicit
 *     entities (city, state, agent, brokerage, year) that LLM-powered search engines
 *     like ChatGPT, Perplexity, and Gemini can quote verbatim.
 *   - AEO (Answer Engine Optimization): FAQ-style direct-answer sections and
 *     conversational phrasing that voice assistants and featured snippets surface.
 */
export async function generateYoutubeMetadata(params: {
  title: string;
  script: string;
  city?: string;
  state?: string;
  agentName?: string;
  brokerage?: string;
  keywords?: string[];
  website?: string;
  phone?: string;
}): Promise<YoutubeMetadata> {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const contactLine = [
    params.agentName,
    params.brokerage,
    params.phone,
    params.website,
  ].filter(Boolean).join(" · ");

  const systemPrompt = `You are an SEO/GEO/AEO expert specializing in real estate YouTube optimization. You write YouTube titles and descriptions that win across three search surfaces:

1. SEO — Traditional YouTube + Google search. Keyword-rich, front-loaded, includes the city and state in the first 70 characters.
2. GEO — Generative engines (ChatGPT, Perplexity, Gemini). Uses explicit named entities (city, state, year, agent name, brokerage) and clear factual sentences the AI can quote.
3. AEO — Answer engines (voice search, featured snippets). Includes a short FAQ block of 3-4 direct-answer questions phrased the way people speak them out loud.

Always respond with valid JSON only.

${FAIR_HOUSING_GUARDRAIL}`;

  const userPrompt = `Generate an SEO/GEO/AEO-optimized YouTube title and description for this real estate video.

Title: "${params.title}"
${location ? `Market: ${location}` : ""}
${params.agentName ? `Agent: ${params.agentName}` : ""}
${params.brokerage ? `Brokerage: ${params.brokerage}` : ""}
${params.keywords?.length ? `Keywords: ${params.keywords.join(", ")}` : ""}
Script: """${params.script.slice(0, 1500)}"""

DESCRIPTION STRUCTURE (in this order, plain text — no markdown):

Paragraph 1 (first 150 chars matter most — visible in search snippets):
A keyword-rich hook that includes ${location || "the location"} and the primary topic. Front-load the most-searched phrase.

Paragraph 2 (3-4 sentences):
Expand on the topic with specific, factual, citation-friendly sentences. Use named entities (city, state, year, neighborhood) so LLM search engines can quote you. Include 1-2 real numbers or data points if the script mentions them.

📋 IN THIS VIDEO:
- Bullet list of 4-6 key topics covered (each starts with a verb, includes a keyword)

❓ FREQUENTLY ASKED QUESTIONS:
Q: <Common spoken question about the topic in ${location || "the area"}>
A: <Direct 1-2 sentence answer, factual, includes a keyword>
(Repeat for 3-4 Q&A pairs — these power voice search and featured snippets)

📍 SERVING:
${location || "the local market"} and surrounding areas

👋 CONNECT WITH ME:
${contactLine || "(agent contact details)"}

#️⃣ TAGS:
Inline the 5-8 most relevant hashtags here (mix broad + local).

🔔 Subscribe for weekly ${location || "local"} real estate market updates.

Return ONLY valid JSON:
{
  "youtube_title": "Under 70 chars. Includes ${location || "the city"} and primary keyword. Front-loaded for click-through.",
  "youtube_description": "Full description following the structure above, around 250-400 words. Use real newlines (\\n) between sections.",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6"]
}`;

  // sonar (non-pro) is 3-5× faster — no web search needed for SEO copy
  const raw = await perplexityChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], "sonar");

  return parseJson<YoutubeMetadata>(raw, "generateYoutubeMetadata");
}

export async function generateSeoData(
  title: string,
  script: string,
  keywords: string[]
): Promise<SeoOutput> {
  const systemPrompt = `You are an SEO expert specializing in real estate content. Generate optimized metadata for video and blog content. Always respond with valid JSON only.

${FAIR_HOUSING_GUARDRAIL}`;

  const userPrompt = `Generate SEO metadata for this real estate video content.

Title: "${title}"
Keywords: ${keywords.join(", ")}
Script excerpt: "${script.slice(0, 500)}..."

Return ONLY valid JSON:
{
  "title": "SEO-optimized page title (50-60 chars)",
  "meta_description": "compelling meta description (150-160 chars, includes primary keyword)",
  "slug": "url-friendly-slug",
  "keywords": ["primary keyword", "secondary keyword", "long tail keyword 1", "long tail keyword 2", "long tail keyword 3"],
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "youtube_title": "YouTube video title (under 70 chars, includes keyword)",
  "youtube_description": "Full YouTube description (300-400 words, keywords in first 125 chars, includes timestamps placeholder, links placeholder)",
  "instagram_caption": "Instagram caption (150-200 chars, punchy, ends with emoji, includes 3-5 hashtags inline)",
  "linkedin_post": "LinkedIn post (150-200 words, professional tone, data-driven insight, ends with a question to drive comments, no hashtag spam)",
  "email_blurb": "Email newsletter blurb (60-80 words, conversational tone, one clear CTA, no clickbait subject lines)"
}`;

  // sonar (non-pro) is 3-5× faster — no web search needed for SEO metadata
  const raw = await perplexityChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], "sonar");

  return parseJson<SeoOutput>(raw, "generateSeoData");
}
