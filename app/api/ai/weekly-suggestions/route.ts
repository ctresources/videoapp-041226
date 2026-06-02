import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";

export const maxDuration = 30;

interface Suggestion {
  title: string;
  hook: string;
  why_now: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { city, state } = await req.json();
    const location = city && state ? `${city}, ${state}` : "the United States";
    const now = new Date();
    const weekLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const prompt = `You are a real estate content coach. Suggest 2 high-impact, timely video topics for a real estate agent in ${location} for the week of ${weekLabel}.

These should feel like a "Monday morning gift" — researched, relevant right now, and ready to record in 90 seconds. Focus on what buyers, sellers, and local homeowners are thinking about THIS week.

Return ONLY valid JSON array — no markdown, no explanation:
[
  {
    "title": "Short punchy topic title (under 60 chars)",
    "hook": "One compelling opening sentence for the video",
    "why_now": "One sentence explaining why this is timely THIS week specifically"
  }
]

${FAIR_HOUSING_GUARDRAIL}`;

    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a real estate content strategist. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        search_recency_filter: "week",
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!res.ok) throw new Error(`Perplexity error ${res.status}`);

    const data = await res.json();
    const raw = data.choices[0].message.content as string;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const suggestions: Suggestion[] = JSON.parse(cleaned);

    return NextResponse.json({ suggestions, location });
  } catch (err) {
    console.error("weekly-suggestions error:", err);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
