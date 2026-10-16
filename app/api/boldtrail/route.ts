import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken } from "@/lib/api/boldtrail";
import { loadQuickPicks } from "@/lib/api/boldtrail-picks";

/** GET — whether BoldTrail is connected, and the quick picks for a send (2026-10-15). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ connected: false, picks: [] });
  return NextResponse.json({ connected: true, picks: await loadQuickPicks(admin, user.id) });
}
