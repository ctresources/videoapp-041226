import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { FAIR_HOUSING_SHORT } from "@/lib/utils/fair-housing";
import {
  cameraTargetWords, minutesFor,
  type CameraLength, type RenderedScriptLength,
} from "@/lib/utils/video-length";

const PERPLEXITY_API = "https://api.perplexity.ai";

// Long scripts take Perplexity longer to write than the old ~400-word default.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, pdfText, photoCount, length, city, state, unbranded } = await req.json();
  const hasTopic = !!(topic?.trim());
  const hasDocs = !!(pdfText?.trim());

  // The market the agent set for this video, asked before the script is
  // written. A fallback only, the same way generate-location-script treats it:
  // if the topic or the source material names a town, that town wins. Without
  // it a script about "spring inventory" named no place at all, and the town
  // only ever appeared in the CTA that was stapled on afterwards.
  const market = [city, state].map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).join(", ");
  const marketRule = market
    ? `\n- The video is for ${market}. Ground it there — name the market and speak to people buying or selling in it. If the topic or source material names a different place, that place wins.`
    : "";

  /**
   * Unbranded cut — for listing media most MLS boards require to carry no
   * agent identification.
   *
   * Suppressing the overlays is only half of it. This prompt has always been
   * told to close on "give me a call", and a spoken invitation to contact the
   * agent breaks an unbranded rule exactly as surely as a logo does. Miss this
   * and the picture is compliant while the audio isn't — the kind of failure a
   * board catches and the agent doesn't.
   */
  const isUnbranded = unbranded === true;
  const ctaRule = isUnbranded
    ? `\n- UNBRANDED VIDEO. Do not name the agent, a brokerage, a team, a licence number, a phone number, an email address or a website, and do not invite the viewer to make contact in any way — no "call me", no "reach out", no "message me". Close on the property or the subject itself.`
    : `\n- End with a clear call to action (e.g. "Give me a call" or "Send me a message today")`;

  // Camera recordings are free and support up to 15 minutes, so the length is
  // purely the agent's choice. Defaults to the previous ~400-word behaviour.
  // Teleprompter keys from the camera tab, render-matched keys from the paste
  // tab. Anything unrecognised falls back to the standard budget rather than
  // to a number that would be clamped later.
  const words = cameraTargetWords(length as CameraLength | RenderedScriptLength | undefined);
  const low = Math.round(words * 0.92);
  const high = Math.round(words * 1.08);
  const mins = minutesFor(words);
  const lengthRule = `${low}–${high} words (about ${mins} minute${mins === 1 ? "" : "s"} spoken aloud)`;
  const depthRule = words >= 700
    ? `\n- This is a longer script: cover 6-9 distinct points, each developed with a specific detail, example, or short story. Use natural spoken transitions between them. Never pad or repeat to reach the length.`
    : "";
  // ~1.4 tokens per word plus headroom. The old flat 700 physically capped the
  // output at roughly 500 words, so longer requests could never be fulfilled.
  const maxTokens = Math.min(4000, Math.round(words * 1.4) + 400);

  if (!hasTopic && !hasDocs) {
    return NextResponse.json({ error: "topic or document content is required" }, { status: 400 });
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    return NextResponse.json({ error: "Script generation is not configured" }, { status: 500 });
  }

  const systemPrompt = `You are a real estate video scriptwriter creating teleprompter-ready scripts for real estate agents. Write in a warm, conversational, first-person voice as the agent speaking directly to camera. Write ${lengthRule}. Getting close to that length matters — the agent is reading this off a teleprompter and expects it to run that long. No stage directions, no headers, no formatting — only the spoken words the agent will read.
${isUnbranded ? `
This script is for an UNBRANDED video and must contain no agent identification of any kind: no names, no brokerage, no team, no licence number, no phone number, no email, no website, and no invitation to contact anyone. This is a compliance requirement, not a style preference — it outranks any instruction elsewhere in this request about how to close the script.
` : ""}
${FAIR_HOUSING_SHORT}`;

  let userPrompt: string;
  if (hasDocs) {
    const photoLine = photoCount > 0 ? `\nThe agent also has ${photoCount} property photo${photoCount > 1 ? "s" : ""} to reference during the video.` : "";
    const topicLine = hasTopic ? `\nFocus the script specifically on: "${topic}"` : "";
    userPrompt = `Write a ${mins}-minute teleprompter script for a real estate agent video based on the following source material.

Source material:
"""
${(pdfText as string).slice(0, 3000)}
"""
${photoLine}${topicLine}

Rules:
- Open with a strong hook sentence that grabs attention immediately${marketRule}
- Natural spoken language, short punchy sentences
- Draw on specific details from the source material${ctaRule}
- ${lengthRule}${depthRule}
- Return ONLY the script text — no title, no labels, no markdown`;
  } else {
    userPrompt = `Write a ${mins}-minute teleprompter script for a real estate agent video about: "${topic}"

Rules:
- Open with a strong hook sentence that grabs attention immediately${marketRule}
- Natural spoken language, short punchy sentences
- Include real value: stats, tips, or insights relevant to the topic${ctaRule}
- ${lengthRule}${depthRule}
- Return ONLY the script text — no title, no labels, no markdown`;
  }

  try {
    const controller = new AbortController();
    // Scales with length — a 10-minute script takes noticeably longer to write
    // than the old ~400-word default, which used to fit comfortably in 25s.
    const timeout = setTimeout(() => controller.abort(), words >= 700 ? 50000 : 25000);

    const res = await fetch(`${PERPLEXITY_API}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`AI error ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const script = data.choices?.[0]?.message?.content;
    if (!script) throw new Error("Empty response from AI");

    return NextResponse.json({ script: script.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate script";
    console.error("[generate-camera-script]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
