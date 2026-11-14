import { openaiChatJson } from "@/lib/api/openai-chat";
import { chatJson } from "@/lib/api/perplexity-chat";
import { QUESTIONS_PER_TOWN, type TownQuestion } from "@/lib/ai-visibility/shared";

/**
 * A town's top searches, as questions (2026-11-14, the owner's call: "the top
 * keyword searches for that town", with no new paid service).
 *
 * Google's own search suggestions are what it offers as you type, and it
 * offers them because many people search them; AnswerThePublic is built on
 * the same thing. We type real-estate starters for the town, score each
 * suggestion by how often and how high it comes back, keep the ones about the
 * town, and have the AI rewrite the top ones as the questions someone would
 * ask ChatGPT. No counts: popularity is Google choosing to suggest it.
 */

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";

/** Starters typed for each town. {t} is "blue bell pa". */
const SEEDS = [
  "{t}", "is {t}", "best realtor {t}", "real estate agent {t}", "realtor {t}", "sell my house {t}",
  "homes for sale {t}", "{t} real estate", "{t} housing market", "{t} home prices",
  "living in {t}", "moving to {t}", "cost of living {t}", "{t} schools", "{t} school district",
  "{t} neighborhoods", "{t} property taxes", "things to do in {t}", "how much {t}", "why {t}",
];

/** Searches that are not about choosing to live there or hiring an agent. */
const OFF_TOPIC = /\b(weather|zip ?code|map|time ?zone|news|obituar|jobs?|police|hospital|post office|restaurants?|pizza|hotel|movie|radar|traffic|crime ?map|library hours|dmv|airport)\b/i;

async function suggestions(seed: string): Promise<string[]> {
  try {
    const url = `${SUGGEST_URL}?client=firefox&hl=en&gl=us&q=${encodeURIComponent(seed)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = (await res.json()) as [string, string[]];
    return Array.isArray(json?.[1]) ? json[1].filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** The town's most-suggested searches, best first. */
export async function topSearches(town: string, state: string, limit = 18): Promise<string[]> {
  const t = `${town} ${state}`.toLowerCase().replace(/\s+/g, " ").trim();
  const townWord = town.toLowerCase().trim();
  const score = new Map<string, number>();
  // A few at a time, so Google sees an ordinary pace.
  for (let i = 0; i < SEEDS.length; i += 4) {
    const batch = await Promise.all(SEEDS.slice(i, i + 4).map((s) => suggestions(s.replace("{t}", t))));
    batch.forEach((list) => list.forEach((s, pos) => {
      const phrase = s.toLowerCase().replace(/\s+/g, " ").trim();
      if (!phrase.includes(townWord) || OFF_TOPIC.test(phrase) || phrase === t) return;
      score.set(phrase, (score.get(phrase) ?? 0) + (10 - Math.min(pos, 9)));
    }));
  }
  return Array.from(score.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([p]) => p);
}

const SYSTEM = `You turn a town's real Google searches into the questions a person would type into ChatGPT.
Return JSON only: {"questions":[{"q":"...","search":"..."}]}.
Rules:
- Exactly ${QUESTIONS_PER_TOWN} questions, each from one of the searches given (copy that search into "search" exactly). Use each search once.
- Pick the searches most useful to a real estate agent in that town: at least 3 about finding, hiring or choosing a real estate agent or realtor, or selling a house; the rest about buying there, home prices, living there, schools, neighborhoods, taxes and costs.
- If fewer than 3 searches are about agents, add questions about choosing an agent in the town with "search": null.
- Write each as one natural question, as a buyer or seller would ask it, naming the town and state like "Blue Bell, PA". No numbering, no quotes inside.`;

/** The town's 10 questions: from its top searches, or written fresh when Google offered none. */
export async function townQuestions(town: string, state: string): Promise<TownQuestion[]> {
  const searches = await topSearches(town, state);
  const place = `${town}, ${state}`;
  const ask = searches.length
    ? `Town: ${place}\nSearches, most popular first:\n${searches.map((s) => `- ${s}`).join("\n")}`
    : `Town: ${place}\nNo searches were found. Write ${QUESTIONS_PER_TOWN} questions buyers and sellers commonly ask about ${place}, each with "search": null.`;
  const reply = (await openaiChatJson(SYSTEM, [{ role: "user", content: ask }], { label: "ai-visibility-questions", maxTokens: 1500 }))
    ?? (await chatJson(SYSTEM, [{ role: "user", content: ask }], { label: "ai-visibility-questions", maxTokens: 1200 }));
  const list = Array.isArray((reply as { questions?: unknown } | null)?.questions)
    ? ((reply as { questions: unknown[] }).questions)
    : [];
  const out: TownQuestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const q = typeof (item as { q?: unknown }).q === "string" ? (item as { q: string }).q.trim().slice(0, 200) : "";
    const s = (item as { search?: unknown }).search;
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push({ q, search: typeof s === "string" && s.trim() ? s.trim().slice(0, 120) : null });
    if (out.length >= QUESTIONS_PER_TOWN) break;
  }
  if (out.length) return out;
  // Nothing usable came back: plain questions, so the town still gets checked.
  return [
    `Who's the best realtor in ${place}?`,
    `Which real estate agent should I call to sell my house in ${place}?`,
    `Who are the top real estate agents in ${place}?`,
    `Is ${place} a good place to live?`,
    `What are home prices like in ${place}?`,
    `What homes are for sale in ${place} right now?`,
    `How good are the schools in ${place}?`,
    `What are the best neighborhoods in ${place}?`,
    `What are property taxes like in ${place}?`,
    `What's it like moving to ${place}?`,
  ].map((q) => ({ q, search: null }));
}
