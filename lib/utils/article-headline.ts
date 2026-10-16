/**
 * The headline to show for a post (2026-10-15).
 *
 * Generated articles carry no blog_headline; their title is ai_script.title.
 * Falling straight back to the project's name put "Your text · 1,466 words —
 * Montgomery County, PA" at the top of a seller's email: that is the label the
 * Create page gives a pasted article, and it used to become the project name.
 */

/** The Create page's label for pasted writing, or its fallback topic. Never a headline. */
export function isPlaceholderTitle(t?: string | null): boolean {
  const s = (t ?? "").trim();
  return /^your text\s*·\s*[\d,]+\s+words\b/i.test(s) || /^the attached article\b/i.test(s);
}

export function articleHeadline(
  ai: { blog_headline?: string | null; title?: string | null } | null | undefined,
  seo: { youtube_title?: string | null; meta_title?: string | null } | null | undefined,
  projectTitle?: string | null,
): string {
  for (const c of [ai?.blog_headline, ai?.title, seo?.meta_title, seo?.youtube_title, projectTitle]) {
    const s = (c ?? "").trim();
    if (s && !isPlaceholderTitle(s)) return s;
  }
  return "Untitled post";
}
