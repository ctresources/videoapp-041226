import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gemini (2026-11-15, the owner's approved plan, docs/mockups/gemini-five-mockup.html).
 *
 * One place for the key, the models and the calls the six Gemini features
 * share: JSON answers, answers with Google Search, reading files and videos,
 * and editing photos. Every function returns null on any failure so each
 * caller keeps working the way it did before Gemini.
 *
 * Google Search is billed per search after 5,000 free a month, shared with AI
 * Visibility. The app counts them (gemini_usage) and stops using Gemini search
 * at SEARCH_CAP, so research falls back to Perplexity before any search costs
 * money.
 */

const BASE = "https://generativelanguage.googleapis.com";
export const SEARCH_CAP = 4000;

export function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY || process.env.GEMINI_KEY || null;
}

/** Everyday model for reading, judging and writing. GEMINI_MODEL overrides. */
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
/** Photo editing. GEMINI_IMAGE_MODEL overrides. */
export const geminiImageModel = () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

/** Counts one use this month; returns the new total for that kind, or null. */
export async function countGemini(kind: string, n = 1): Promise<number | null> {
  try {
    const { data } = await createAdminClient().rpc("gemini_count", { p_kind: kind, p_n: n });
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

/** This month's counts, for the Admin tab and the search cap. */
export async function geminiUsage(): Promise<Record<string, number>> {
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" })
    .format(new Date()).slice(0, 7);
  const { data } = await createAdminClient().from("gemini_usage").select("counts").eq("month", month).maybeSingle();
  return ((data as { counts?: Record<string, number> } | null)?.counts) ?? {};
}

/** True while this month's Google searches are under the cap. */
export async function searchAllowed(): Promise<boolean> {
  if (!geminiKey()) return false;
  try {
    return ((await geminiUsage()).searches ?? 0) < SEARCH_CAP;
  } catch {
    return true;
  }
}

export interface GeminiAnswer { text: string; raw: Record<string, unknown> }

/**
 * One generateContent call. `search` adds Google Search (counted, capped);
 * `json` asks for a JSON reply. Null on a missing key, the cap, or any error.
 */
export async function geminiGenerate(opts: {
  parts: GeminiPart[];
  system?: string;
  json?: boolean;
  search?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  label?: string;
}): Promise<GeminiAnswer | null> {
  const key = geminiKey();
  if (!key) return null;
  const label = opts.label ?? "gemini";
  if (opts.search && !(await searchAllowed())) return null;
  const model = opts.model || geminiModel();
  try {
    const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(opts.system && { systemInstruction: { parts: [{ text: opts.system }] } }),
        contents: [{ role: "user", parts: opts.parts }],
        ...(opts.search && { tools: [{ google_search: {} }] }),
        generationConfig: {
          ...(opts.json && !opts.search && { responseMimeType: "application/json" }),
          ...(opts.temperature !== undefined && { temperature: opts.temperature }),
          ...(opts.maxTokens && { maxOutputTokens: opts.maxTokens }),
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
    if (!res.ok) {
      console.error(`[${label}] gemini ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const raw = (await res.json()) as Record<string, unknown>;
    if (opts.search) {
      const queries = ((raw.candidates as { groundingMetadata?: { webSearchQueries?: unknown[] } }[] | undefined)?.[0]
        ?.groundingMetadata?.webSearchQueries ?? []).length;
      void countGemini("searches", Math.max(1, queries));
    }
    const parts = ((raw.candidates as { content?: { parts?: { text?: string; thought?: boolean }[] } }[] | undefined)?.[0]
      ?.content?.parts ?? []);
    const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
    return { text, raw };
  } catch (e) {
    console.error(`[${label}] gemini failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Pulls the JSON object or array out of a reply, fenced or not. */
export function parseJsonReply<T = Record<string, unknown>>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { return null; }
}

export async function geminiJson<T = Record<string, unknown>>(opts: Parameters<typeof geminiGenerate>[0]): Promise<T | null> {
  const out = await geminiGenerate({ ...opts, json: true });
  return out?.text ? parseJsonReply<T>(out.text) : null;
}

/**
 * Chat-style messages (system + turns) answered by Gemini: the stand-in when
 * Perplexity fails, and the first try for research. Search on when asked.
 */
export async function geminiFromMessages(
  messages: { role: string; content: string }[],
  opts: { search?: boolean; json?: boolean; label?: string; maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  const text = turns.length === 1
    ? turns[0].content
    : turns.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`).join("\n\n");
  const out = await geminiGenerate({
    parts: [{ text }],
    system: system || undefined,
    search: opts.search,
    json: opts.json,
    label: opts.label,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    timeoutMs: opts.timeoutMs ?? 30_000,
  });
  return out?.text || null;
}

/** Downloads an image and returns it as an inline part (skips anything not an image or over 7 MB). */
export async function imagePart(url: string, timeoutMs = 15_000): Promise<GeminiPart | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 7 * 1024 * 1024) return null;
    const mimeType = type.startsWith("image/") ? type : /\.png(\?|$)/i.test(url) ? "image/png" : /\.webp(\?|$)/i.test(url) ? "image/webp" : "image/jpeg";
    return { inlineData: { mimeType, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

/**
 * Uploads a file (video, long PDF) to Gemini's File API and waits until it can
 * be read. Returns the part to send, plus the name to delete afterwards.
 */
export async function geminiUpload(buf: Buffer, mimeType: string, displayName: string, waitMs = 120_000):
  Promise<{ part: GeminiPart; name: string } | null> {
  const key = geminiKey();
  if (!key) return null;
  try {
    const start = await fetch(`${BASE}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buf.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
      signal: AbortSignal.timeout(30_000),
    });
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!start.ok || !uploadUrl) {
      console.error(`[gemini-upload] start ${start.status}`);
      return null;
    }
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(buf.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(180_000),
    });
    if (!up.ok) {
      console.error(`[gemini-upload] upload ${up.status}`);
      return null;
    }
    let file = ((await up.json()) as { file?: { name: string; uri: string; state?: string; mimeType?: string } }).file;
    if (!file?.uri) return null;
    const until = Date.now() + waitMs;
    while (file.state && file.state !== "ACTIVE") {
      if (file.state === "FAILED" || Date.now() > until) {
        void geminiDeleteFile(file.name);
        console.error(`[gemini-upload] file ${file.state === "FAILED" ? "failed" : "not ready in time"}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`${BASE}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key } });
      if (poll.ok) file = (await poll.json()) as typeof file;
    }
    return { part: { fileData: { mimeType: file.mimeType || mimeType, fileUri: file.uri } }, name: file.name };
  } catch (e) {
    console.error("[gemini-upload] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function geminiDeleteFile(name: string): Promise<void> {
  const key = geminiKey();
  if (!key || !name) return;
  await fetch(`${BASE}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": key } }).catch(() => null);
}

/**
 * Edits or makes a photo. Returns the image bytes, or null. Counted as
 * "images" (about 5 cents each at 2K).
 */
export async function geminiImage(opts: { prompt: string; images?: GeminiPart[]; aspectRatio?: string; label?: string }):
  Promise<{ buf: Buffer; mimeType: string } | null> {
  const key = geminiKey();
  if (!key) return null;
  const label = opts.label ?? "gemini-image";
  const send = (withSize: boolean) => fetch(`${BASE}/v1beta/models/${encodeURIComponent(geminiImageModel())}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [...(opts.images ?? []), { text: opts.prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { ...(opts.aspectRatio && { aspectRatio: opts.aspectRatio }), ...(withSize && { imageSize: "2K" }) },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  try {
    let res = await send(true);
    if (res.status === 400) res = await send(false);
    if (!res.ok) {
      console.error(`[${label}] ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const j = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] } }[] };
    const d = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)?.inlineData;
    if (!d) return null;
    void countGemini("images");
    return { buf: Buffer.from(d.data, "base64"), mimeType: d.mimeType || "image/png" };
  } catch (e) {
    console.error(`[${label}] failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}
