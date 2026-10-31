import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFor } from "@/lib/home/plan";
import type { ChatTurn } from "@/lib/api/perplexity-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/sparklee/plan { words, history? } — Ask Sparklee's plan for a goal
 * (lib/home/plan.ts). history is the conversation so far on the Home card, so
 * an answer like "123 Main St" keeps the question it answers. Proposes only:
 * nothing is written, made or posted.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { words, history } = (await req.json().catch(() => ({}))) as { words?: unknown; history?: unknown };
  const said = typeof words === "string" ? words.trim() : "";
  const turns: ChatTurn[] = (Array.isArray(history) ? history : [])
    .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && !!t.content.trim())
    .slice(-8).map((t) => ({ role: t.role, content: t.content.slice(0, 800) }));
  if (said.length < 2) return NextResponse.json({ error: "Tell Sparklee what you want to get done." }, { status: 400 });
  try {
    return NextResponse.json(await planFor(createAdminClient(), user.id, said, turns));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't plan that. Try again." }, { status: 502 });
  }
}
