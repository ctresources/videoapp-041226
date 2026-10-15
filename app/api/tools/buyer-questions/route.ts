import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { perplexityChat } from "@/lib/api/perplexity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET ?city=&state= — what home buyers and sellers in a market are asking AI
 * assistants right now, as a short list of questions (2026-10-15).
 *
 * For Spark Studio's buyer question card, which shows one live question for
 * the agent's market as the page opens (the market from Settings, or the one
 * typed in Details) and the rest under Show more. Looked up once a day per
 * market and kept in buyer_questions_cache, so opening the page is not a
 * research call each time and everyone in a market shares the day's answer.
 *
 * Not behind the free tries: it is a step toward a video (free-trial.ts).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const city = (req.nextUrl.searchParams.get("city") || "").trim().slice(0, 80);
  const state = (req.nextUrl.searchParams.get("state") || "").trim().slice(0, 20);
  if (!city) return NextResponse.json({ questions: [] });

  const market = [city, state].filter(Boolean).join(", ");
  const key = market.toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();

  const { data: cached } = await admin
    .from("buyer_questions_cache")
    .select("questions")
    .eq("market", key)
    .eq("day", day)
    .maybeSingle();
  const hit = (cached as { questions: unknown } | null)?.questions;
  if (Array.isArray(hit) && hit.length) return NextResponse.json({ questions: hit });

  try {
    const raw = await perplexityChat([
      {
        role: "system",
        content: "You research what real people ask AI assistants about buying and selling homes in a specific place. Return only valid JSON.",
      },
      {
        role: "user",
        content: `List the 5 questions home buyers and sellers in ${market} are most often asking ChatGPT, Google or Siri right now.
Each must be a question a real person would type, in their words, naming ${city} where it fits, under 120 characters, and specific to this market rather than generic.
Return only: {"questions": ["...", "...", "...", "...", "..."]}`,
      },
    ], "sonar");

    let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a !== -1 && b !== -1) text = text.slice(a, b + 1);
    const parsed = JSON.parse(text) as { questions?: unknown };
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((q): q is string => typeof q === "string" && !!q.trim())
      .map((q) => q.replace(/\[\d+\]/g, "").replace(/^["“]|["”]$/g, "").trim())
      .slice(0, 5);
    if (questions.length === 0) throw new Error("no questions");

    await admin.from("buyer_questions_cache").upsert({ market: key, day, questions });
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[buyer-questions]", market, err instanceof Error ? err.message : err);
    return NextResponse.json({ questions: [], error: "Couldn't look those up just now." }, { status: 502 });
  }
}
