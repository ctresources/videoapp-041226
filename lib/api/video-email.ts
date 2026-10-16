import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES, plainCopy } from "@/lib/utils/copy-style";

/**
 * The subject and short note for emailing a video from My Sparks to a few
 * chosen contacts (2026-10-15, the owner's mock). Personal, not a campaign:
 * it reads like the agent sending a friend something they made.
 */

function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

export async function writeVideoEmail(input: {
  title: string;
  about?: string | null;
  agentName?: string | null;
  market?: string | null;
}): Promise<{ subject: string; note: string } | null> {
  const prompt = `${input.agentName || "A real estate agent"}${input.market ? ` in ${input.market}` : ""} is emailing a short video they made to a few people they know: clients, past clients and friends.

VIDEO TITLE: ${input.title}
${input.about?.trim() ? `WHAT IT COVERS:\n"""\n${input.about.trim().slice(0, 2500)}\n"""\n` : ""}
Write the subject line and the short note that sits above the video.

The note: 35 to 60 words, first person, warm and casual, like a personal email. Start with "Hi {first name}," exactly like that (it becomes each reader's name). Say in a sentence what the video covers and why they might care, then one easy line inviting a reply. No sign-off, no name, no links; those are added after. Use only what the title and summary say.

Return ONLY this JSON:
{ "subject": "under 55 characters, specific, no emoji, no all caps", "note": "the note" }`;

  try {
    const d = parseJson<{ subject?: string; note?: string }>(await perplexityChat([
      {
        role: "system",
        content: `You write short personal emails for a real estate agent. Return only valid JSON. Do not search the web; use only what you are given.\n\n${PLAIN_COPY_RULES}\n\n${FAIR_HOUSING_GUARDRAIL}`,
      },
      { role: "user", content: prompt },
    ], "sonar"));
    const subject = plainCopy(d.subject ?? "").replace(/[.]$/, "");
    let note = (d.note ?? "").trim();
    // Kept as written by the model so the {first name} marker survives;
    // plainCopy would treat the braces as text to tidy.
    if (!/\{\s*first\s*name\s*\}/i.test(note)) note = `Hi {first name}, ${note}`;
    if (!subject || note.split(/\s+/).length < 12) return null;
    return { subject, note };
  } catch (e) {
    console.error("[video-email] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
