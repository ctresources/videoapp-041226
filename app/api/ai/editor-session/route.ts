import { createClient } from "@/lib/supabase/server";
import { runEditorTurn } from "@/lib/api/editor-session";
import type { ChatTurn } from "@/lib/api/perplexity-chat";
import { NextRequest, NextResponse } from "next/server";

// A script rewrite is a second model call on top of the turn.
export const maxDuration = 60;

const MAX_TURNS = 24;
const MAX_CHARS = 1500;
/** ~15 minutes of narration; longer than any script this app produces. */
const MAX_SCRIPT_CHARS = 20000;

/**
 * POST /api/ai/editor-session
 *
 * One turn of the editor's spoken session: send the conversation and the
 * current script, get back the settings to apply, a rewritten script when one
 * was asked for, what to say next, and whether to render.
 *
 * Stateless like the brief — the client holds the transcript.
 *
 *   { turns: [...], script?: string }
 *   → { settings, script, scriptEdit, reply, ready }
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

  // Trust nothing about shape or size — this goes straight into a prompt and
  // arrives from the browser.
  const turns: ChatTurn[] = [];
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

  const rawScript = (body as { script?: unknown })?.script;
  const script = typeof rawScript === "string" ? rawScript.slice(0, MAX_SCRIPT_CHARS) : "";

  const result = await runEditorTurn(turns, script);
  if (!result) {
    // The caller drops back to the rail's own controls rather than looping on
    // a mic that will not answer.
    return NextResponse.json(
      { error: "Voice session unavailable", fallback: "controls" },
      { status: 503 },
    );
  }

  return NextResponse.json(result);
}
