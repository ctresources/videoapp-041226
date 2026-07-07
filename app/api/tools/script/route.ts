import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, city, state, videoType = "blog_video" } = await req.json() as {
    topic: string;
    city?: string;
    state?: string;
    videoType?: string;
  };
  if (!topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const location = [city, state].filter(Boolean).join(", ");
  const lengthGuide = videoType === "short_form"
    ? "60-90 seconds (about 150-200 words)"
    : videoType === "youtube_16x9"
    ? "8-12 minutes (about 1200-1800 words)"
    : "3-5 minutes (about 450-750 words)";

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
