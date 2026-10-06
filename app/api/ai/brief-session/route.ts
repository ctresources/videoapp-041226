import { createClient } from "@/lib/supabase/server";
import { runBriefTurn, type BriefEmail, type BriefTurn } from "@/lib/api/brief-session";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/** Long enough for a real back-and-forth, short enough to bound the prompt. */
const MAX_TURNS = 24;
const MAX_CHARS = 1500;

/**
 * POST /api/ai/brief-session
 *
 * One turn of the spoken brief: send the conversation so far, get back the
 * fields filled in, what to say next, and whether the agent has said to go
 * ahead. Stateless — the client holds the transcript, so nothing to expire and
 * no session table.
 *
 *   { turns: [{ role: "user" | "assistant", content: string }] }
 *   → { slots, reply, ready }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawTurns = (body as { turns?: unknown })?.turns;
  if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
    return NextResponse.json({ error: "turns required" }, { status: 400 });
  }

  // Trust nothing about shape or size: this transcript is pasted straight into
  // a model prompt, and it arrives from the browser.
  const turns: BriefTurn[] = [];
  for (const t of rawTurns.slice(-MAX_TURNS)) {
    const role = (t as { role?: unknown })?.role;
    const content = (t as { content?: unknown })?.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    turns.push({ role, content: content.trim().slice(0, MAX_CHARS) });
  }
  if (turns.length === 0) {
    return NextResponse.json({ error: "No usable turns" }, { status: 400 });
  }

  // Narrowed to the two literals rather than passed through. It reaches a
  // model prompt, so it gets the same distrust the transcript above does.
  const rawMode = (body as { mode?: unknown })?.mode;
  const mode = rawMode === "blog" ? "blog" : "script";

  // Read here rather than sent by the browser: the home-screen mic sends its
  // command the moment the Create page opens, before that page has loaded the
  // agent's market, and a value the client supplies is one more thing in a
  // model prompt to distrust.
  const { data: prof } = await supabase
    .from("profiles")
    .select("location_city, location_state")
    .eq("id", user.id)
    .maybeSingle();
  const m = prof as { location_city: string | null; location_state: string | null } | null;
  const savedMarket = m?.location_city?.trim() && m?.location_state?.trim()
    ? { city: m.location_city.trim().slice(0, 80), state: m.location_state.trim().slice(0, 40) }
    : null;

  // What they have forwarded, so "from my Ambler market report email" can be
  // matched to a real one. Read with their own client: row-level security is
  // what keeps this to their emails. A failure here only means the brief
  // cannot find an email, which it says; the rest of the brief still works.
  const { data: imports } = await supabase
    .from("email_imports")
    .select("id, subject")
    .order("received_at", { ascending: false })
    .limit(10);
  const emails: BriefEmail[] = ((imports ?? []) as { id: string; subject: string | null }[])
    .map((e) => ({ id: e.id, subject: e.subject ?? "" }));

  const result = await runBriefTurn(turns, mode, savedMarket, emails);
  if (!result) {
    // The caller drops back to the typed form rather than looping on a mic that
    // will not answer.
    return NextResponse.json(
      { error: "Voice session unavailable", fallback: "form" },
      { status: 503 },
    );
  }

  return NextResponse.json(result);
}
