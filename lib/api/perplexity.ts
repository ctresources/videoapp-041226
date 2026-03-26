const PERPLEXITY_API = "https://api.perplexity.ai";

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

async function perplexityChat(messages: { role: string; content: string }[], model = "llama-3.1-sonar-large-128k-online") {
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
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function generateVideoScript(
  transcript: string,
  agentName: string,
  projectType: "blog_video" | "short_form" | "carousel"
): Promise<ScriptOutput> {
  const systemPrompt = `You are an expert real estate video content strategist. You create compelling, SEO-optimized video scripts and blog content for real estate agents to build their brand and attract leads online. You write in a conversational, authentic tone that builds trust. Always respond with valid JSON only.`;

  const userPrompt = `Real estate agent "${agentName}" recorded this voice content:

TRANSCRIPT:
"${transcript}"

Project type: ${projectType}

Generate a complete content package from this transcript. Return ONLY valid JSON (no markdown, no explanation):

{
  "title": "compelling video title (under 60 chars)",
  "hook": "best single hook to open the video (1-2 sentences, attention-grabbing)",
  "hooks": ["hook option 1", "hook option 2", "hook option 3"],
  "script": "polished full video script based on the transcript (2-4 minutes of speaking, keep the agent's voice and key points)",
  "cta": "clear call-to-action for the end of the video",
  "description": "YouTube/video platform description (150-200 words, include keywords naturally)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "blog_intro": "engaging blog post introduction paragraph (100 words)",
  "blog_body": "main blog body (300-400 words, structured with the key points from the transcript)",
  "blog_conclusion": "strong closing paragraph with CTA (80-100 words)"
}`;

  const raw = await perplexityChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as ScriptOutput;
}

export async function generateSeoData(
  title: string,
  script: string,
  keywords: string[]
): Promise<SeoOutput> {
  const systemPrompt = `You are an SEO expert specializing in real estate content. Generate optimized metadata for video and blog content. Always respond with valid JSON only.`;

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

  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as SeoOutput;
}
