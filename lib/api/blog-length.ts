import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES } from "@/lib/utils/copy-style";

/**
 * How long an SEO/AEO/GEO article should be, and the one follow-up pass that
 * holds it there.
 *
 * Both article writers asked for "around 1,000 words" and kept whatever came
 * back. Sonar treats a word target as a suggestion, and the rules that keep an
 * article honest (invent nothing, cut a sentence you cannot make specific) give
 * it reasons to stop early. A listing with a 250-word description and seven
 * features came back at 433 words; another with a 257-word description, five
 * days earlier, came back at 817. Nothing was cut off: max_tokens had room for
 * twice that.
 *
 * So the prompts now give a range with a floor for each part, and an article
 * that still lands under ARTICLE_EXPAND_BELOW gets one rewrite asking for depth
 * from the same source. One pass, not a loop. A second short answer is kept
 * rather than fought over, because an honest 650 words beats a padded 1,000.
 */

export const ARTICLE_MIN_WORDS = 800;
export const ARTICLE_MAX_WORDS = 1200;
/** Under this, the article gets its one expand pass. */
export const ARTICLE_EXPAND_BELOW = 700;

export interface ArticleParts {
  headline?: string;
  intro: string;
  body: string;
  conclusion: string;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The same count the Share Kit shows: intro, body and conclusion, headings included. */
export function articleWordCount(a: ArticleParts): number {
  return countWords([a.intro, a.body, a.conclusion].filter(Boolean).join(" "));
}

/**
 * Returns the article unchanged when it is long enough, and a longer rewrite
 * when it is not. Never throws, and never returns something shorter than it was
 * given: any failure, or a rewrite that did not grow, hands back the original.
 */
export async function expandShortArticle<T extends ArticleParts>(
  article: T,
  opts: {
    /** Everything the article may draw on. The rewrite is held to this, not to the draft. */
    source: string;
    /** How the article has to close: the agent's invitation, or the unbranded rule. */
    closingRule: string;
    /** Names the caller in the logs. */
    label: string;
  },
): Promise<T> {
  const before = articleWordCount(article);
  if (before >= ARTICLE_EXPAND_BELOW || !process.env.PERPLEXITY_API_KEY) return article;

  const prompt = `${FAIR_HOUSING_GUARDRAIL}

---

This article draft is ${before} words. It must be between ${ARTICLE_MIN_WORDS} and ${ARTICLE_MAX_WORDS} words. Rewrite it to that length.

SOURCE. These are the only facts the article may contain:
"""
${opts.source.slice(0, 6000)}
"""

DRAFT:
${JSON.stringify({ intro: article.intro, body: article.body, conclusion: article.conclusion })}

HOW TO ADD LENGTH (depth, never padding):
- Keep every heading line ("H2: " and "H3: ") exactly as written and in the same order. Keep each section's first sentence a direct answer to its heading.
- Under each heading, add the detail the source supports and the draft skipped: what each named feature means day to day, how the rooms or the points connect, and the specifics of the place the source gives.
- Intro at least 120 words, every H2 section at least 110 words, conclusion at least 100 words.
- Never add a fact, figure, name or claim the source does not contain. Where the source runs out, stop rather than invent.
- Never repeat a point already made, and never add filler about how stunning, perfect or beautiful something is.
${opts.closingRule}

FORMAT, plain text, no markdown, no asterisks, no numbered lists:
- Headings are their own line, starting with "H2: " or "H3: ".
- Paragraphs are separated by a blank line.

${PLAIN_COPY_RULES}

Return ONLY a JSON object with the same three keys:
{
  "intro": "...",
  "body": "...",
  "conclusion": "..."
}`;

  try {
    console.log(`[blog-length] ${opts.label}: draft is ${before} words, expanding`);
    // One retry on 429, honouring Retry-After, like the writers that call this:
    // it is the last of several Perplexity calls in the same request.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6,
          // 1,200 words across three JSON strings, escaped newlines included.
          max_tokens: 3200,
        }),
      });
      if (res.status !== 429 || attempt === 1) break;
      const retryAfter = Number(res.headers.get("retry-after")) || 3;
      console.warn(`[blog-length] rate-limited, retrying in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 8) * 1000));
    }
    if (!res || !res.ok) throw new Error(`status ${res?.status ?? "no response"}`);

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ArticleParts>;

    const expanded: T = {
      ...article,
      intro: (parsed.intro ?? "").trim() || article.intro,
      body: (parsed.body ?? "").trim(),
      conclusion: (parsed.conclusion ?? "").trim() || article.conclusion,
    };
    const after = articleWordCount(expanded);
    if (!expanded.body || after <= before) {
      console.warn(`[blog-length] ${opts.label}: rewrite did not grow (${after} words), keeping the draft`);
      return article;
    }
    console.log(`[blog-length] ${opts.label}: expanded ${before} → ${after} words`);
    return expanded;
  } catch (err) {
    console.error(`[blog-length] ${opts.label}: expand failed (non-fatal):`, err instanceof Error ? err.message : err);
    return article;
  }
}
