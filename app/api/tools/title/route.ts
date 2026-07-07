import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, city, state } = await req.json() as { topic: string; city?: string; state?: string };
  if (!topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const location = [city, state].filter(Boolean).join(", ");

  const raw = await perplexityChat([
    {
      role: "system",
      content: "You are a YouTube title specialist for real estate agents. Write click-worthy, SEO-optimized titles that rank and convert. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Generate 8 YouTube video title options for a real estate agent.

Topic: "${topic}"${location ? `\nLocation: ${location}` : ""}

Create these 8 title styles:
1. Data/number hook (e.g. "Why 73% of Buyers in [City] Are…")
2. Question format ("Is [City] Still Worth Moving To in 2025?")
3. Vs/comparison ("Suburbs vs Downtown [City]: The Real Cost")
4. Insider secret ("What Your [City] Agent Won't Tell You")
5. List format ("5 Mistakes [City] Home Buyers Make")
6. Urgency ("Why [City] Buyers Must Act Before [Month]")
7. Myth busting ("The Truth About [City]'s Housing Market")
8. Local authority ("I Sold 50 Homes in [City] — Here's What I Know")

Rules: each title under 70 chars, include location if provided, no clickbait, real estate focused.

Return ONLY this JSON:
{"titles": ["title1", "title2", "title3", "title4", "title5", "title6", "title7", "title8"]}`,
    },
  ], "sonar");

  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const { titles } = JSON.parse(text);

  return NextResponse.json({ titles });
}
