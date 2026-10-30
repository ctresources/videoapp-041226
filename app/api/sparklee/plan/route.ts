import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFor } from "@/lib/home/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/sparklee/plan { words } — Ask Sparklee's plan for a goal
 * (lib/home/plan.ts). Proposes only: nothing is written, made or posted.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { words } = (await req.json().catch(() => ({}))) as { words?: unknown };
  const said = typeof words === "string" ? words.trim() : "";
  if (said.length < 3) return NextResponse.json({ error: "Tell Sparklee what you want to get done." }, { status: 400 });
  try {
    return NextResponse.json(await planFor(createAdminClient(), user.id, said));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't plan that. Try again." }, { status: 502 });
  }
}
