import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES, plainCopy, plainCopyAll } from "@/lib/utils/copy-style";
import type { EmailVersion } from "@/lib/utils/email-html";

/**
 * The email version of a blog post: subject lines, the inbox preview, and a
 * short body that gives the reader the gist and sends them to the full post.
 *
 * It replaces the 60-80 word "email blurb" the SEO pass wrote, which was
 * written from the first 500 characters of the SCRIPT, not the article, and
 * was a paragraph with nowhere to go. An email that summarises a post has one
 * job, the click, so everything here serves the button.
 */

function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

export async function writeEmailVersion(input: {
  headline: string;
  /** The article as plain text, headings included. */
  article: string;
  agentName?: string | null;
  market?: string | null;
}): Promise<EmailVersion | null> {
  const system = `You write short real estate email newsletters that summarise a blog post and get the reader to click through to it. Return only valid JSON.

FACTS RULE: Use only what the article says. No figures, names, places or claims it does not contain. Do not search the web.

${PLAIN_COPY_RULES}

${FAIR_HOUSING_GUARDRAIL}`;

  const prompt = `Write the email version of this blog post${input.agentName ? ` for ${input.agentName}` : ""}${input.market ? `, a real estate agent in ${input.market}` : ""}. It goes to their past clients and contacts, who know them.

HEADLINE: ${input.headline}

ARTICLE:
"""
${input.article.slice(0, 7000)}
"""

The body (greeting, opening, points and closing together) is 120 to 200 words. First person, warm, like a note from someone they know, not a press release. Contractions are fine.

Return ONLY this JSON:
{
  "subjects": ["3 different subject lines, each under 60 characters. Specific to the post, curious rather than clickbait. No emoji, no all caps, no 'RE:' tricks"],
  "preview": "Inbox preview text, 40 to 90 characters, that adds to the subject line instead of repeating it",
  "greeting": "A short greeting line, e.g. 'Hi there,'",
  "opening": "One or two sentences on why this post matters to the reader right now",
  "points": ["2 or 3 of the post's most useful specifics, one sentence each, taken from the article"],
  "closing": "One sentence that leads into the button, e.g. what they will get from the full post",
  "button": "Button text, 2 to 5 words, e.g. 'Read the full post'"
}`;

  try {
    const d = parseJson<Partial<EmailVersion>>(await perplexityChat([
      { role: "system", content: system },
      { role: "user", content: prompt },
    ], "sonar"));
    const subjects = plainCopyAll(d.subjects).map((s) => s.replace(/[.]$/, "")).slice(0, 3);
    const opening = plainCopy(d.opening ?? "");
    if (!subjects.length || !opening) return null;
    return {
      subjects,
      preview: plainCopy(d.preview ?? ""),
      greeting: plainCopy(d.greeting ?? "") || "Hi there,",
      opening,
      points: plainCopyAll(d.points).slice(0, 3),
      closing: plainCopy(d.closing ?? ""),
      button: plainCopy(d.button ?? "").replace(/[.]$/, "") || "Read the full post",
    };
  } catch (e) {
    console.error("[email-version] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
