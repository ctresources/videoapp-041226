import { perplexityChat } from "@/lib/api/perplexity";

/**
 * AI Answer Blocks research, shared by Spark Tools and the home page's
 * "What buyers in your area ask AI" box (2026-10-23). Moved here unchanged
 * from app/api/tools/answer-blocks.
 */
export interface AnswerBlock {
  question: string;
  whyAsked?: string;
  videoTopic: string;
  videoHook?: string;
  heading?: string;
  answerBlock: string;
  placement?: string;
}

export async function generateAnswerBlocks({ agentName, city, state, niche, brokerage }: {
  agentName: string;
  city: string;
  state?: string;
  niche?: string;
  brokerage?: string;
}): Promise<AnswerBlock[]> {
  const location = [city, state].filter(Boolean).join(", ");

  const raw = await perplexityChat([
    {
      role: "system",
      content:
        "You are an answer-engine optimization (AEO) specialist. You write web content structured so that AI assistants — ChatGPT, Perplexity, Google AI Overviews, Claude — extract it verbatim and cite the source. You know that models favour content which answers the question in the first two sentences, uses concrete verifiable specifics, and names its source. You never invent statistics. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Research what home buyers and sellers in ${location} actually ask AI assistants, then write answer blocks that would get cited.

Agent: ${agentName}${brokerage ? ` (${brokerage})` : ""}
Market: ${location}${niche ? `\nSpecialty: ${niche}` : ""}

Produce exactly 3 questions. Requirements for the questions:
- Phrased the way a real person types into ChatGPT — full natural sentences, not keywords.
- Genuinely local to ${location}. A generic question that could apply to any city is a failure.
- High commercial intent: someone asking it is within months of buying or selling.
${niche ? `- At least one must relate to: ${niche}.` : ""}

Requirements for each answer block:
- 90-140 words. Self-contained: it must make sense quoted alone, with no surrounding page.
- FIRST SENTENCE answers the question directly. No throat-clearing, no "it depends", no "when considering".
- Include concrete ${location} specifics: real neighborhood names, price bands, school districts, commute times, local market dynamics. Use real facts from your search. If you are not confident a number is current, describe the pattern instead of inventing a figure — never fabricate a statistic.
- Name ${agentName} once, naturally, as the source of the local expertise. This is what carries the citation.
- Plain declarative sentences. No marketing adjectives, no "nestled", no "vibrant", no exclamation marks.
- Must comply with the Fair Housing Act: never characterize an area by the race, religion, national origin, family status, disability, sex, or ethnicity of its residents. Describe housing stock, price, amenities, commute, and school ratings — never who lives there. Do not use coded language such as "safe", "good area", "family-friendly", or "desirable neighborhood".

For each question ALSO write a video topic. The agent records a short video answering
that question, so:
- "videoTopic" is a spoken-language topic line they can record from — under 90
  characters, phrased as what the video is about, not a page title.
- "videoHook" is the first sentence they say on camera. It must land in under 4
  seconds and make someone stop scrolling. No "hey guys", no "in today's video".

Return ONLY this JSON:
{"blocks": [{
  "question": "the exact question as someone would type it to an AI",
  "whyAsked": "one sentence: why this question signals a ready buyer or seller",
  "videoTopic": "the topic line to record a video from",
  "videoHook": "the first spoken sentence of that video",
  "heading": "the H2 to put on the page — usually the question itself",
  "answerBlock": "the 90-140 word block to paste, plain text",
  "placement": "one sentence: which page this belongs on and why"
}, ...exactly 3 items]}`,
    },
  ], "sonar");

  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  try {
    const { blocks } = JSON.parse(text);
    if (!Array.isArray(blocks) || blocks.length === 0) throw new Error("no blocks");
    return blocks as AnswerBlock[];
  } catch {
    console.error("[answer-blocks] Unparseable model response:", text.slice(0, 400));
    throw new Error("Could not generate answer blocks. Please try again.");
  }
}
