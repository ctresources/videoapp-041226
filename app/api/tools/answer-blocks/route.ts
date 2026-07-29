import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * AI Answer Blocks — content written to be QUOTED by AI assistants.
 *
 * When someone asks ChatGPT or Google's AI Overview "what's the best
 * neighborhood in Charlotte for first-time buyers", the model answers from
 * pages it can extract a clean, self-contained answer from. That extraction
 * favours a specific shape: the question as a heading, the answer stated
 * outright in the first two sentences, concrete local specifics, and a named
 * source. This route produces exactly that shape so an agent can paste it
 * onto their own site and become the cited source.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentName, city, state, niche, brokerage } = await req.json() as {
    agentName: string;
    city: string;
    state?: string;
    niche?: string;
    brokerage?: string;
  };

  if (!agentName?.trim()) return NextResponse.json({ error: "agentName required" }, { status: 400 });
  if (!city?.trim()) return NextResponse.json({ error: "city required" }, { status: 400 });

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

Return ONLY this JSON:
{"blocks": [{
  "question": "the exact question as someone would type it to an AI",
  "whyAsked": "one sentence: why this question signals a ready buyer or seller",
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
    return NextResponse.json({ blocks });
  } catch {
    console.error("[answer-blocks] Unparseable model response:", text.slice(0, 400));
    return NextResponse.json(
      { error: "Could not generate answer blocks. Please try again." },
      { status: 502 },
    );
  }
}
