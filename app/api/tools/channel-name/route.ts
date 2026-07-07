import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentName, city, state, niche } = await req.json() as {
    agentName: string;
    city?: string;
    state?: string;
    niche?: string;
  };
  if (!agentName?.trim()) return NextResponse.json({ error: "agentName required" }, { status: 400 });

  const location = [city, state].filter(Boolean).join(", ");

  const raw = await perplexityChat([
    {
      role: "system",
      content: "You are a YouTube channel branding expert for real estate agents. Create memorable, searchable channel names that build authority and trust. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Generate 10 YouTube channel name ideas for a real estate agent.

Agent name: "${agentName}"${location ? `\nLocation: ${location}` : ""}${niche ? `\nSpecialty/niche: ${niche}` : ""}

Create these types:
- 2 personal brand names (agent name + keyword)
- 2 location authority names (city/region focused)
- 2 value-proposition names (what they help with)
- 2 lifestyle brand names (aspirational/emotional)
- 2 niche-specific names${niche ? ` (tied to: ${niche})` : ""}

Rules: under 50 chars each, no special characters, YouTube-search-friendly, memorable, avoid generic terms like "realty" or "properties" alone.

Return ONLY this JSON:
{"names": [{"name": "Channel Name", "rationale": "1 sentence why this works"}, ...10 items]}`,
    },
  ], "sonar");

  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const { names } = JSON.parse(text);

  return NextResponse.json({ names });
}
