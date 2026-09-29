/**
 * LinkedIn's field limits, in one place for the route that writes to them and
 * the tool that counts against them.
 *
 * LinkedIn refuses a paste that runs over rather than trimming it, so a
 * headline one word too long is a headline the agent has to rewrite by hand.
 * The model is told these numbers and still overshoots (see the script-length
 * notes in video-length.ts), so the route checks every field against them.
 */
export const LINKEDIN_LIMITS = {
  headline: 220,
  about: 2600,
  positionTitle: 100,
  positionDescription: 2000,
  skill: 80,
  post: 3000,
  companyTagline: 120,
  companyAbout: 2000,
  specialty: 80,
} as const;

export const LINKEDIN_SPECIALTIES_MAX = 20;

/**
 * Cuts text to a limit without leaving half a word or half a sentence.
 *
 * Prefers the last full sentence that keeps most of the text, then the last
 * word. Only the fallback after the route's one rewrite pass, so this should
 * rarely fire; when it does, a shorter complete sentence beats a longer broken
 * one.
 */
export function fitToLimit(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf(".\n"));
  if (sentenceEnd >= max * 0.6) return cut.slice(0, sentenceEnd + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:|/-]+$/, "").trim();
}

/** A LinkedIn custom URL: 3 to 100 lowercase letters, digits and hyphens. */
export function toLinkedInSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^.*linkedin\.com\/in\//, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
