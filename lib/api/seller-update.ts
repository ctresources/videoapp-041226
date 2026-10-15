import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES, plainCopy, plainCopyAll } from "@/lib/utils/copy-style";
import { sellerStatRows, type SellerStats, type SellerUpdateEmail } from "@/lib/utils/newsletter-html";

/**
 * The update email to a listing's sellers, and the script for a video update
 * to go with it (2026-10-15, the owner's mock).
 *
 * Written only from what the agent typed: this update's numbers, the last
 * update's, the buyers' feedback and the next steps. The figures themselves
 * are drawn by the email layout from the numbers as typed, never by the model,
 * so a number in the box cannot come out different in the email.
 *
 * Updates are dated the day they're written and can go out whenever the agent
 * likes, so "since my last update", never "this week".
 */

function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

export interface SellerUpdateFacts {
  address: string;
  sellerNames?: string | null;
  listPrice?: string | null;
  daysOnMarket?: number | null;
  /** 1 for the first update on this listing. */
  updateNumber?: number | null;
  /** This update's date and the last one's, as "Oct 15". */
  updateOn?: string | null;
  lastUpdateOn?: string | null;
  stats: SellerStats;
  before?: SellerStats | null;
  feedback?: string | null;
  nextSteps?: string | null;
  agentName?: string | null;
}

const SYSTEM = `You write for a listing agent talking to the people selling their home. Return only valid JSON.

FACTS RULE: Use only the facts given below. Never invent a number, a buyer, a comment, an event or a market claim. If a number is not given, do not mention it. Do not search the web.

${PLAIN_COPY_RULES}

${FAIR_HOUSING_GUARDRAIL}`;

/** The facts block both writers share. */
function factsBlock(f: SellerUpdateFacts): string {
  const figures = sellerStatRows(f.stats, f.before)
    .map((r) => `- ${r.label}: ${r.value}${r.change !== null ? ` (at the last update${f.lastUpdateOn ? `, ${f.lastUpdateOn}` : ""}: ${r.value - r.change})` : ""}`)
    .join("\n");
  return `PROPERTY: ${f.address}
SELLERS' FIRST NAMES: ${f.sellerNames?.trim() || "(not given; greet them warmly without names)"}
${f.listPrice?.trim() ? `LIST PRICE: ${f.listPrice.trim()}\n` : ""}${typeof f.daysOnMarket === "number" ? `DAYS ON MARKET: ${f.daysOnMarket}\n` : ""}${f.updateNumber ? `THIS IS UPDATE NUMBER: ${f.updateNumber}\n` : ""}${f.updateOn ? `DATE: ${f.updateOn}\n` : ""}${f.lastUpdateOn ? `LAST UPDATE WAS: ${f.lastUpdateOn}\n` : ""}
FIGURES SINCE THE LAST UPDATE:
${figures || "(none given)"}

BUYER FEEDBACK, in the agent's words:
"""
${f.feedback?.trim() || "(none this time)"}
"""

NEXT STEPS, in the agent's words:
"""
${f.nextSteps?.trim() || "(none given)"}
"""`;
}

export async function writeSellerUpdate(input: SellerUpdateFacts & { hasVideo?: boolean }): Promise<SellerUpdateEmail | null> {
  const prompt = `Write the update email${input.agentName ? ` from ${input.agentName}` : ""} to the sellers of ${input.address}.

${factsBlock(input)}

The figures are shown to them as a row of numbers right after your opening sentence, so don't list them again; mention one only if it says something.${input.hasVideo ? " A short video from the agent also sits above the numbers, so the opening sentence says they recorded a quick video update." : ""}

Warm, honest and calm, in the first person, like the agent talking to clients they respect. Put criticism from buyers kindly but plainly; sellers need to hear it. Don't oversell a slow stretch, and don't alarm them. Say "since my last update", never "this week". 90 to 170 words in all.

Return ONLY this JSON:
{
  "subjects": ["2 subject lines under 60 characters that name the street address, e.g. '12 Oak Lane: your update for Oct 15'"],
  "greeting": "e.g. 'Hi Dan and Lisa,'",
  "opening": "One sentence introducing the numbers, which appear right after it",
  "paragraphs": ["1 to 3 short paragraphs: what buyers said and what it means, then the next steps"],
  "closing": "One short sentence inviting questions or a call"
}`;

  try {
    const d = parseJson<Partial<SellerUpdateEmail>>(await perplexityChat([
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ], "sonar"));
    const subjects = plainCopyAll(d.subjects).map((s) => s.replace(/[.]$/, "")).slice(0, 2);
    const paragraphs = plainCopyAll(d.paragraphs).slice(0, 3);
    if (!subjects.length || !paragraphs.length) return null;
    return {
      subjects,
      greeting: plainCopy(d.greeting ?? "") || "Hi there,",
      opening: plainCopy(d.opening ?? "") || `Here's how ${input.address} is doing since my last update.`,
      paragraphs,
      closing: plainCopy(d.closing ?? ""),
    };
  } catch (e) {
    console.error("[seller-update] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * What the agent reads off the teleprompter for a video update: 45 to 60
 * seconds, spoken to the sellers by name, from the same facts as the email.
 */
export async function writeSellerVideoScript(input: SellerUpdateFacts): Promise<string | null> {
  const prompt = `Write what ${input.agentName || "the agent"} says on camera in a short video update to the sellers of ${input.address}. They read it off a teleprompter.

${factsBlock(input)}

110 to 150 words, about 45 to 60 seconds spoken. Talk straight to the sellers, by first name if given. Natural spoken sentences, short and easy to say aloud, no lists, no headings, no stage directions. Lead with the most encouraging true thing, then what buyers said, then the next steps, then a warm sign-off. Mention at most two numbers, rounded the way people say them. Say "since my last update", never "this week".

Return ONLY this JSON:
{ "script": "the words to read" }`;

  try {
    const d = parseJson<{ script?: string }>(await perplexityChat([
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ], "sonar"));
    const script = plainCopy(d.script ?? "");
    return script.split(/\s+/).length >= 40 ? script : null;
  } catch (e) {
    console.error("[seller-video-script] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
