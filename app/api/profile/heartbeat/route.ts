import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/profile/heartbeat — one minute of active use (2026-10-30, the
 * owner's ask). Sent by components/layout/app-heartbeat.tsx while a page is
 * open, visible and was used in the last few minutes. Adds to today's total
 * in app_time_daily and notes when they were last seen.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await createAdminClient().rpc("add_app_time", { p_user: user.id, p_seconds: 60 });
  return NextResponse.json({ ok: true });
}
