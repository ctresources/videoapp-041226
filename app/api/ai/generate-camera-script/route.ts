import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { FAIR_HOUSING_SHORT } from "@/lib/utils/fair-housing";

const PERPLEXITY_API = "https://api.perplexity.ai";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, pdfText, photoCount } = await req.json();
  const hasTopic = !!(topic?.trim());
  const hasDocs = !!(pdfText?.trim());

  if (!hasTopic && !hasDocs) {
    return NextResponse.json({ error: "topic or document content is required" }, { status: 400 });
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    return NextResponse.json({ error: "Script generation is not configured" }, { status: 500 });
  }

  const systemPrompt = `You are a real estate video scriptwriter creating teleprompter-ready scripts for real estate agents. Write in a warm, conversational, first-person voice as the agent speaking directly to camera. Keep scripts to 2–3 minutes spoken aloud (300–420 words). No stage directions, no headers, no formatting — only the spoken words the agent will read.

${FAIR_HOUSING_SHORT}`;

  let userPrompt: string;
  if (hasDocs) {
    const photoLine = photoCount > 0 ? `\nThe agent also has ${photoCount} property photo${photoCount > 1 ? "s" : ""} to reference during the video.` : "";
    const topicLine = hasTopic ? `\nFocus the script specifically on: "${topic}"` : "";
    userPrompt = `Write a 2–3 minute teleprompter script for a real estate agent video based on the following source material.

Source material:
"""
${(pdfText as string).slice(0, 3000)}
"""
${photoLine}${topicLine}

Rules:
- Open with a strong hook sentence that grabs attention immediately
- Natural spoken language, short punchy sentences
- Draw on specific details from the source material
- End with a clear call to action (e.g. "Give me a call" or "Send me a message today")
- 300–420 words
- Return ONLY the script text — no title, no labels, no markdown`;
  } else {
    userPrompt = `Write a 2–3 minute teleprompter script for a real estate agent video about: "${topic}"

Rules:
- Open with a strong hook sentence that grabs attention immediately
- Natural spoken language, short punchy sentences
- Include real value: stats, tips, or insights relevant to the topic
- End with a clear call to action (e.g. "Give me a call" or "Send me a message today")
- 300–420 words
- Return ONLY the script text — no title, no labels, no markdown`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

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
        max_tokens: 700,
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
