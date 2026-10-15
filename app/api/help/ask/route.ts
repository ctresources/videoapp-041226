import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sparkleeInstructions } from "@/lib/help/page-guide";

export const dynamic = "force-dynamic";

/**
 * Ask Sparklee: a one-time pass for a spoken help conversation (2026-10-14).
 *
 * POST { path } — the browser asks for a pass before it opens the live voice
 * connection to OpenAI. The pass is an ephemeral key made here with the
 * account's own key, carrying Sparklee's instructions and the How It Works
 * guide, so the real key never reaches the browser. POST { action: "end",
 * seconds } — the browser reports how long it ran, for the cost figures.
 *
 * Limits, at the owner's choice: 5 conversations a day before a paid plan,
 * 20 on one, none for admins. Each is cut off at three minutes by the page.
 */

const MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini";
const VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";
const MAX_SECONDS = 180;
const FREE_PER_DAY = 5;
const PAID_PER_DAY = 20;
const START_MARK = "ask_sparklee";
const SECONDS_MARK = "ask_sparklee_seconds";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { path?: string; action?: string; seconds?: number };
  const admin = createAdminClient();

  if (body.action === "end") {
    const seconds = Math.max(0, Math.min(MAX_SECONDS + 30, Math.round(Number(body.seconds) || 0)));
    if (seconds > 0) {
      await admin.from("api_usage_log").insert({
        user_id: user.id, api_provider: "openai", endpoint: SECONDS_MARK, credits_used: seconds, response_status: 200,
      });
    }
    return NextResponse.json({ ok: true });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Sparklee isn't available right now." }, { status: 503 });

  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, subscription_tier, role")
    .eq("id", user.id)
    .single();
  const p = prof as { full_name: string | null; subscription_tier: string | null; role: string | null } | null;
  const isAdmin = p?.role === "admin";
  const paid = !!p?.subscription_tier && p.subscription_tier !== "free";

  if (!isAdmin) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("api_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("endpoint", START_MARK)
      .gte("created_at", dayStart.toISOString());
    const limit = paid ? PAID_PER_DAY : FREE_PER_DAY;
    if ((count ?? 0) >= limit) {
      return NextResponse.json({
        error: `That's all ${limit} of today's questions. Sparklee is back tomorrow, and How It Works in the menu has every answer meanwhile.`,
        code: "daily_limit",
      }, { status: 429 });
    }
  }

  const firstName = (p?.full_name ?? "").trim().split(/\s+/)[0] || null;
  const instructions = sparkleeInstructions(String(body.path || "/"), firstName);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 300 },
        session: {
          type: "realtime",
          model: MODEL,
          instructions,
          // Room for three short sentences, with some to spare.
          max_output_tokens: 1200,
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe" },
              // Harder to set off from across the room (2026-10-14: the
              // owner's TV was taken as questions and answered, which is
              // minutes paid for nothing). Near-field noise reduction is for
              // a voice close to the microphone; the higher threshold ignores
              // quieter, more distant speech.
              noise_reduction: { type: "near_field" },
              turn_detection: { type: "server_vad", threshold: 0.75, silence_duration_ms: 700 },
            },
            output: { voice: VOICE },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[ask-sparklee] could not reach OpenAI:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Sparklee isn't available right now. Try again in a moment." }, { status: 502 });
  }

  const data = await res.json().catch(() => null) as
    | { value?: string; client_secret?: { value?: string }; error?: { message?: string } }
    | null;
  const secret = data?.value ?? data?.client_secret?.value;
  if (!res.ok || !secret) {
    console.error(`[ask-sparklee] pass refused (${res.status}): ${data?.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
    return NextResponse.json({ error: "Sparklee isn't available right now. Try again in a moment." }, { status: 502 });
  }

  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "openai", endpoint: START_MARK, credits_used: 0, response_status: 200,
  });

  return NextResponse.json({ secret, maxSeconds: MAX_SECONDS });
}
