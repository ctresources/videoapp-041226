import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES, plainCopy, plainCopyAll } from "@/lib/utils/copy-style";
import { sellerStatRows, type SellerStats, type SellerUpdateEmail } from "@/lib/utils/newsletter-html";

/**
 * The weekly email to a listing's sellers (2026-10-15, the owner's mock).
 *
 * Written only from what the agent typed: this week's numbers, last week's,
 * the buyers' feedback and the next steps. The figures themselves are drawn
 * by the email layout from the numbers as typed, never by the model, so a
 * number in the box cannot come out different in the email.
 */

function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

export async function writeSellerUpdate(input: {
  address: string;
  sellerNames?: string | null;
  listPrice?: string | null;
  daysOnMarket?: number | null;
  weekNumber?: number | null;
  stats: SellerStats;
  before?: SellerStats | null;
  feedback?: string | null;
  nextSteps?: string | null;
  agentName?: string | null;
}): Promise<SellerUpdateEmail | null> {
  const system = `You write a listing agent's weekly update email to the people selling their home. Return only valid JSON.

FACTS RULE: Use only the facts given below. Never invent a number, a buyer, a comment, an event or a market claim. If a number is not given, do not mention it. Do not search the web.

${PLAIN_COPY_RULES}

${FAIR_HOUSING_GUARDRAIL}`;

  const figures = sellerStatRows(input.stats, input.before)
    .map((r) => `- ${r.label}: ${r.value}${r.change !== null ? ` (last week ${r.value - r.change})` : ""}`)
    .join("\n");

  const prompt = `Write this week's update${input.agentName ? ` from ${input.agentName}` : ""} to the sellers of ${input.address}.

SELLERS' FIRST NAMES: ${input.sellerNames?.trim() || "(not given; greet them warmly without names)"}
${input.listPrice?.trim() ? `LIST PRICE: ${input.listPrice.trim()}\n` : ""}${typeof input.daysOnMarket === "number" ? `DAYS ON MARKET: ${input.daysOnMarket}\n` : ""}${input.weekNumber ? `THIS IS UPDATE NUMBER: ${input.weekNumber}\n` : ""}
THIS WEEK'S FIGURES (shown to them as a row of numbers above your words, so don't list them again; mention one only if it says something):
${figures || "(none given)"}

BUYER FEEDBACK, in the agent's words:
"""
${input.feedback?.trim() || "(none this week)"}
"""

NEXT STEPS, in the agent's words:
"""
${input.nextSteps?.trim() || "(none given)"}
"""

Warm, honest and calm, in the first person, like the agent talking to clients they respect. Put criticism from buyers kindly but plainly; sellers need to hear it. Don't oversell a slow week, and don't alarm them. 90 to 170 words in all.

Return ONLY this JSON:
{
  "subjects": ["2 subject lines under 60 characters that name the street address, e.g. '12 Oak Lane: your week 2 update'"],
  "greeting": "e.g. 'Hi Dan and Lisa,'",
  "opening": "One sentence introducing this week's numbers, which appear right after it",
  "paragraphs": ["1 to 3 short paragraphs: what buyers said and what it means, then the next steps"],
  "closing": "One short sentence inviting questions or a call"
}`;

  try {
    const d = parseJson<Partial<SellerUpdateEmail>>(await perplexityChat([
      { role: "system", content: system },
      { role: "user", content: prompt },
    ], "sonar"));
    const subjects = plainCopyAll(d.subjects).map((s) => s.replace(/[.]$/, "")).slice(0, 2);
    const paragraphs = plainCopyAll(d.paragraphs).slice(0, 3);
    if (!subjects.length || !paragraphs.length) return null;
    return {
      subjects,
      greeting: plainCopy(d.greeting ?? "") || "Hi there,",
      opening: plainCopy(d.opening ?? "") || `Here's how ${input.address} did this week.`,
      paragraphs,
      closing: plainCopy(d.closing ?? ""),
    };
  } catch (e) {
    console.error("[seller-update] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
