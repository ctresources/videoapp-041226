import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAnswerBlocks } from "@/lib/ai/answer-blocks";
import { notifySiteLead, sendAiQuestionsToVisitor } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/public/ai-questions — the home page's "What buyers in your area
 * ask AI" box (2026-10-23, the owner's ask). No sign-in: it is a lead form.
 * { name, email, city, company? } → { blocks: [{ question, answerBlock, videoTopic }] }
 *
 * Every run is a lead: saved to site_leads, emailed to support, and the
 * visitor gets their questions by email. Once a day per email address (the
 * owner's rule), and a few a day per visitor, because each run is a paid
 * research call.
 */
const PER_IP_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string; city?: string; state?: string; company?: string };
  // A field people never see. Bots fill it in.
  if (body.company) return NextResponse.json({ error: "Please try again." }, { status: 400 });

  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const email = (body.email ?? "").trim().toLowerCase().slice(0, 160);
  const cityName = (body.city ?? "").trim().replace(/\s+/g, " ").replace(/,.*$/, "").slice(0, 60);
  const stateCode = (body.state ?? "").trim().toUpperCase();
  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  if (cityName.length < 2) return NextResponse.json({ error: "Please enter your city or town." }, { status: 400 });
  if (!/^[A-Z]{2}$/.test(stateCode)) return NextResponse.json({ error: "Please choose your state." }, { status: 400 });
  const cityLine = `${cityName}, ${stateCode}`;

  const admin = createAdminClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`${ip}|sparkreels-leads`).digest("hex").slice(0, 32);

  const { count: emailCount } = await admin
    .from("site_leads").select("id", { count: "exact", head: true })
    .ilike("email", email).gte("created_at", since);
  if ((emailCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "You've already run this today. Your questions are in your email; you can try again tomorrow." },
      { status: 429 },
    );
  }
  const { count: ipCount } = await admin
    .from("site_leads").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("created_at", since);
  if ((ipCount ?? 0) >= PER_IP_PER_DAY) {
    return NextResponse.json({ error: "That's the limit for today. Please try again tomorrow." }, { status: 429 });
  }

  // Saved first, so two quick presses can't both run.
  const { data: lead, error: insertErr } = await admin
    .from("site_leads")
    .insert({ name, email, city: cityLine, ip_hash: ipHash, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) })
    .select("id, created_at")
    .single();
  if (insertErr || !lead) {
    console.error("[ai-questions] lead insert failed:", insertErr?.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }


  try {
    const raw = await generateAnswerBlocks({ agentName: name, city: cityName, state: stateCode });
    const blocks = raw.slice(0, 3).map((b) => ({
      question: String(b.question ?? "").trim(),
      answerBlock: String(b.answerBlock ?? "").trim(),
      videoTopic: String(b.videoTopic ?? "").trim(),
    })).filter((b) => b.question);
    if (!blocks.length) throw new Error("no questions");

    await admin.from("site_leads").update({ questions: blocks }).eq("id", lead.id);
    await Promise.all([
      notifySiteLead({ name, email, city: cityLine, questions: blocks.map((b) => b.question), when: lead.created_at as string }),
      sendAiQuestionsToVisitor({ name, email, city: cityLine, blocks }),
    ]);
    return NextResponse.json({ blocks });
  } catch (err) {
    console.error("[ai-questions] research failed:", err instanceof Error ? err.message : err);
    // Not their fault: free the day's run so they can try again.
    await admin.from("site_leads").delete().eq("id", lead.id);
    return NextResponse.json({ error: "We couldn't research that town just now. Please try again." }, { status: 502 });
  }
}
