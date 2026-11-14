import type { Engine } from "@/lib/ai-visibility/shared";

/**
 * Asks one AI search engine one question, the way a buyer would: no system
 * prompt, no hint about who is asking. Returns the answer text and every
 * source link it used, or null when the engine couldn't be reached (the week
 * then shows that question as not checked, never as "not named").
 */
export interface EngineAnswer { text: string; urls: string[] }

const OPENAI_RESPONSES = "https://api.openai.com/v1/responses";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const TIMEOUT = 90_000;

/** Every http(s) link anywhere in a reply, for the parts whose shape varies. */
function collectUrls(node: unknown, out: Set<string>) {
  if (!node) return;
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node)) out.add(node);
    return;
  }
  if (Array.isArray(node)) { node.forEach((n) => collectUrls(n, out)); return; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((k === "url" || k === "uri") && typeof v === "string") out.add(v);
      else if (typeof v === "object") collectUrls(v, out);
    }
  }
}

/**
 * ChatGPT search: OpenAI's Responses API with its web search tool, the same
 * search ChatGPT uses. OPENAI_SEARCH_MODEL overrides the model.
 */
async function askChatGPT(question: string): Promise<EngineAnswer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-6.1-sol";
  const body = (tool: string, include: boolean) => JSON.stringify({
    model,
    input: question,
    tools: [{ type: tool }],
    ...(include && { include: ["web_search_call.action.sources"] }),
  });
  const send = (tool: string, include: boolean) => fetch(OPENAI_RESPONSES, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body(tool, include),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  try {
    let res = await send("web_search", true);
    // Older names and options, in case the account's model wants them.
    if (res.status === 400) res = await send("web_search", false);
    if (res.status === 400) res = await send("web_search_preview", false);
    if (!res.ok) {
      console.error(`[ai-visibility] chatgpt ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { output?: unknown[]; output_text?: string };
    const parts: string[] = [];
    for (const item of json.output ?? []) {
      const content = (item as { content?: unknown[] }).content;
      if (Array.isArray(content)) {
        content.forEach((c) => { if (typeof (c as { text?: unknown }).text === "string") parts.push((c as { text: string }).text); });
      }
    }
    const urls = new Set<string>();
    collectUrls(json.output, urls);
    return { text: parts.join("\n") || json.output_text || "", urls: Array.from(urls) };
  } catch (e) {
    console.error("[ai-visibility] chatgpt failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Perplexity's own search answer, with its citations. */
async function askPerplexity(question: string): Promise<EngineAnswer | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  const send = () => fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: question }] }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  try {
    let res = await send();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000));
      res = await send();
    }
    if (!res.ok) {
      console.error(`[ai-visibility] perplexity ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; citations?: unknown; search_results?: unknown };
    const urls = new Set<string>();
    collectUrls(json.citations, urls);
    collectUrls(json.search_results, urls);
    return { text: json.choices?.[0]?.message?.content ?? "", urls: Array.from(urls) };
  } catch (e) {
    console.error("[ai-visibility] perplexity failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function askEngine(engine: Engine, question: string): Promise<EngineAnswer | null> {
  return engine === "chatgpt" ? askChatGPT(question) : askPerplexity(question);
}
