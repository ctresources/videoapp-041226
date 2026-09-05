import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const { topic, city, state, videoType = "blog_video" } = await req.json() as {
    topic: string;
    city?: string;
    state?: string;
    videoType?: string;
  };
  if (!topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const location = [city, state].filter(Boolean).join(", ");
  // These have to match the caps the renderer enforces (video-length.ts:
  // 400 words standard, 1,160 long, both hard-clamped). Asking for 1,800
  // words produced a script a third of which was silently trimmed the moment
  // it was pasted into Create.
  const lengthGuide = videoType === "short_form"
    ? "60-90 seconds (about 150-200 words). Never exceed 200 words."
    : videoType === "youtube_16x9"
    ? "about 8 minutes (1,000-1,150 words). Never exceed 1,150 words."
    : "about 3 minutes (350-400 words). Never exceed 400 words.";

  const raw = await perplexityChat([
    {
      role: "system",
      content: `You are an expert real estate video scriptwriter. Write scripts that are conversational, data-driven, and authoritative. Search for current market data when location is provided. Return only valid JSON.\n\n${FAIR_HOUSING_GUARDRAIL}`,
    },
    {
      role: "user",
      content: `Write a complete real estate video script.

Topic: "${topic}"${location ? `\nLocation: ${location}` : ""}
Video length: ${lengthGuide}

${location ? `Search for current real estate data for ${location} (median price, days on market, inventory, trends) and weave it into the script.` : ""}

Return ONLY this JSON:
{
  "hook": "powerful opening line (1-2 sentences) — stat or bold insight",
  "hooks": ["hook option 1 — data-driven", "hook option 2 — question", "hook option 3 — bold statement"],
  "script": "complete script in natural spoken language. Structure: hook → market context → key insights → what this means for viewers → CTA. No stage directions.",
  "cta": "specific call-to-action (subscribe, comment, contact — one clear action)",
  "title": "suggested video title under 70 chars"
}`,
    },
  ], "sonar-pro");

  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const result = JSON.parse(text);

  return NextResponse.json(result);
}
