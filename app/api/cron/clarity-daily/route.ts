import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchClarityDay } from "@/lib/security/clarity";

export const dynamic = "force-dynamic";
// Two tries of up to 55 s each (lib/security/clarity.ts).
export const maxDuration = 130;

/**
 * GET /api/cron/clarity-daily — every morning (vercel.json). Saves the last
 * 24 hours of Clarity numbers by page for Monday's watch email (2026-11-12).
 * One Clarity request a day, of the ten allowed.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Clarity answers in UTC for the 24 hours before the call: that's yesterday.
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const admin = createAdminClient();
  const got = await fetchClarityDay();
  if (!got.ok) {
    console.warn(`[clarity-daily] skipped: ${got.reason}`);
    // Saved for the Monday email (2026-11-22), unless this day already has
    // numbers from an earlier run.
    const { data: had } = await admin.from("clarity_snapshots").select("data").eq("day", day).maybeSingle();
    if (!(had as { data: unknown } | null)?.data) {
      await admin.from("clarity_snapshots").upsert({
        day, data: null, error: got.reason.slice(0, 500), fetched_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ saved: false, reason: got.reason });
  }
  const { error } = await admin
    .from("clarity_snapshots")
    .upsert({ day, data: got.data, error: null, fetched_at: new Date().toISOString() });
  if (error) {
    console.error("[clarity-daily] couldn't save:", error.message);
    return NextResponse.json({ saved: false, reason: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true, day });
}
