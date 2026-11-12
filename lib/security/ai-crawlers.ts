/**
 * Known AI crawlers, by the name they send with each request (2026-11-12).
 * Counted in middleware.ts for the Monday watch email, since Clarity's Bot
 * Activity can't connect to Vercel. First match wins, so the more specific
 * names come first. A crawler can lie about its name; this is a count, not
 * a lock.
 */
const CRAWLERS: [RegExp, string][] = [
  [/OAI-SearchBot/i, "ChatGPT search"],
  [/ChatGPT-User/i, "ChatGPT (a person asked)"],
  [/GPTBot/i, "ChatGPT (training)"],
  [/Claude-User/i, "Claude (a person asked)"],
  [/Claude-SearchBot/i, "Claude search"],
  [/ClaudeBot|anthropic-ai/i, "Claude (training)"],
  [/Perplexity-User/i, "Perplexity (a person asked)"],
  [/PerplexityBot/i, "Perplexity"],
  [/Google-CloudVertexBot|GoogleOther|Google-Extended/i, "Google AI"],
  [/Googlebot/i, "Google (search and AI Overviews)"],
  [/bingbot/i, "Bing / Copilot"],
  [/Applebot/i, "Apple"],
  [/meta-externalagent|meta-externalfetcher|FacebookBot/i, "Meta AI"],
  [/MistralAI-User/i, "Mistral"],
  [/DuckAssistBot/i, "DuckDuckGo AI"],
  [/Amazonbot/i, "Amazon"],
  [/Bytespider/i, "ByteDance"],
  [/CCBot/i, "Common Crawl (feeds many AIs)"],
  [/cohere-ai|cohere-training/i, "Cohere"],
  [/YouBot/i, "You.com"],
];

/** The crawler's friendly name, or null for everyone else. */
export function aiCrawlerName(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  for (const [re, name] of CRAWLERS) if (re.test(userAgent)) return name;
  return null;
}
