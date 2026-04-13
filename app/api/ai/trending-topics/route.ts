import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";

export const maxDuration = 30;

interface TrendingTopic {
  title: string;
  hook: string;
  reason: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { city, state } = await req.json();
    const locationContext = city && state ? `${city}, ${state}` : "the United States";

    const systemPrompt = `You are a real estate content strategist who tracks what home buyers, sellers, and investors are searching for and talking about right now.

Your job is to identify the top 5 trending real estate topics in a given market and return them as a structured JSON array ready for video production.

Return ONLY valid JSON — no markdown, no explanation:
[
  {
    "title": "Short, punchy video title (under 60 chars)",
    "hook": "One attention-grabbing sentence to open the video",
    "reason": "One sentence explaining why this topic is trending RIGHT NOW",
    "videoType": "market_update" | "why_live_here" | "community_events" | "custom",
    "customTopic": "If videoType is custom, the full topic description for Perplexity research"
  }
]

Rules:
- Topics must be genuinely relevant to CURRENT market conditions (interest rates, inventory, season, economy)
- Mix video types — don't return 5 market updates
- Prioritize topics with high search intent: questions buyers/sellers are actively Googling
- Keep language conversational — written for real people, not academics
- Be specific to the location if provided

${FAIR_HOUSING_GUARDRAIL}`;

    const userPrompt = `Find the top 5 trending real estate content topics for ${locationContext} right now in ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.

Search for what buyers, sellers, and investors in this area are currently asking about, what news is affecting the local market, and what questions agents are being asked most often. Return exactly 5 topics as a JSON array.`;

    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        search_domain_filter: [
          "zillow.com", "redfin.com", "realtor.com", "housingwire.com",
          "nar.realtor", "inman.com", "bankrate.com", "themortgagereports.com",
        ],
        search_recency_filter: "week",
        web_search_options: { search_context_size: "medium" },
        return_citations: false,
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Perplexity error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const raw = data.choices[0].message.content as string;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const topics: TrendingTopic[] = JSON.parse(cleaned);

    return NextResponse.json({ topics, location: locationContext });
  } catch (err: unknown) {
    console.error("trending-topics error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch trending topics" },
      { status: 500 }
    );
  }
}
