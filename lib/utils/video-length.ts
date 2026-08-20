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
 * Plan-aware maximum for a STANDARD (Video Agent) video.
 *
 * 500 rather than the 580 this used to be. A 580-word script renders as a
 * 4-minute video, and on the Video Agent that took ~23 minutes against the
 * ~12 that a 3-minute video takes — long enough to be mistaken for a stall and
 * close enough to the 30-minute auto-fail to be uncomfortable.
 */
export function standardMaxWords(tier: string | null | undefined): number {
  return tier === "agent" || tier === "pro" ? 500 : 435; // ~3.4 min vs 3 min
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
