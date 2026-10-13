import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanFields, runVoicePick } from "@/lib/api/voice-pick";

export const maxDuration = 30;

/**
 * POST /api/ai/voice-pick — a spoken sentence, and the choices on the page it
 * was said on, turned into which of them it picked.
 *
 *   { said: string, fields: PickField[] }
 *   → { picks: { [key]: value }, reply: string }
 *
 * The page sends its own controls, so nothing here knows any page. Both halves
 * arrive from the browser and both are cut down before they reach a prompt;
 * what comes back is checked against the same fields, so a pick is always one
 * the page offered.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { said?: unknown; fields?: unknown };
  const said = typeof body.said === "string" ? body.said.trim().slice(0, 600) : "";
  const fields = cleanFields(body.fields);
  if (!said || fields.length === 0) return NextResponse.json({ error: "Nothing to read." }, { status: 400 });

  const result = await runVoicePick(said, fields);
  if (!result) return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });
  return NextResponse.json(result);
}
