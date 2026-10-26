import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { websiteKnowledge } from "@/lib/marketing/sparklee-knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/public/sparklee — Ask Sparklee on the public website (2026-10-26,
 * the owner's ask). No sign-in. { question, page? } → { answer, left }
 *
 * Answers only from the website's own pages (lib/marketing/sparklee-knowledge),
 * in text, on a small model, so a visitor costs a fraction of a cent. Four
 * questions a day per visitor (the owner's limit), counted by a hash of the IP.
 */
const PER_VISITOR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const MODEL = process.env.OPENAI_PUBLIC_SPARKLEE_MODEL || "gpt-6-luna";

const INSTRUCTIONS = `You are Sparklee, the friendly helper on the SparkReels.ai website. Visitors are real estate agents deciding whether to sign up.
Answer ONLY from the facts below. In one to three short, warm sentences, plain words, no lists or headings.
If the facts don't cover the question, say you're not sure and suggest signing up free to try it, or emailing support@sparkreels.ai.
Never invent prices, numbers, features or promises. Never name the companies or services SparkReels is built on. Never give legal, tax or financial advice.
Only talk about SparkReels; for anything else, gently steer back.

FACTS:
`;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { question?: string; page?: string };
  const question = (body.question ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (question.length < 2) return NextResponse.json({ error: "Ask me a question about SparkReels." }, { status: 400 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Sparklee isn't available right now." }, { status: 503 });

  const admin = createAdminClient();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`${ip}|sparkreels-sparklee`).digest("hex").slice(0, 32);
  const since = new Date(Date.now() - DAY_MS).toISOString();

  const { count } = await admin
    .from("public_sparklee_questions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  const used = count ?? 0;
  if (used >= PER_VISITOR) {
    return NextResponse.json(
      { error: `That's your ${PER_VISITOR} questions for today. Create your first Spark free to keep going.`, code: "limit", left: 0 },
      { status: 429 },
    );
  }

  // Saved first, so quick repeated presses can't get past the limit.
  const { data: row } = await admin
    .from("public_sparklee_questions")
    .insert({ ip_hash: ipHash, question, page: (body.page ?? "").slice(0, 200) || null })
    .select("id")
    .single();

  try {
    const openai = new OpenAI({ apiKey: key });
    const res = await openai.responses.create({
      model: MODEL,
      instructions: INSTRUCTIONS + websiteKnowledge(),
      input: question,
      max_output_tokens: 260,
    });
    const answer = (res.output_text ?? "").trim()
      || "I'm not sure about that one. Create your first Spark free to try it, or email support@sparkreels.ai.";
    if (row) await admin.from("public_sparklee_questions").update({ answer }).eq("id", (row as { id: number }).id);
    return NextResponse.json({ answer, left: PER_VISITOR - used - 1 });
  } catch (err) {
    console.error("[public sparklee] failed:", err instanceof Error ? err.message : err);
    // A question she couldn't answer doesn't count against the four.
    if (row) await admin.from("public_sparklee_questions").delete().eq("id", (row as { id: number }).id);
    return NextResponse.json({ error: "Sparklee couldn't answer just now. Please try again.", left: PER_VISITOR - used }, { status: 502 });
  }
}
