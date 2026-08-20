/**
 * Small JSON-returning chat helper for the voice sessions.
 *
 * Separate from lib/api/perplexity.ts, which is the research path: these calls
 * turn a sentence into structured fields and must not search the web. Search
 * more than doubled a turn — 2.4s against 1.1s measured — and in a spoken
 * conversation that gap is a reply versus a pause.
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Runs one turn and parses the JSON object out of the reply.
 *
 * Returns null on a missing key, a transport failure, or unparseable output —
 * every caller falls back to the typed controls rather than stranding someone
 * mid-sentence, so a thrown error would only turn a soft failure into a hard
 * one.
 */
export async function chatJson(
  system: string,
  turns: ChatTurn[],
  opts: { maxTokens?: number; temperature?: number; label?: string } = {},
): Promise<Record<string, unknown> | null> {
  if (!process.env.PERPLEXITY_API_KEY) return null;
  const { maxTokens = 400, temperature = 0.2, label = "chat" } = opts;

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        temperature,
        max_tokens: maxTokens,
        disable_search: true,
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    if (!res.ok) {
      console.error(`[${label}] perplexity ${res.status}`);
      return null;
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;

    // Fenced despite the instruction often enough to be worth stripping.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    console.error(`[${label}] turn failed:`, e);
    return null;
  }
}

/**
 * Runs one turn and returns the raw text, for the cases that are not JSON —
 * rewriting a script, where the answer *is* the prose.
 */
export async function chatText(
  system: string,
  turns: ChatTurn[],
  opts: { maxTokens?: number; temperature?: number; label?: string } = {},
): Promise<string | null> {
  if (!process.env.PERPLEXITY_API_KEY) return null;
  const { maxTokens = 1200, temperature = 0.4, label = "chat" } = opts;

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        temperature,
        max_tokens: maxTokens,
        disable_search: true,
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    if (!res.ok) {
      console.error(`[${label}] perplexity ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (e) {
    console.error(`[${label}] turn failed:`, e);
    return null;
  }
}
