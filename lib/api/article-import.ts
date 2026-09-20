import { perplexityChat } from "@/lib/api/perplexity";
import { stripLegalBoilerplate, stripTrailingSignature } from "@/lib/utils/email-article";

/**
 * Take an article the agent already has and prepare it for the Share Kit —
 * WITHOUT rewriting a word of it.
 *
 * This is the other half of bringing an article in. The writer route covers a
 * source and produces a new piece, which is right for someone else's
 * newsletter and wrong for your own finished post: there, being handed a second
 * article about the same subject is not a feature. So the text passes through
 * untouched and the AI is used only for the things SparkReels adds around it —
 * the headline, the description, the hashtags and keywords, and headings where
 * the piece has none.
 *
 * The split into intro / body / conclusion is what the Share Kit, the Spark
 * card and blogAsHtml all read, so an imported article has to arrive in the
 * same three parts a generated one does.
 */

export interface PreparedArticle {
  headline: string;
  intro: string;
  body: string;
  conclusion: string;
  description: string;
  hashtags: string[];
  keywords: string[];
  /** True when headings were added because the article arrived with none. */
  headingsAdded: boolean;
}

interface MetadataResponse {
  headline?: string;
  description?: string;
  hashtags?: string[];
  keywords?: string[];
  headings?: { before_paragraph?: number; text?: string }[];
}

/** Heading markers the rest of the app reads. */
const H2 = /^H2:\s*/;
const H3 = /^H3:\s*/;

/**
 * Markdown and plain-text headings become the app's own markers.
 *
 * An article pasted out of a site or a document carries "## Heading" or a bare
 * line in title case. Both are headings the agent wrote, and keeping them is
 * the whole promise of "as it is" — so they are converted rather than left to
 * be read as body text or, worse, replaced by invented ones.
 */
function normaliseHeadings(text: string): { text: string; found: number } {
  let found = 0;
  const lines = text.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line) return "";
    if (H2.test(line) || H3.test(line)) { found++; return line; }
    const md = /^(#{2,6})\s+(.+?)\s*#*$/.exec(line);
    if (md) {
      found++;
      return `${md[1].length === 2 ? "H2" : "H3"}: ${md[2]}`;
    }
    // A heading written as bold on its own line, which is what a word
    // processor's "Heading 2" usually survives as.
    const bold = /^\*\*(.+?)\*\*:?$/.exec(line);
    if (bold && bold[1].length <= 80) { found++; return `H2: ${bold[1]}`; }
    return line;
  });
  return { text: lines.join("\n"), found };
}

/** Paragraph blocks, with headings kept attached to the text beneath them. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * A first line that is the article's own title rather than its first sentence:
 * short, no closing punctuation, and followed by more text. Lifting it means
 * the headline is the agent's own words, and stops it being repeated as the
 * opening paragraph under the <h1>.
 */
function liftHeadline(blocks: string[]): { headline: string | null; blocks: string[] } {
  if (blocks.length < 2) return { headline: null, blocks };
  const first = blocks[0].replace(H2, "").replace(H3, "").trim();
  const isTitle =
    first.length <= 110 &&
    !/[.!?]$/.test(first) &&
    first.split(/\s+/).length <= 16 &&
    !first.includes("\n");
  return isTitle
    ? { headline: first, blocks: blocks.slice(1) }
    : { headline: null, blocks };
}

/**
 * One AI call for everything the article does not already carry.
 *
 * It is explicitly not allowed to return the article: the risk in a route whose
 * promise is "as it is" is a model that helpfully rewrites, so it is asked for
 * metadata and for heading TEXT plus the paragraph number each belongs above.
 * Placement is done here from those numbers, which means the article itself
 * never passes back through the model.
 */
async function askForMetadata(params: {
  blocks: string[];
  fallbackTitle: string;
  city?: string;
  state?: string;
  needHeadings: boolean;
}): Promise<MetadataResponse> {
  const location = [params.city, params.state].filter(Boolean).join(", ");
  const numbered = params.blocks
    .map((p, i) => `[${i + 1}] ${p.slice(0, 400)}`)
    .join("\n\n");

  const headingRule = params.needHeadings
    ? `
"headings": [{"before_paragraph": <number>, "text": "<short heading>"}]
  - Add 3 to 6 headings for an article of this length, spread through it.
  - Each one goes ABOVE the numbered paragraph you name, and must describe the
    section that follows it. Never above paragraph 1.
  - Use the article's own words and its own terms. Do not preview anything the
    article does not say.`
    : `
"headings": []
  - The article already has its own headings. Return an empty list.`;

  const raw = await perplexityChat([
    {
      role: "system",
      content: `You prepare a real estate agent's finished article for publication.

THE ARTICLE IS NOT YOURS TO CHANGE. Never rewrite, summarise, shorten, correct
or return its text. You are writing only the material that goes AROUND it.

Respond with valid JSON only.`,
    },
    {
      role: "user",
      content: `Here is the agent's article, one numbered paragraph per block${location ? `, written for ${location}` : ""}.

${numbered}

Return ONLY this JSON:
{
"headline": "<the article's own title, 50-70 characters — take it from the article's subject, do not invent a claim>",
"description": "<150-160 character summary for search results>",
"hashtags": ["#five", "#relevant", "#hashtags", "#for", "#social"],
"keywords": ["primary keyword", "secondary keyword", "long tail keyword"],${headingRule}
}

The current working title is "${params.fallbackTitle}"${location ? `. The market is ${location}` : ""}.`,
    },
  ]);

  // Same tolerant extraction the rest of the Perplexity helpers use: fences,
  // preamble and trailing commentary all show up eventually.
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  try {
    return JSON.parse(text) as MetadataResponse;
  } catch {
    // Metadata is worth having, not worth losing the article over.
    console.error("article-import: metadata JSON unparseable, using fallbacks");
    return {};
  }
}

export async function prepareImportedArticle(params: {
  text: string;
  fallbackTitle: string;
  city?: string;
  state?: string;
}): Promise<PreparedArticle> {
  // Also here, not only in the email cleaner: text pasted straight in or pulled
  // from a PDF carries the same compliance tail, and on this route it would
  // become the article's closing paragraph.
  const normalised = normaliseHeadings(
    stripTrailingSignature(stripLegalBoilerplate(stripTrailingSignature(params.text))),
  );
  const all = paragraphs(normalised.text);
  const lifted = liftHeadline(all);
  const blocks = lifted.blocks;

  if (blocks.length === 0) throw new Error("There is no article text to import.");

  const needHeadings = normalised.found === 0 && blocks.length >= 4;

  const meta = await askForMetadata({
    blocks,
    fallbackTitle: lifted.headline || params.fallbackTitle,
    city: params.city,
    state: params.state,
    needHeadings,
  }).catch((err) => {
    console.error("article-import: metadata call failed:", err);
    return {} as MetadataResponse;
  });

  // Headings, placed here rather than by the model — see askForMetadata.
  const headingFor = new Map<number, string>();
  if (needHeadings) {
    for (const h of meta.headings ?? []) {
      const at = Number(h.before_paragraph);
      const label = (h.text ?? "").trim();
      // Never above the opening paragraph: the first thing under a headline
      // should be the article, not a second heading.
      if (!label || !Number.isFinite(at) || at < 2 || at > blocks.length) continue;
      headingFor.set(at - 1, label.replace(H2, "").replace(H3, ""));
    }
  }

  const withHeadings = blocks.map((block, i) => {
    const heading = headingFor.get(i);
    return heading ? `H2: ${heading}\n\n${block}` : block;
  });

  /**
   * Intro, body, conclusion — the three parts everything downstream reads.
   * The first paragraph opens, the last closes, and a short piece keeps its
   * conclusion inside the body rather than being cut into thirds that leave
   * one sentence standing alone.
   */
  const intro = withHeadings[0];
  const hasConclusion = withHeadings.length >= 4;
  const body = withHeadings.slice(1, hasConclusion ? -1 : undefined).join("\n\n");
  const conclusion = hasConclusion ? withHeadings[withHeadings.length - 1] : "";

  const headline = (meta.headline ?? "").trim() || lifted.headline || params.fallbackTitle;

  return {
    headline,
    intro,
    body,
    conclusion,
    description: (meta.description ?? "").trim() || intro.slice(0, 160),
    hashtags: (meta.hashtags ?? []).filter((h) => typeof h === "string").slice(0, 8),
    keywords: (meta.keywords ?? []).filter((k) => typeof k === "string").slice(0, 10),
    headingsAdded: headingFor.size > 0,
  };
}
