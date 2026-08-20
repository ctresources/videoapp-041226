import OpenAI from "openai";
import { standardMaxWords, LONG_MAX_WORDS, minutesFor } from "@/lib/utils/video-length";
import { parseStateAbbr } from "@/lib/utils/us-states";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * The brief the Create page needs before it can generate. These are exactly the
 * fields the form collects — the voice session fills the same state, it does not
 * keep a second copy of the answer.
 */
export interface BriefSlots {
  city: string | null;
  state: string | null;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  length: "standard" | "long" | null;
}

export const EMPTY_SLOTS: BriefSlots = {
  city: null, state: null, topic: null, audience: null, tone: null, length: null,
};

export interface BriefTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BriefSessionResult {
  slots: BriefSlots;
  /** What to say back — one or two sentences, spoken aloud in the UI. */
  reply: string;
  /** True once market + topic are known AND the user has said to go ahead. */
  ready: boolean;
}

/** The vocabularies the form offers. Anything outside them is left null. */
const AUDIENCES = ["Buyers", "Sellers", "Investors", "First-Time Buyers", "Luxury", "Mixed"];
const TONES = ["Friendly", "Modern", "Luxury", "High-Energy", "Educational"];

/**
 * Coerces model output into the shape the page can actually use.
 *
 * Everything here is defensive on purpose: this is the only thing between an
 * LLM's JSON and the state that drives a paid render, and a hallucinated
 * audience or a length of "medium" must land as null rather than as a value the
 * form can't represent.
 */
export function coerceSlots(raw: unknown): BriefSlots {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 300): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t || /^(null|none|unknown|n\/a)$/i.test(t)) return null;
    return t.slice(0, max);
  };
  const pick = (v: unknown, allowed: string[]): string | null => {
    const t = str(v);
    if (!t) return null;
    return allowed.find((a) => a.toLowerCase() === t.toLowerCase()) ?? null;
  };

  // Not str(o.state, 2): truncating first turns "Pennsylvania" into "PE",
  // which is a real abbreviation for a different place.
  const stateRaw = str(o.state, 40);
  const length = str(o.length);

  return {
    city: str(o.city, 80),
    state: stateRaw ? parseStateAbbr(stateRaw) : null,
    topic: str(o.topic, 300),
    audience: pick(o.audience, AUDIENCES),
    tone: pick(o.tone, TONES),
    length: length === "long" ? "long" : length === "standard" ? "standard" : null,
  };
}

/**
 * Reads a whole conversation and returns the brief so far plus what to say next.
 *
 * The entire transcript is re-read every turn rather than patching the previous
 * slots. That is the point: "actually make it sellers" has to overwrite an
 * earlier answer, and incremental extraction gets corrections wrong exactly when
 * a user is most likely to make them — while talking.
 *
 * Returns null when OPENAI_API_KEY is missing or the call fails; the caller
 * falls back to the typed form rather than stranding the user mid-sentence.
 */
export async function runBriefTurn(turns: BriefTurn[]): Promise<BriefSessionResult | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  const shortWords = standardMaxWords();
  const system = `You are taking a video brief from a real estate agent, out loud, one short exchange at a time.

Collect these fields:
- city and state (state as a 2-letter abbreviation) — REQUIRED
- topic: what the video is about, in the agent's own words — REQUIRED
- audience: one of ${AUDIENCES.join(", ")} — optional
- tone: one of ${TONES.join(", ")} — optional
- length: "standard" (~${minutesFor(shortWords)} min, ${shortWords} words) or "long" (~${minutesFor(LONG_MAX_WORDS)} min) — optional

Return ONLY this JSON:
{"city":null,"state":null,"topic":null,"audience":null,"tone":null,"length":null,"reply":"","ready":false}

Rules for the fields:
- Re-read the WHOLE conversation each time and return the current value of every field. A later correction replaces an earlier answer — if they said Buyers and then "actually sellers", audience is Sellers.
- Never invent a value. If they haven't said it, it stays null. Only use the listed audience and tone words; if what they said isn't one of them, leave it null rather than forcing the nearest.
- "under four minutes", "keep it short" → standard. "eight minutes", "long version", "in depth" → long.
- Keep topic close to their words. Don't expand it into a script brief.

Rules for "reply":
- One or two sentences. It is spoken aloud, so no lists, no markdown, no field names.
- Ask for ONE missing required field at a time — market first, then topic.
- When you have both, read the brief back in a single sentence and ask if they want to go ahead.
- Never ask about audience, tone or length. Take them if offered, but they are optional and asking for them makes the conversation drag.

Rules for "ready":
- true ONLY when city, state and topic are all filled AND the agent has just said to go ahead ("go ahead", "do it", "yes", "generate it", "that's right").
- Answering a question is not consent. If they just told you the topic, ready is false — confirm first.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
    });

    const text = res.choices[0]?.message?.content;
    if (!text) return null;

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const slots = coerceSlots(parsed);
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 400) : "";

    // `ready` is decided here, not taken on trust: the model is asked for a
    // judgement about consent, and a wrong `true` starts a render the agent
    // never asked for and pays for.
    const hasRequired = !!(slots.city && slots.state && slots.topic);
    const ready = hasRequired && parsed.ready === true;

    return {
      slots,
      reply: reply || (hasRequired ? "Ready when you are — say go ahead." : "Which market is this for?"),
      ready,
    };
  } catch (e) {
    console.error("[brief-session] turn failed:", e);
    return null;
  }
}
