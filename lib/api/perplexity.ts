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
}

async function perplexityChat(messages: { role: string; content: string }[], model = "sonar-pro") {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY is not set. Add it to .env.local and restart the server.");
  }

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
  });

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
  "instagram_caption": "Instagram caption (150-200 chars, punchy, ends with emoji, includes 3-5 hashtags inline)"
}`;

  const raw = await perplexityChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return parseJson<SeoOutput>(raw, "generateSeoData");
}
