/**
 * The brief, turned into prompt text — shared by every AI Tool.
 *
 * The Tools have always generated with almost nothing: a topic and sometimes a
 * city. Meanwhile the project that topic came from was carrying the audience,
 * the tone and the purpose the script was written to, unread. This turns those
 * three into a block a tool can append, so a title generated on Tuesday is
 * written for the same person, and the same reason, as Monday's script.
 *
 * Every field is optional and an absent one contributes nothing — a tool used
 * standalone behaves exactly as it did before.
 */

export interface ToolBrief {
  audience?: string;
  tone?: string;
  purpose?: string;
}

/** What each purpose changes. Mirrors PURPOSE_SCRIPT_GUIDANCE, shortened for
 *  the shorter assets a tool produces. */
const PURPOSE: Record<string, string> = {
  found: "Written to be found later by someone searching. Prioritise being useful and specific over persuasive; keep any ask light.",
  answer: "Written to answer one question people keep asking. Lead with the answer rather than building to it.",
  appointment: "Written to win a conversation. Be concrete and direct, and make the ask plain.",
  topofmind: "Written for people who are not ready yet. Do not push for a decision — be useful and memorable instead.",
  announce: "Written to announce something specific and time-bound. Lead with what is new and the detail that matters.",
};

const TONE: Record<string, string> = {
  Friendly: "Conversational and warm. Short sentences.",
  Modern: "Clean, direct, professional. No filler.",
  Luxury: "Polished and elevated. Premium vocabulary, no casual phrasing.",
  "High-Energy": "Punchy and urgent. Short bursts, momentum.",
  Educational: "Helpful and authoritative. Explain clearly.",
};

/**
 * A block to append to a tool's user prompt, or "" when nothing was supplied.
 *
 * An audience with no scripted guidance is still named rather than dropped —
 * the same rule as audienceClause in perplexity-prompts, and for the same
 * reason: a value someone typed themselves is the one most worth honouring.
 */
export function briefBlock(b: ToolBrief): string {
  const lines: string[] = [];

  const audience = b.audience?.trim();
  if (audience) {
    lines.push(`Audience: ${audience}. Write for exactly this audience — their situation, their vocabulary, and the questions they specifically would ask. Do not broaden it.`);
  }

  const purpose = b.purpose?.trim();
  if (purpose && PURPOSE[purpose]) lines.push(`Purpose: ${PURPOSE[purpose]}`);

  const tone = b.tone?.trim();
  if (tone) lines.push(`Tone: ${tone}. ${TONE[tone] ?? "Match this tone throughout."}`);

  return lines.length ? `\n\n${lines.join("\n")}` : "";
}
