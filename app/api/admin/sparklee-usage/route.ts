import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Ask Sparklee usage this month, for the admin panel (2026-10-14).
 *
 * From the rows /api/help/ask writes: one `ask_sparklee` per conversation
 * started, one `ask_sparklee_seconds` per conversation ended (credits_used
 * holds its length). A conversation whose tab was closed before it could
 * report has a start and no seconds, so minutes can read slightly low.
 *
 * The cost is an estimate: OpenAI bills by audio tokens, not minutes. About
 * two cents a minute on gpt-realtime-2.1-mini, from its published prices and
 * the share of a conversation that is speech; set SPARKLEE_COST_PER_MINUTE to
 * correct it once a real OpenAI bill is in.
 */
const COST_PER_MINUTE = Number(process.env.SPARKLEE_COST_PER_MINUTE) || 0.02;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [starts, seconds, today] = await Promise.all([
    admin.from("api_usage_log").select("user_id").eq("endpoint", "ask_sparklee").gte("created_at", monthStart.toISOString()).limit(10000),
    admin.from("api_usage_log").select("credits_used").eq("endpoint", "ask_sparklee_seconds").gte("created_at", monthStart.toISOString()).limit(10000),
    admin.from("api_usage_log").select("id", { count: "exact", head: true }).eq("endpoint", "ask_sparklee").gte("created_at", dayStart.toISOString()),
  ]);

  const startRows = (starts.data ?? []) as { user_id: string }[];
  const totalSeconds = ((seconds.data ?? []) as { credits_used: number | null }[])
    .reduce((n, r) => n + (Number(r.credits_used) || 0), 0);
  const minutes = totalSeconds / 60;

  return NextResponse.json({
    conversations: startRows.length,
    people: new Set(startRows.map((r) => r.user_id)).size,
    today: today.count ?? 0,
    minutes: Math.round(minutes * 10) / 10,
    estimatedCost: Math.round(minutes * COST_PER_MINUTE * 100) / 100,
    costPerMinute: COST_PER_MINUTE,
  });
}
