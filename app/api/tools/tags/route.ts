import { createClient } from "@/lib/supabase/server";
import { perplexityChat } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

function parseTagsJson(raw: string): string[] {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.tags) ? parsed.tags : [];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, context } = await req.json() as { title: string; context?: string };
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const raw = await perplexityChat([
    {
      role: "system",
      content: "You are a YouTube SEO expert for real estate agents. Generate optimized YouTube tags that maximize discoverability. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Generate exactly 20 YouTube tags for a real estate video titled: "${title}"${context ? `\nAdditional context: ${context}` : ""}

Mix these tag types:
- 4-5 broad category tags (e.g. "real estate", "housing market")
- 6-7 location-specific tags using city/state from the title
- 4-5 topic-specific tags matching the video content
- 3-4 long-tail phrase tags (3-5 words each)

Return ONLY this JSON:
{"tags": ["tag1", "tag2", ..., "tag20"]}

Rules: no # prefix, no quotes inside tags, keep each tag under 30 chars, mix singular and plural.`,
    },
  ], "sonar");

  const tags = parseTagsJson(raw);
  return NextResponse.json({ tags });
}
