import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAllowance } from "@/lib/usage/allowance";

/**
 * The caller's remaining videos, plan and access.
 *
 * Lets the create screen say "you're out" BEFORE someone fills in a topic,
 * records audio and picks a style — rather than only after they press
 * Generate and get a 402 back.
 *
 * The logic lives in lib/usage/allowance.ts (2026-11-22), shared with the
 * agent layer's get_account, so both always read the same numbers. Same
 * response as before; read through the caller's session as before.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getAllowance(supabase, user.id, { touchLastActive: true }));
}
