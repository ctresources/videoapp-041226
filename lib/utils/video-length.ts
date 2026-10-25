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
 * Maximum words for a STANDARD video — 290 on every plan, ~2 minutes
 * (400 until 2026-10-24).
 *
 * Was 580 for agent/pro and 435 for everyone else. It is one number because a
 * plan split here bought ~25 seconds of extra video while doubling the number
 * of length rules to keep straight.
 *
 * The tier argument is kept so callers don't all have to change if plan-aware
 * lengths ever come back.
 */
export function standardMaxWords(_tier?: string | null): number {
  // NOT a cost cap, though it used to say it was.
  //
  // Video Agent pricing: $0.0333/sec ($2.00 a minute) was HeyGen's
  // introductory rate (a 133.8-second render once billed $4.45). Since the
  // agent's overhaul it is $0.097/sec, $5.82 a minute (HeyGen support and the
  // owner's bill, 2026-10-19): 100 words is ~41 seconds and ~$4, and a full
  // 400-word video ~$16. See docs/heygen-pricing.md.
  //
  // Two real constraints replaced it, and neither cares what HeyGen charges:
  //
  // 1. THE PROMPT BUDGET. The Video Agent carries the script inside its own
  //    9,800-character prompt (HEYGEN_PROMPT_LIMIT in create-blog), so every
  //    100 words takes ~590 characters away from the instructions. Measured
  //    with real prose on a listing short: at 400 words 4 of 6 instruction
  //    blocks survive, at 500 only 1 does, and past ~700 the script itself is
  //    trimmed. A longer video is not more expensive — it is less instructed.
  //
  // 2. RENDER TIME. HeyGen auto-fails a job at 30 minutes. A 2:14 render took
  //    8m42s (3.9x) and a ~4:00 one took ~18 minutes, so 4 minutes is close to
  //    the edge of what finishes at all.
  //
  // Raising this is therefore a prompt-size question, not a pricing one: trim
  // the prompt head and the cap can move. See the tail-ordering note in
  // create-blog for where the budget actually goes.
  //
  // 2026-10-24, the owner's call: every short avatar video is up to 2
  // minutes, Avatar in circle included. 400 words was ~2:45 and the Video
  // Agent's prompt was already trimming 397-word scripts to ~296.
  return 290; // ~2.0 min at 145 wpm, closing line included
}

/**
 * A VERTICAL video: up to 90 seconds.
 *
 * It was about a minute (135 words, capped at 155). Raised at the owner's
 * request: 90 seconds is what they expect of a Reel, and nothing downstream
 * needs it shorter. The 90-second figure people know is Facebook's limit for
 * a post sent as the Reel type; a longer vertical video simply goes up as an
 * ordinary video, and Instagram Reels and YouTube Shorts both run to three
 * minutes.
 *
 * The cap is 90 seconds at WPM. The target sits a little under it, as the
 * standard one does, so a script that runs slightly long is not cut.
 */
export const VERTICAL_TARGET_WORDS = 200;
export const VERTICAL_MAX_WORDS = 217;

/** Maximum runtime in minutes for a STANDARD video. */
export function standardMaxMinutes(_tier?: string | null): number {
  // 2 since 2026-10-24 (was a 4-minute slot). Avatar in circle's script plus
  // closing line is held to this slot (start-render ctaOnTop), so a long
  // closing line can no longer stretch it past 2 minutes.
  return 2;
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
/**
 * Room left for the closing line, which is added after the script.
 *
 * A standard script aimed at 90% of 400 words came back near 360, and the
 * closing line from Settings then took the total past 400, which greys out
 * Avatar video (2026-10-16, the owner's eXp Ready post: 367 + the CTA). The
 * target now leaves room for a typical closing line, so script and closing
 * line together land about 10% under.
 */
export const CLOSING_LINE_ROOM = 40;

export function targetWords(length: VideoLength, tier: string | null | undefined): number {
  return length === "long" ? 1100 : Math.round(standardMaxWords(tier) * 0.9) - CLOSING_LINE_ROOM;
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
// Camera runs longer than the AI path: nothing is rendered, so there is no
// HeyGen ceiling to respect — the only limit is the 15-minute recording cap.
// "Shorts" and "Longform" mirror the wording used on step 1.
// Three since 2026-10-21 (the owner's ask): up to 3, 8 or 15 minutes. The
// 2- and 4-minute lengths were choices nobody needed; "standard" writes up to
// about 3 minutes.
export const CAMERA_LENGTHS = [
  { key: "standard", label: "Shorts",    minutes: 3,  words: 435,  display: "Up to 3 min" },
  { key: "full",     label: "Longform",  minutes: 8,  words: 1160, display: "8 min" },
  { key: "extended", label: "Longform",  minutes: 15, words: 2175, display: "15 min" },
] as const;

export type CameraLength = (typeof CAMERA_LENGTHS)[number]["key"];

/**
 * Script lengths offered where the script WILL be rendered by HeyGen — the
 * paste / upload tab's "Let AI Spark The Script".
 *
 * That tab was showing CAMERA_LENGTHS, which is written for the teleprompter,
 * where nothing renders and the only ceiling is the 15-minute recording cap.
 * Three of its five options were longer than the renderer accepts, so the AI
 * wrote a script the user had chosen and the clamp then cut: "Shorts 4 min"
 * (580 words) came back a third shorter, and "Longform 15 min" (2,175) lost
 * roughly half — or 82% of it, if the editor's format was left on Shorts.
 *
 * Two options here because the renderer has two lengths. Both derive from the
 * same constants the clamp uses, so this cannot drift away from what actually
 * gets spoken.
 */
export const RENDERED_SCRIPT_LENGTHS = [
  { key: "rendered_short", label: "Shorts",   words: standardMaxWords() },
  { key: "rendered_long",  label: "Longform", words: LONG_MAX_WORDS },
] as const;

export type RenderedScriptLength = (typeof RENDERED_SCRIPT_LENGTHS)[number]["key"];

/** Whole minutes to advertise for a word budget — rounded up, so 400 words
 *  reads as the "up to 3 min" every plan page already promises. */
export function ceilMinutesFor(words: number): number {
  return Math.ceil(words / WPM);
}

export function cameraTargetWords(
  length: CameraLength | RenderedScriptLength | undefined,
): number {
  return (
    CAMERA_LENGTHS.find((l) => l.key === length)?.words ??
    RENDERED_SCRIPT_LENGTHS.find((l) => l.key === length)?.words ??
    standardMaxWords()
  );
}
