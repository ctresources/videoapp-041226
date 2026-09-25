import { perplexityChat } from "@/lib/api/perplexity";

/**
 * What a piece of work should be a picture OF.
 *
 * Both image paths only ever knew a template or a title and the market — so
 * every blog header and every video thumbnail came out a house, whatever the
 * piece was about. Probate, rates, school catchments, when to downsize: all
 * the same sunlit colonial, because the only subject either prompt had was the
 * one baked into it.
 *
 * An image model cannot read an article and decide what to show; it draws the
 * nouns it is given. So a cheap text pass reads the piece and writes the one
 * sentence a photographer would be briefed with, and that becomes the subject.
 *
 * Deliberately a suggestion, not a decision: what this returns is put in front
 * of the agent in the Describe box, where a word can be changed before another
 * background is made.
 */
export async function photoBriefFor(opts: {
  /** The headline or video title — what this piece is called. */
  headline: string;
  /** The article or script, as much of it as matters. Trimmed here. */
  body?: string;
  city?: string;
  state?: string;
  /**
   * Where the picture goes. A thumbnail is glanced at on a phone and has a
   * cutout standing in it; an article header is looked at. Same subject, two
   * different photographs of it.
   */
  kind?: "article" | "thumbnail";
}): Promise<string | null> {
  const headline = opts.headline.trim();
  if (!headline) return null;
  const where = [opts.city, opts.state].filter(Boolean).join(", ");
  // Enough to know what the piece is about. The opening carries the subject;
  // the rest is detail that would only crowd the brief.
  const body = (opts.body || "").replace(/\s+/g, " ").trim().slice(0, 900);

  try {
    const thumb = opts.kind === "thumbnail";
    const raw = await perplexityChat([
      {
        role: "system",
        content: thumb
          ? "You brief photographers for video thumbnails. You answer with one concrete scene and nothing else. Return only valid JSON."
          : "You brief photographers for editorial article headers. You answer with one concrete scene and nothing else. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Describe the photograph that should ${thumb ? "sit behind the title of this video" : "head this article"}.

${thumb ? "TITLE" : "HEADLINE"}: "${headline}"
${body ? `OPENING: "${body}"\n` : ""}${where ? `PLACE: ${where}\n` : ""}
RULES:
- One sentence, under 25 words, describing a single real scene a photographer could shoot.
- It must be about what the ${thumb ? "VIDEO" : "ARTICLE"} is about. Do not default to a house exterior unless it is genuinely about buying, selling or touring a property.
${thumb ? "- It will be seen small and scrolled past: one clear subject, strong shapes, nothing fussy or crowded." : ""}
- Concrete nouns and light, no abstractions: "a kitchen table with a calculator, spread paperwork and a cooling mug in morning light", not "financial planning".
- No text, signs, logos or readable writing in the scene.
- No faces. ${thumb ? "No people at all — a cutout of the presenter is composited into this frame." : "People may appear only from behind, at a distance, or cropped below the chin."}

Return ONLY this JSON: {"scene": "YOUR SENTENCE"}`,
      },
    ], "sonar");

    let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    const { scene } = JSON.parse(text) as { scene?: string };
    const out = scene?.trim();
    if (!out) return null;
    return out.slice(0, 300);
  } catch (err) {
    // Not fatal, and not worth a retry: the caller falls back to the headline
    // itself as the subject, which is still the article rather than a house.
    console.error("[photo-brief] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
