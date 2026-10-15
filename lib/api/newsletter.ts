import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES, plainCopy, plainCopyAll } from "@/lib/utils/copy-style";
import type { Newsletter } from "@/lib/utils/newsletter-html";

/**
 * A newsletter made from two to five of the agent's blog posts (2026-10-15,
 * the owner's mock): a short note, a few lines on each post with its own Read
 * more button, and the sign-off. Like the single post's email version, it is
 * copied into the agent's own email tool; SparkReels sends nothing but tests.
 */

function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

export async function writeNewsletter(input: {
  posts: { id: string; headline: string; article: string }[];
  agentName?: string | null;
  market?: string | null;
}): Promise<Newsletter | null> {
  const system = `You write short real estate email newsletters that bring together a few of an agent's blog posts and get readers to click through to them. Return only valid JSON.

FACTS RULE: Use only what the posts say. No figures, names, places or claims they do not contain. Do not search the web.

${PLAIN_COPY_RULES}

${FAIR_HOUSING_GUARDRAIL}`;

  // Each post gets an even share of the room, so five posts still fit.
  const room = Math.floor(9000 / input.posts.length);
  const posts = input.posts
    .map((p, i) => `POST ${i + 1}\nHEADLINE: ${p.headline}\nARTICLE:\n"""\n${p.article.slice(0, room)}\n"""`)
    .join("\n\n");

  const prompt = `Write a newsletter${input.agentName ? ` from ${input.agentName}` : ""}${input.market ? `, a real estate agent in ${input.market}` : ""}, that brings together these ${input.posts.length} blog posts. It goes to their past clients and contacts, who know them.

${posts}

First person, warm, like a note from someone they know, not a press release. Contractions are fine. The whole thing reads in under two minutes.

Return ONLY this JSON:
{
  "subjects": ["3 different subject lines, each under 60 characters, that cover the issue as a whole. Curious rather than clickbait. No emoji, no all caps"],
  "preview": "Inbox preview text, 40 to 90 characters, that adds to the subject line instead of repeating it",
  "greeting": "A short greeting line, e.g. 'Hi there,'",
  "opening": "Two or three sentences: what's going on locally right now that ties these posts together, and why the reader should care",
  "items": [${input.posts.map((_, i) => `{ "post": ${i + 1}, "title": "the post's headline, shortened to under 70 characters if needed", "teaser": "one or two sentences on the most useful thing in post ${i + 1}, taken from it, that make the reader want the rest" }`).join(", ")}],
  "closing": "One sentence inviting them to reply or reach out",
  "button": "Button text for each post, 2 or 3 words, e.g. 'Read more'"
}`;

  try {
    const d = parseJson<{
      subjects?: string[]; preview?: string; greeting?: string; opening?: string;
      items?: { post?: number; title?: string; teaser?: string }[]; closing?: string; button?: string;
    }>(await perplexityChat([
      { role: "system", content: system },
      { role: "user", content: prompt },
    ], "sonar"));
    const subjects = plainCopyAll(d.subjects).map((s) => s.replace(/[.]$/, "")).slice(0, 3);
    const opening = plainCopy(d.opening ?? "");
    if (!subjects.length || !opening) return null;
    // Back onto the posts by number, in the order they were picked; a post the
    // model skipped keeps its own headline and no teaser rather than vanishing.
    const items = input.posts.map((p, i) => {
      const it = (d.items ?? []).find((x) => Number(x.post) === i + 1) ?? d.items?.[i];
      return {
        projectId: p.id,
        title: plainCopy(it?.title ?? "") || p.headline,
        teaser: plainCopy(it?.teaser ?? ""),
      };
    });
    return {
      subjects,
      preview: plainCopy(d.preview ?? ""),
      greeting: plainCopy(d.greeting ?? "") || "Hi there,",
      opening,
      items,
      closing: plainCopy(d.closing ?? ""),
      button: plainCopy(d.button ?? "").replace(/[.]$/, "") || "Read more",
    };
  } catch (e) {
    console.error("[newsletter] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
