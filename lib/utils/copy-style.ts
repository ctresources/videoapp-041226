/**
 * House style for everything the model writes that a person will read: titles,
 * hooks, descriptions, captions, blog copy.
 *
 * Two halves, because either alone fails. PLAIN_COPY_RULES goes in the prompt
 * and gets most of the way; plainCopy() runs over the result and takes out what
 * survived. Models comply with "no em dashes" perhaps four times in five, and
 * the fifth is the one that ships.
 */

/** Prompt text. Append to any prompt whose output is shown to a reader. */
export const PLAIN_COPY_RULES = `HOUSE STYLE (applies to every word you return):
- No emoji anywhere, including in headings and bullets.
- No em dashes or en dashes. Use a comma, a full stop, or a colon instead. Hyphens inside a compound word ("one-level", "move-in", "two-bedroom") are correct and expected.
- Banned openers and phrases: "Discover", "Nestled", "Boasts", "Welcome to", "Step into", "Look no further", "Elevate", "Unlock", "Dive in", "In today's market", "Whether you're a X or a Y", "It's not just X, it's Y", "That's where X comes in", "And the best part".
- No rhetorical question as an opening line.
- Specific beats decorative. "Quartz counters and a new gas range" is worth more than "a stunning modern kitchen". If you cannot name the detail, leave the sentence out.
- Vary sentence length, and do not begin three sentences in a row the same way.
- Write it the way a person who knows the property would say it out loud.`;

/**
 * Emoji, pictographs, dingbats, regional indicators, and the variation
 * selectors and zero-width joiners that bind them together.
 *
 * Explicit ranges rather than \\p{Emoji}, which also matches digits, "#", "*"
 * and the copyright sign — running that over a listing description deletes the
 * price.
 */
const EMOJI = new RegExp(
  "[\\u{1F300}-\\u{1FAFF}\\u{1F000}-\\u{1F2FF}\\u{2600}-\\u{27BF}" +
  "\\u{2190}-\\u{21FF}\\u{2B00}-\\u{2BFF}\\u{1F1E6}-\\u{1F1FF}\\u{FE0F}\\u{20E3}\\u{200D}]",
  "gu",
);

/**
 * The style rules, enforced rather than requested.
 *
 * Dash handling is deliberately not one substitution. A dash between digits is
 * a range and becomes a hyphen ("5-10 minutes"); a dash between words is
 * parenthetical and becomes a comma; a dash opening a line is a bullet and is
 * left alone.
 */
export function plainCopy(text: string): string {
  if (!text) return text;
  return text
    .replace(EMOJI, "")
    // Ranges: 5–10, 2026–2027.
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    // Parenthetical dash mid-sentence.
    .replace(/\s+[—–]\s+/g, ", ")
    // Dash hard against a word on one or both sides.
    .replace(/([A-Za-z0-9])[—–]([A-Za-z0-9])/g, "$1, $2")
    // Anything left, including a trailing one.
    .replace(/[—–]/g, "-")
    // An emoji removed from the head of a line leaves its indent behind.
    .replace(/^[ \t]+/gm, "")
    // And a doubled space where it sat mid-line.
    .replace(/[ \t]{2,}/g, " ")
    // Three or more blank lines collapse to a paragraph break.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** plainCopy over each string in an array, dropping any left empty. */
export function plainCopyAll(items: string[] | undefined | null): string[] {
  return (items ?? []).map((s) => plainCopy(s)).filter(Boolean);
}
