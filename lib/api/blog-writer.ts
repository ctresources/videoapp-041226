import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES } from "@/lib/utils/copy-style";

/**
 * The blog article that accompanies a video — written from the video's own
 * script, whatever made the video.
 *
 * The blog used to be a by-product of two routes and missing from three. The
 * market flow got one because its single Perplexity call happened to ask for
 * BLOG POST BODY on the end of the script; listings got one from their own
 * call; a camera recording, a pasted script and a photo reel got nothing at
 * all, which is exactly backwards — filming it yourself is the route where the
 * agent has the most to say and the least written down.
 *
 * This is deliberately shaped like generateListingBlog rather than sharing
 * code with it: a listing article is written from structured property fields
 * and must never state a fact the listing does not contain, where this one is
 * written from words somebody already said. The two prompts want to diverge.
 *
 * Never throws. A blog is an extra on top of a video that already exists, and
 * is never worth failing a request over — every caller treats null as "no blog
 * this time" and moves on.
 */

export interface BlogArticle {
  intro: string;
  body: string;
  conclusion: string;
}

export interface BlogFromScriptInput {
  /** The video's title, used as the article's subject. */
  title: string;
  /** What was said. The article covers the same ground, at length. */
  script: string;
  city?: string | null;
  state?: string | null;
  agentName?: string | null;
  /** MLS unbranded: no agent, no brokerage, no contact ask. */
  unbranded?: boolean;
}

export async function generateBlogFromScript(
  input: BlogFromScriptInput,
): Promise<BlogArticle | null> {
  const script = (input.script || "").trim();
  // Below this there is nothing to expand on, and the model would invent the
  // article rather than write it. Better no blog than a fabricated one.
  if (script.length < 200) return null;
  if (!process.env.PERPLEXITY_API_KEY) return null;

  const where = [input.city, input.state].filter(Boolean).join(", ");
  const place = where || "the local area";

  const prompt = `${FAIR_HOUSING_GUARDRAIL}

---

Write a blog article for a real estate agent's own website, around 1,000 words total. It accompanies a video on the same subject, so it must stand entirely on its own — never refer to "the video", "this clip", "watch above" or anything the reader cannot see.

SUBJECT: ${input.title}
${where ? `LOCATION: ${where}` : ""}

WHAT WAS SAID IN THE VIDEO — cover this same ground, in writing, with the detail a spoken script had no room for:
"""
${script.slice(0, 6000)}
"""

SEARCH + ANSWER-ENGINE OPTIMISATION (this is the point of the article):
- Open with two or three plain declarative sentences that state the subject and the place outright, in language an AI assistant can quote back as an answer to a question. No scene-setting, no rhetorical questions.
- Give the body 4–6 sections, each headed with a line beginning exactly "H2: ". Write each heading as the question a reader would actually type or say out loud — for example "H2: What is happening to prices in ${place}?" rather than "H2: Market conditions".
- Answer each heading in the FIRST sentence under it, then support the answer. An answer engine reads the first sentence; a section that warms up before answering is a section it skips.
- Name ${place} naturally throughout, along with any neighbourhoods, streets or landmarks the script mentions. This is a local search page and the place name is the thing it has to win on.
- Keep every figure, date and proper noun exactly as the script gave it. Do not round, do not invent, and do not add a statistic the script does not contain. Where the script is vague, stay vague — a made-up number is worse than a missing one.
- Close the conclusion with the single practical next step a reader should take.

FAIR HOUSING (overrides everything above):
- Never mention schools, churches, demographics, neighbourhood composition, safety, crime, or who an area would "suit".
- Write about places and property. Never about the people who live there.
${input.unbranded
  ? "- UNBRANDED: do not name an agent, brokerage, team, phone number, email or website anywhere, and do not invite the reader to make contact."
  : input.agentName
    ? `- Close by inviting the reader to get in touch with ${input.agentName}.`
    : "- Close by inviting the reader to get in touch."}

FORMAT — plain text, no markdown, no asterisks, no bullet characters, no numbered lists, no emoji:
- Headings are their own line, starting with "H2: ".
- Paragraphs are separated by a blank line.

${PLAIN_COPY_RULES}

Return ONLY a JSON object:
{
  "intro": "opening ~150 words, no heading",
  "body": "the H2 sections, ~700 words",
  "conclusion": "closing ~150 words, no heading"
}`;

  try {
    // One retry on 429, honouring Retry-After — the same treatment the listing
    // blog gets, and for the same reason: the account's rate limit is shared
    // with whatever else is generating at that moment.
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
          temperature: 0.7,
          max_tokens: 2600,
        }),
      });
      if (res.status !== 429 || attempt === 1) break;
      const retryAfter = Number(res.headers.get("retry-after")) || 3;
      console.warn(`[blog-writer] rate-limited, retrying in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 8) * 1000));
    }
    if (!res || !res.ok) throw new Error(`status ${res?.status ?? "no response"}`);

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as Partial<BlogArticle>;

    const article: BlogArticle = {
      intro: (parsed.intro ?? "").trim(),
      body: (parsed.body ?? "").trim(),
      conclusion: (parsed.conclusion ?? "").trim(),
    };
    // An empty body is the failure that matters — the intro alone is not an
    // article, and storing one would light up the Share Kit card with nothing
    // worth copying under it.
    if (!article.body) throw new Error("no body in response");
    return article;
  } catch (err) {
    console.error("[blog-writer] failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}
