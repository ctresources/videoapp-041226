import { standardMaxWords, LONG_MAX_WORDS, minutesFor } from "@/lib/utils/video-length";
import { parseStateAbbr } from "@/lib/utils/us-states";

/**
 * The spoken half of the voice session is the browser's Web Speech API — free,
 * no server round trip, and it streams interim results, which is what lets the
 * transcript fill in as someone talks. This module is only the other half:
 * turning what they said into the brief fields and deciding what to say back.
 *
 * Perplexity rather than OpenAI because it is already configured and already
 * load-bearing here, where OPENAI_API_KEY powers one optional thumbnail feature
 * that falls back to a gradient without it.
 */
import { chatJson } from "@/lib/api/perplexity-chat";

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
  /** Vertical reel or landscape YouTube. */
  platform: "reel" | "youtube" | null;
}

export const EMPTY_SLOTS: BriefSlots = {
  city: null, state: null, topic: null, audience: null, tone: null, length: null, platform: null,
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
  const platform = str(o.platform);

  return {
    city: str(o.city, 80),
    state: stateRaw ? parseStateAbbr(stateRaw) : null,
    topic: str(o.topic, 300),
    audience: pick(o.audience, AUDIENCES),
    tone: pick(o.tone, TONES),
    length: length === "long" ? "long" : length === "standard" ? "standard" : null,
    platform: platform === "reel" ? "reel" : platform === "youtube" ? "youtube" : null,
  };
}

/**
 * Did the agent just say to go ahead?
 *
 * Decided here rather than asked of the model. Consent is a high-stakes binary
 * — a wrong yes starts a render they pay for — and when the model was asked, it
 * answered false to a plain "yes go ahead", which is the other failure: you say
 * it and nothing happens. A short matcher is duller and far more predictable.
 */
export function saidGoAhead(lastUserTurn: string): boolean {
  const t = lastUserTurn.toLowerCase().trim().replace(/[.!\s]+$/, "");
  // "no, don't go ahead" and "not yet" both contain affirmatives, so negation
  // is checked first and wins outright — including over the wake word.
  if (/\b(no|nope|not yet|don'?t|do not|wait|hold on|hang on|stop|cancel|change)\b/.test(t)) return false;
  // "Spark script" is the wake word: it names what actually happens next, and
  // keeps it distinct from "Spark video", the separate paid step in the editor.
  // The brand name still counts — it was the wake word first and people learned
  // it — but it is no longer what the UI teaches, because "Reels" in it read as
  // the video format of the same name.
  //
  // Shared with the editor session, which asks for "Spark video" at its own
  // step, so both verbs are accepted here rather than split across two
  // matchers that could drift apart.
  //
  // Speech recognition splits them as often as not, so "spark script",
  // "sparkscript", "spark video", "spark reels" and "sparkreel" all count.
  if (/(^|\b)spark\s?(script|video|reels?)(\b|$)/.test(t)) return true;

  // Unambiguous anywhere in the sentence.
  if (/(^|\b)(go ahead|go for it|generate it|let'?s go|yes|yep|yeah|yup|that'?s right|sounds good|perfect|correct)(\b|$)/.test(t)) {
    return true;
  }
  // "make it", "do it" and bare "generate" only count as the last thing said.
  // "make it about schools" and "make it shorter" are the user refining the
  // brief, not agreeing to it, and firing a paid render on those is the exact
  // mistake this function exists to avoid.
  return /\b(make it|do it|generate)(\s+(now|please|then|thanks|thank you))*$/.test(t);
}

/**
 * Reads a whole conversation and returns the brief so far plus what to say next.
 *
 * The entire transcript is re-read every turn rather than patching the previous
 * slots. That is the point: "actually make it sellers" has to overwrite an
 * earlier answer, and incremental extraction gets corrections wrong exactly when
 * a user is most likely to make them — while talking.
 *
 * Returns null when PERPLEXITY_API_KEY is missing or the call fails; the caller
 * falls back to the typed form rather than stranding the user mid-sentence.
 */
export async function runBriefTurn(turns: BriefTurn[]): Promise<BriefSessionResult | null> {
  if (!process.env.PERPLEXITY_API_KEY) return null;

  const shortWords = standardMaxWords();
  const system = `You are taking a video brief from a real estate agent, out loud, one short exchange at a time.

Collect these fields:
- city and state (state as a 2-letter abbreviation) — REQUIRED
- topic: what the video is about, in the agent's own words — REQUIRED
- audience: one of ${AUDIENCES.join(", ")} — optional
- tone: one of ${TONES.join(", ")} — optional
- length: "standard" (~${minutesFor(shortWords)} min, ${shortWords} words) or "long" (~${minutesFor(LONG_MAX_WORDS)} min) — optional
- platform: "reel" (vertical 9:16) or "youtube" (horizontal 16:9) — optional

Return ONLY this JSON, no code fence:
{"city":null,"state":null,"topic":null,"audience":null,"tone":null,"length":null,"platform":null,"reply":""}

Rules for the fields:
- Re-read the WHOLE conversation each time and return the current value of every field. A later correction replaces an earlier answer — if they said Buyers and then "actually sellers", audience is Sellers.
- Never invent a value. If they haven't said it, it stays null. Only use the listed audience and tone words; if what they said isn't one of them, leave it null rather than forcing the nearest.
- Length: "shorts", "a short one", "under four minutes", "keep it short" → standard. "longform", "long video", "eight minutes", "in depth" → long.
- Shape: "vertical", "nine by sixteen", "reel", "TikTok" → platform reel. "horizontal", "landscape", "sixteen by nine", "YouTube" → platform youtube.
- Shorts run either way up, but longform is horizontal only — so if length is long, platform is always youtube, whatever shape they asked for.
- Keep topic close to their words. Don't expand it into a script brief.

Rules for "reply":
- One or two sentences. It is spoken aloud, so no lists, no markdown, no field names.
- Ask for ONE missing required field at a time — market first, then topic.
- When you have both, read the brief back in a single sentence and ask if they want to go ahead.
- Never ask about audience, tone or length. Take them if offered, but they are optional and asking for them makes the conversation drag.
- Once city, state and topic are all filled, read the brief back in one sentence and invite them to say "Spark script" to write it, or tell you what to change. Whether they then agree is not your decision to record — just ask.`;

  try {
    const parsed = await chatJson(system, turns, { maxTokens: 400, label: "brief-session" });
    if (!parsed) return null;

    const slots = coerceSlots(parsed);
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 400) : "";

    const hasRequired = !!(slots.city && slots.state && slots.topic);
    const lastUser = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
    const ready = hasRequired && saidGoAhead(lastUser);

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
