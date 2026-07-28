/**
 * One source of truth for how long a video is and therefore how many words its
 * script should be. Everything downstream — the AI script prompts, the paste
 * screen's warnings, and the render-time clamp — derives from here.
 *
 * Word counts assume a natural ~145 wpm delivery.
 */

export const WPM = 145;

export type VideoLength = "standard" | "long";

/** Plan-aware maximum for a STANDARD (Video Agent) video. */
export function standardMaxWords(tier: string | null | undefined): number {
  return tier === "agent" || tier === "pro" ? 580 : 435; // 4 min vs 3 min
}

/** Plan-aware maximum runtime in minutes for a STANDARD video. */
export function standardMaxMinutes(tier: string | null | undefined): number {
  return tier === "agent" || tier === "pro" ? 4 : 3;
}

/** A LONG video is 8 minutes on every plan. */
export const LONG_MAX_WORDS = 1160;
export const LONG_MAX_MINUTES = 8;

/**
 * Words the AI should aim for. Slightly under the hard cap so a script that
 * runs a little long still isn't truncated.
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
