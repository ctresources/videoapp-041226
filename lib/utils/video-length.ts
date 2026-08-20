/**
 * One source of truth for how long a video is and therefore how many words its
 * script should be. Everything downstream — the AI script prompts, the paste
 * screen's warnings, and the render-time clamp — derives from here.
 *
 * Word counts assume a natural ~145 wpm delivery.
 */

export const WPM = 145;

export type VideoLength = "standard" | "long";

/**
 * Maximum words for a STANDARD video — 500 on every plan.
 *
 * Was 580 for agent/pro and 435 for everyone else. Two reasons it is now one
 * number: a 580-word script renders as a 4-minute video, and HeyGen takes
 * 5-10x the finished length, so that was a 20-40 minute render; and a plan
 * split here bought ~25 seconds of extra video while doubling the number of
 * length rules to keep straight.
 *
 * The tier argument is kept so callers don't all have to change if plan-aware
 * lengths ever come back.
 */
export function standardMaxWords(_tier?: string | null): number {
  return 500; // ~3.4 min at 145 wpm
}

/** Maximum runtime in minutes for a STANDARD video. */
export function standardMaxMinutes(_tier?: string | null): number {
  return 4; // the slot; 500 words actually lands at ~3.4
}

/** A LONG video is 8 minutes on every plan. */
export const LONG_MAX_WORDS = 1160;
export const LONG_MAX_MINUTES = 8;

/**
 * Words the AI should aim for. Slightly under the hard cap so a script that
 * runs a little long still isn't truncated.
 *
 * The margin only works if the prompt treats the cap as a limit rather than a
 * suggestion — see lengthSpec in lib/api/perplexity-prompts.ts, which used to
 * penalise only *short* scripts and so reliably overshot by ~30%.
 */
export function targetWords(length: VideoLength, tier: string | null | undefined): number {
  return length === "long" ? 1100 : Math.round(standardMaxWords(tier) * 0.9);
}

/** Hard cap — anything past this is trimmed at render time. */
export function maxWords(length: VideoLength, tier: string | null | undefined): number {
  return length === "long" ? LONG_MAX_WORDS : standardMaxWords(tier);
}

/** Rough runtime for a word count, e.g. "3.4 min". */
export function minutesFor(words: number): number {
  return Math.round((words / WPM) * 10) / 10;
}

/**
 * Trims a script to a word budget, ending on a complete sentence.
 *
 * Was local to the render route only, so a script could be shown to the user
 * at 594 words — well past its 500-word cap — and only get clamped silently
 * later, at render time. The number the user sees has to be the number they
 * get, so this now runs right after generation too, not just before render.
 *
 * Slicing at exactly maxWords and bolting on a full stop used to end a real
 * video on "...roughly 30 to 45 minutes outside of peak rush hour by." — the
 * sentence boundary is what stops that.
 */
export function clampScript(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;

  const cut = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  // Only honour the sentence boundary if it keeps most of the budget — falling
  // back to a hard slice beats dropping a third of the script to find a period.
  if (lastStop > 0 && lastStop >= cut.length * 0.6) return cut.slice(0, lastStop + 1).trim();
  return cut + ".";
}

/**
 * Camera / teleprompter scripts. These are NOT rendered by HeyGen — the agent
 * records themselves — so there's no per-minute cost and the only limit is the
 * 15-minute recording cap. Lengths are a creative choice, not a budget one.
 */
export const CAMERA_LENGTHS = [
  { key: "quick",    label: "Quick",     minutes: 2,  words: 290 },
  { key: "standard", label: "Standard",  minutes: 3,  words: 435 },
  { key: "deep",     label: "In-Depth",  minutes: 4,  words: 580 },
  { key: "full",     label: "Full",      minutes: 8,  words: 1160 },
] as const;

export type CameraLength = (typeof CAMERA_LENGTHS)[number]["key"];

export function cameraTargetWords(length: CameraLength | undefined): number {
  return CAMERA_LENGTHS.find((l) => l.key === length)?.words ?? 400;
}
