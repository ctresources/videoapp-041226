/**
 * A generated article as website-ready HTML.
 *
 * The blog writer returns plain text with "H2:" and "H3:" heading markers and
 * paragraphs separated by blank lines. This turns that into the markup a
 * website expects, so the whole point of the feature — paste it into your
 * blog — doesn't require the agent to re-add every heading by hand.
 *
 * The one copy. The editor's Share Kit and the Spark card both call this, so
 * Copy as HTML gives identical output from either. There used to be two, and
 * they drifted: the Spark card's had no headline, no H3 and no header image.
 */
/** What the schema says about the article beyond its own words. */
export interface ArticleSchemaInfo {
  /** The agent, as the author. */
  author?: string | null;
  /** "City, ST". */
  place?: string | null;
  /** When it was written, any date string; today if absent. */
  date?: string | null;
}

/**
 * The question-and-answer pairs an article carries, for its FAQ schema.
 *
 * The "Frequently Asked Questions" section when there is one (article-faq.ts
 * fixes that heading so it can be found). Articles written before that had
 * their FAQs under question headings of their own, indistinguishable from any
 * other section, so for those every "H3:" question with an answer under it
 * counts: each is a question and its answer, visible on the page, which is
 * what the markup is for.
 */
export function articleFaqs(body: string): { q: string; a: string }[] {
  const lines = (body || "").split("\n").map((l) => l.trim());
  const hasFaqSection = lines.some((l) => /^H2:\s*(frequently asked questions|faqs?)\b/i.test(l));
  const out: { q: string; a: string }[] = [];
  let inFaq = !hasFaqSection;
  let q = "";
  let a: string[] = [];
  const close = () => {
    if (q && a.length) out.push({ q, a: a.join(" ") });
    q = ""; a = [];
  };
  for (const line of lines) {
    if (/^H2:\s*/.test(line)) {
      close();
      if (hasFaqSection) inFaq = /^H2:\s*(frequently asked questions|faqs?)\b/i.test(line);
      continue;
    }
    if (/^H3:\s*/.test(line)) {
      close();
      const text = line.replace(/^H3:\s*/, "");
      if (inFaq && /\?\s*$/.test(text)) q = text;
      continue;
    }
    if (q && line) a.push(line);
  }
  close();
  return out;
}

export function blogAsHtml(sections: {
  headline?: string;
  /** Made in the image generator; goes first, above the <h1>. */
  headerUrl?: string;
  /**
   * The header picture, moving: a short silent loop that opens on it. When
   * there is one it leads the post, with the still picture inside it.
   */
  headerVideoUrl?: string;
  /** What that loop opens on: the picture without the words drawn on it. */
  headerVideoPosterUrl?: string;
  intro: string;
  body: string;
  conclusion: string;
},
/**
 * Given when the HTML is for pasting into a site: the article's schema is
 * appended. Left out for a preview drawn inside the app.
 */
schema?: ArticleSchemaInfo): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (s: string) => esc(s).replace(/"/g, "&quot;");
  const blocks: string[] = [];
  // The header image goes first, above the <h1>, the way an article page
  // leads with its picture. Alt text is the headline, which is what it shows.
  if (sections.headerUrl?.startsWith("https://")) {
    const img = `<img src="${attr(sections.headerUrl)}" alt="${attr(sections.headline?.trim() || "")}">`;
    /**
     * The moving header, with the picture inside it.
     *
     * Muted, looping and inline, which is what a browser will start without
     * being asked. Its poster is the clean picture the loop opens on, so the
     * post looks right before the video has loaded and nothing jumps when it
     * starts; the headline is the <h1> directly underneath. The picture is also inside the element as plain
     * content: a site that removes <video> from pasted HTML usually keeps
     * what was inside it, and then the post has its header as it did before.
     */
    blocks.push(sections.headerVideoUrl?.startsWith("https://")
      ? `<video autoplay muted loop playsinline poster="${attr(sections.headerVideoPosterUrl?.startsWith("https://") ? sections.headerVideoPosterUrl : sections.headerUrl)}" style="width:100%;height:auto"><source src="${attr(sections.headerVideoUrl)}" type="video/mp4">${img}</video>`
      : img);
  }
  // The one <h1> on the page, and the line a search or answer engine reads
  // first. Omitted when the article predates headlines rather than emitted
  // empty — a blank <h1> is worse for the same surfaces than none.
  if (sections.headline?.trim()) blocks.push(`<h1>${esc(sections.headline.trim())}</h1>`);
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(`<p>${esc(para.join(" "))}</p>`);
    para = [];
  };
  // Line by line rather than by blank-line block. The model does not reliably
  // leave a blank line after a heading, and treating a whole block as one
  // unit swallowed the paragraphs under it into the <h2>.
  for (const chunk of [sections.intro, sections.body, sections.conclusion]) {
    if (!chunk?.trim()) continue;
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.trim();
      if (!line) { flush(); continue; }
      if (/^H2:\s*/.test(line)) {
        flush();
        blocks.push(`<h2>${esc(line.replace(/^H2:\s*/, ""))}</h2>`);
        continue;
      }
      // H3 came in with the FAQ sections, where each question is its own
      // subheading. Without this branch the marker went out as literal text
      // inside a paragraph — visible in the HTML someone pastes into their
      // site, and no heading where an answer engine looks for one.
      if (/^H3:\s*/.test(line)) {
        flush();
        blocks.push(`<h3>${esc(line.replace(/^H3:\s*/, ""))}</h3>`);
        continue;
      }
      para.push(line);
    }
    flush();
  }

  /**
   * Schema, in the post itself rather than behind a second button, at the
   * owner's ask: one paste carries the article and what describes it.
   *
   * Two things a machine reading the page can use: what the article is, who
   * wrote it and when (BlogPosting), and its questions and answers as
   * questions and answers (FAQPage). Only what is visibly on the page is
   * described. There is no entry for the video, because this HTML does not
   * put the video on the page, and markup for something that is not there is
   * what search engines penalise.
   *
   * Some site builders strip <script> from pasted HTML. Nothing breaks when
   * they do: the article is unchanged and the schema is simply absent.
   */
  if (schema) {
    const graph: Record<string, unknown>[] = [];
    const headline = sections.headline?.trim();
    const parsed = schema.date ? new Date(schema.date) : new Date();
    const date = (Number.isNaN(parsed.getTime()) ? new Date() : parsed).toISOString().slice(0, 10);
    if (headline) {
      const firstPara = (sections.intro || "").split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
      const description = firstPara.length > 200 ? `${firstPara.slice(0, 197).replace(/\s+\S*$/, "")}…` : firstPara;
      graph.push({
        "@type": "BlogPosting",
        headline,
        ...(description ? { description } : {}),
        ...(sections.headerUrl?.startsWith("https://") ? { image: sections.headerUrl } : {}),
        datePublished: date,
        ...(schema.author?.trim() ? { author: { "@type": "Person", name: schema.author.trim() } } : {}),
        ...(schema.place?.trim() ? { contentLocation: { "@type": "Place", name: schema.place.trim() } } : {}),
      });
    }
    const faqs = articleFaqs(sections.body);
    if (faqs.length) {
      graph.push({
        "@type": "FAQPage",
        mainEntity: faqs.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      });
    }
    if (graph.length) {
      // "<" escaped so nothing in the article's words can close the tag early.
      const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
      blocks.push(`<script type="application/ld+json">${json}</script>`);
    }
  }
  return blocks.join("\n");
}
