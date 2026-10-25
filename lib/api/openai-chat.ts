import type { ChatTurn } from "@/lib/api/perplexity-chat";

/**
 * One JSON-returning chat turn on OpenAI (2026-10-24), first used to choose
 * the scenes behind a talking head. The cheap Perplexity model picked weak or
 * generic pictures for many lines of Daniel Okiro's events video, and the
 * owner asked to try OpenAI before moving to a more expensive renderer.
 *
 * gpt-6.1-sol by default ($2 in / $10 out per million tokens, about 2–3 cents a
 * plan); OPENAI_CHAT_MODEL overrides it without a deploy of code. Returns null
 * on any failure, like chatJson, so the caller falls back to Perplexity.
 */
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-6.1-sol";

export async function openaiChatJson(
  system: string,
  turns: ChatTurn[],
  opts: { maxTokens?: number; label?: string; timeoutMs?: number } = {},
): Promise<Record<string, unknown> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const { maxTokens = 2400, label = "openai-chat", timeoutMs = 60_000 } = opts;
  const model = process.env.OPENAI_CHAT_MODEL || DEFAULT_MODEL;
  try {
    /**
     * Low reasoning effort (2026-10-24): the first live scene plan ran past 60
     * seconds and timed out, and choosing pictures doesn't need deep thought.
     * A model that won't take the setting is asked again without it.
     */
    const ask = (effort: boolean) => fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // No temperature: the newer models take only their default.
        max_completion_tokens: maxTokens,
        ...(effort && { reasoning_effort: "low" }),
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...turns],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let res = await ask(true);
    if (res.status === 400) {
      const why = await res.clone().text().catch(() => "");
      if (/reasoning/i.test(why)) res = await ask(false);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[${label}] openai ${model} ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      console.error(`[${label}] openai ${model}: empty reply (finish ${json.choices?.[0]?.finish_reason ?? "?"})`);
      return null;
    }
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    console.error(`[${label}] openai turn failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}
