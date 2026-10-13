import { chatJson } from "@/lib/api/perplexity-chat";

/**
 * A spoken sentence turned into choices on the page it was said on.
 *
 * The owner wants a mic on every page that sets what is on that page. Each
 * page knows its own controls, so each one describes them here (what the
 * choice is called, and what the options are) and this works out which of
 * them a sentence picked. One reading of speech for every page, so "vertical,
 * no music" means the same thing wherever it is said.
 *
 * It only ever picks. Nothing here makes a video, sends a post or spends
 * anything: those stay a press, because a misheard word should cost a
 * correction and not a video.
 */
export interface PickField {
  /** How the page knows it. Comes back as the key of the pick. */
  key: string;
  /** What it is called on screen: "Shape", "Music". */
  label: string;
  type: "choice" | "toggle" | "text" | "number";
  /** For a choice: every option, by the value the page uses and its name on screen. */
  options?: { value: string; label: string }[];
  /** Anything that helps tell it apart: "how long the reel runs, in seconds". */
  hint?: string;
  /** For text, the longest it may be. For a number, the largest. */
  max?: number;
  /** For a number, the smallest. */
  min?: number;
}

export type PickValue = string | boolean | number;

const MAX_FIELDS = 30;
const MAX_OPTIONS = 60;

/** Whatever arrived from the browser, cut down to what a field may be. */
export function cleanFields(raw: unknown): PickField[] {
  if (!Array.isArray(raw)) return [];
  const out: PickField[] = [];
  for (const f of raw.slice(0, MAX_FIELDS)) {
    const o = f as Partial<PickField> | null;
    if (!o || typeof o.key !== "string" || typeof o.label !== "string") continue;
    if (o.type !== "choice" && o.type !== "toggle" && o.type !== "text" && o.type !== "number") continue;
    const key = o.key.trim().slice(0, 40);
    if (!/^[a-zA-Z][\w-]*$/.test(key)) continue;
    const field: PickField = { key, label: o.label.trim().slice(0, 60), type: o.type };
    if (typeof o.hint === "string") field.hint = o.hint.trim().slice(0, 160);
    if (typeof o.max === "number" && Number.isFinite(o.max)) field.max = o.max;
    if (typeof o.min === "number" && Number.isFinite(o.min)) field.min = o.min;
    if (o.type === "choice") {
      const options = (Array.isArray(o.options) ? o.options : [])
        .slice(0, MAX_OPTIONS)
        .map((x) => ({ value: String((x as { value?: unknown })?.value ?? "").slice(0, 80), label: String((x as { label?: unknown })?.label ?? "").slice(0, 80) }))
        .filter((x) => x.value && x.label);
      if (options.length === 0) continue;
      field.options = options;
    }
    out.push(field);
  }
  return out;
}

function describe(fields: PickField[]): string {
  return fields.map((f) => {
    const hint = f.hint ? ` (${f.hint})` : "";
    if (f.type === "choice") {
      return `- "${f.key}": ${f.label}${hint}. One of: ${f.options!.map((o) => `"${o.value}" = ${o.label}`).join("; ")}`;
    }
    if (f.type === "toggle") return `- "${f.key}": ${f.label}${hint}. true or false`;
    if (f.type === "number") {
      const range = f.min !== undefined || f.max !== undefined ? ` between ${f.min ?? "any"} and ${f.max ?? "any"}` : "";
      return `- "${f.key}": ${f.label}${hint}. A number${range}`;
    }
    return `- "${f.key}": ${f.label}${hint}. Text, in their words`;
  }).join("\n");
}

/**
 * Only what the page offered, in the form it offered it. The model is asked
 * for exactly this, and is not trusted to have given it.
 */
function validate(raw: unknown, fields: PickField[]): Record<string, PickValue> {
  const picks: Record<string, PickValue> = {};
  if (!raw || typeof raw !== "object") return picks;
  for (const f of fields) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (v === null || v === undefined || v === "") continue;
    if (f.type === "choice") {
      const said = String(v).trim().toLowerCase();
      const hit = f.options!.find((o) => o.value.toLowerCase() === said)
        ?? f.options!.find((o) => o.label.toLowerCase() === said);
      if (hit) picks[f.key] = hit.value;
    } else if (f.type === "toggle") {
      if (typeof v === "boolean") picks[f.key] = v;
      else if (/^(true|yes|on)$/i.test(String(v))) picks[f.key] = true;
      else if (/^(false|no|off)$/i.test(String(v))) picks[f.key] = false;
    } else if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) continue;
      if (f.min !== undefined && n < f.min) continue;
      if (f.max !== undefined && n > f.max) continue;
      picks[f.key] = n;
    } else {
      const text = String(v).trim().slice(0, f.max ?? 300);
      if (text) picks[f.key] = text;
    }
  }
  return picks;
}

/** What the sentence picked. Null when the reader is unavailable. */
export async function runVoicePick(said: string, fields: PickField[]): Promise<{ picks: Record<string, PickValue>; reply: string } | null> {
  const system = [
    "You turn one spoken sentence into choices on a settings screen. The sentence came from speech recognition, so allow for a misheard word.",
    "These are the only settings on the screen:",
    describe(fields),
    "Return ONLY a JSON object: {\"picks\": { ... }, \"reply\": \"...\"}.",
    "In picks, include a setting ONLY if the sentence clearly asks for it, using its key exactly. For a choice, give the option's value exactly as written above. Leave out everything the sentence did not mention. Never guess a setting to be helpful.",
    "If the sentence asks for something that is not on this screen, leave it out.",
    "reply is a few plain words for the person: what you did not understand, or an empty string when everything was understood.",
  ].join("\n");

  const parsed = await chatJson(system, [{ role: "user", content: said }], { maxTokens: 400, label: "voice-pick" });
  if (!parsed) return null;
  const obj = parsed as { picks?: unknown; reply?: unknown };
  return {
    picks: validate(obj.picks, fields),
    reply: typeof obj.reply === "string" ? obj.reply.trim().slice(0, 200) : "",
  };
}
