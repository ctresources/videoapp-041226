import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

function parseDescJson(raw: string): { description: string; hashtags: string[] } {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, script } = await req.json() as { title: string; script?: string };
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const raw = await perplexityChat([
    {
      role: "system",
      content: "You are a YouTube SEO expert specializing in real estate video content. Write compelling, keyword-rich descriptions that rank well in search. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Write a YouTube description for a real estate video.

Title: "${title}"${script ? `\nScript excerpt: "${script.slice(0, 600)}"` : ""}

DESCRIPTION STRUCTURE:
1. First 150 chars (hook + primary keyword — this is what shows before "Show more")
2. 2-3 sentences expanding on the topic with specific facts/data
3. "📋 IN THIS VIDEO:" with 4-5 bullet points (each starts with a verb)
4. "❓ FAQ:" with 3 Q&A pairs (voice-search friendly)
5. "📍 SERVING:" [market area from the title]
6. "🔔 Subscribe for weekly real estate updates!"

Return ONLY this JSON:
{
  "description": "full description text with real newlines",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8"]
}`,
    },
  ], "sonar");

  const result = parseDescJson(raw);
  return NextResponse.json(result);
}
