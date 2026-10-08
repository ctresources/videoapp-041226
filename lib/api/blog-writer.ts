import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { faqInstruction } from "@/lib/api/article-faq";
import { PLAIN_COPY_RULES } from "@/lib/utils/copy-style";
import { expandShortArticle } from "@/lib/api/blog-length";
import { briefBlock } from "@/lib/api/brief-context";

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
  /**
   * The article's own title, phrased as a question.
   *
   * Optional because every article written before this existed has none, and
   * the callers fall back to the video's title — a missing headline must read
   * as "not written yet", never as an empty <h1>.
   */
  headline?: string;
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
  /**
   * The brief the video was written to: who it is for, how it sounds, what it
   * is for. A market video's blog is written in the same call as its script
   * and has always had these; this writer, which every other route and the
   * "Write the article" button use, had none, so the article was written for
   * nobody in particular even when the project said who.
   */
  audience?: string | null;
  tone?: string | null;
  purpose?: string | null;
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

  const closingRule = input.unbranded
    ? "- UNBRANDED: do not name an agent, brokerage, team, phone number, email or website anywhere, and do not invite the reader to make contact."
    : input.agentName
      ? `- Close by inviting the reader to get in touch with ${input.agentName}.`
      : "- Close by inviting the reader to get in touch.";

  const brief = briefBlock({
    audience: input.audience ?? undefined,
    tone: input.tone ?? undefined,
    purpose: input.purpose ?? undefined,
  });
  // The audience shapes which questions the headings answer and what gets
  // explained; it must never turn into a claim about who an area suits, which
  // is the fair-housing line this prompt already draws below.
  const briefSection = brief
    ? `
WHO IT IS FOR AND WHY (the same brief the video was written to):${brief}
- Let the audience decide which questions the headings answer, what to explain and what to skip, and the words you use. It never becomes a statement about who an area suits or who lives there.
`
    : "";

  const prompt = `${FAIR_HOUSING_GUARDRAIL}

---

Write a blog article for a real estate agent's own website, between 1,000 and 1,500 words total. An article under 800 words is unfinished. It accompanies a video on the same subject, so it must stand entirely on its own — never refer to "the video", "this clip", "watch above" or anything the reader cannot see.

SUBJECT: ${input.title}
${where ? `LOCATION: ${where}` : ""}

WHAT WAS SAID IN THE VIDEO — cover this same ground, in writing, with the detail a spoken script had no room for:
"""
${script.slice(0, 6000)}
"""
${briefSection}
SEO, GEO AND AEO (this is the point of the article — it is written for three surfaces at once):
- SEO (Google and Bing): name ${place} naturally throughout, along with any neighbourhoods, streets or landmarks the script mentions. This is a local search page and the place name is the thing it has to win on.
- GEO (generative engines — ChatGPT, Perplexity, Gemini): open with two or three plain declarative sentences that state the subject and the place outright, in language an AI assistant can quote back as an answer to a question. No scene-setting, no rhetorical questions. Build on explicit named entities — the town, the year, real figures — so an assistant can lift a sentence and cite it.
- AEO (answer engines, voice search, featured snippets): give the body 4–6 sections, each headed with a line beginning exactly "H2: ". Write each heading as the question a reader would actually type or say out loud — for example "H2: What is happening to prices in ${place}?" rather than "H2: Market conditions". Answer each heading in the FIRST sentence under it, then support the answer. An answer engine reads the first sentence; a section that warms up before answering is a section it skips.
- SUBHEADINGS: where a section covers more than one distinct point, break it with lines beginning exactly "H3: ". Write those as questions too, narrower than the H2 above them. Use them where they earn their place — a section with one idea does not need one.
${faqInstruction(place, "the script")}
- Keep every figure, date and proper noun exactly as the script gave it. Do not round, do not invent, and do not add a statistic the script does not contain. Where the script is vague, stay vague — a made-up number is worse than a missing one.
- Close the conclusion with the single practical next step a reader should take.
- GENERICITY CHECK, before you finish: reread the article and ask whether it could be republished for a different town by changing only the town name. If it could, it is too generic — go back and add the neighbourhoods, streets, price bands and comparisons the script gives you that make it true only here. Do not invent detail to pass this check; where the script is thin on a point, cut the point rather than fake it.

FAIR HOUSING (overrides everything above):
- Never mention churches, demographics, neighbourhood composition, safety, crime, or who an area would "suit".
- Schools: only a school district or school rating the script itself gives, with any rating credited to GreatSchools or Niche. Never describe a school by who attends it, and never use schools to say who an area is for.
- Write about places and property. Never about the people who live there.
${closingRule}

FORMAT — plain text, no markdown, no asterisks, no bullet characters, no numbered lists, no emoji:
- Headings are their own line, starting with "H2: ".
- Subheadings are their own line, starting with "H3: ".
- Paragraphs are separated by a blank line.

${PLAIN_COPY_RULES}

Return ONLY a JSON object:
{
  "headline": "the article's title, written as the question a reader would type or say out loud, naming ${place}, under 70 characters",
  "intro": "opening, at least 120 words, no heading",
  "body": "the H2 sections with their H3 subheadings, each at least 110 words and 650 to 950 words between them, then the Frequently Asked Questions section with its six questions",
  "conclusion": "closing, at least 100 words, no heading"
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
          max_tokens: 3800,
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
      headline: (parsed.headline ?? "").trim() || undefined,
      intro: (parsed.intro ?? "").trim(),
      body: (parsed.body ?? "").trim(),
      conclusion: (parsed.conclusion ?? "").trim(),
    };
    // An empty body is the failure that matters — the intro alone is not an
    // article, and storing one would light up the Share Kit card with nothing
    // worth copying under it.
    if (!article.body) throw new Error("no body in response");
    return await expandShortArticle(article, {
      source: `SUBJECT: ${input.title}\n${where ? `LOCATION: ${where}\n` : ""}WHAT WAS SAID:\n${script.slice(0, 6000)}`,
      closingRule,
      label: "script",
    });
  } catch (err) {
    console.error("[blog-writer] failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}
