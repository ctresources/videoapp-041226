import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFreeFollowup, type FollowupStep } from "@/lib/free-followup";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Day after signup each follow-up is due. */
const DUE_DAY: Record<FollowupStep, number> = { 1: 2, 2: 5, 3: 10 };
const DAY_MS = 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  created_at: string;
  followup1_sent_at: string | null;
  followup2_sent_at: string | null;
  followup3_sent_at: string | null;
}

/**
 * GET /api/cron/free-followups — daily Vercel Cron (2026-10-23, the owner's ask).
 *
 * Free accounts created from 2026-10-23 on (followup_auto) that haven't made
 * their free video get follow-ups 1, 2 and 3 on days 2, 5 and 10. One email per
 * account per run, in order, so a missed day never sends two at once.
 * Accounts from before stay manual: the owner sends theirs from the Admin panel.
 * sendFreeFollowup re-checks free / no video / not opted out and sends each once.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, created_at, followup1_sent_at, followup2_sent_at, followup3_sent_at")
    .eq("followup_auto", true)
    .eq("subscription_tier", "free")
    .eq("role", "user")
    .is("first_video_generated_at", null)
    .is("followup_opt_out_at", null)
    .is("followup3_sent_at", null);

  const rows = (data ?? []) as Row[];
  const now = Date.now();
  let sent = 0;
  let failed = 0;

  for (const p of rows) {
    const next: FollowupStep | null = !p.followup1_sent_at ? 1 : !p.followup2_sent_at ? 2 : !p.followup3_sent_at ? 3 : null;
    if (!next) continue;
    const days = (now - new Date(p.created_at).getTime()) / DAY_MS;
    if (days < DUE_DAY[next]) continue;
    // Keep a gap after the previous one, so a late Email 1 isn't followed by Email 2 the next morning.
    const prev = next === 2 ? p.followup1_sent_at : next === 3 ? p.followup2_sent_at : null;
    if (prev && now - new Date(prev).getTime() < (DUE_DAY[next] - DUE_DAY[(next - 1) as FollowupStep]) * DAY_MS - 6 * 60 * 60 * 1000) continue;

    const result = await sendFreeFollowup(admin, p.id, next);
    if (result === "sent") sent++;
    else if (result === "failed") failed++;
  }

  console.log(`[cron/free-followups] scanned ${rows.length}, sent ${sent}, failed ${failed}`);
  return NextResponse.json({ scanned: rows.length, sent, failed });
}
