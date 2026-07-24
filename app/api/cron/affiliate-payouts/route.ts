import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MIN_PAYOUT_CENTS = 5000; // $50 minimum balance before a payout is sent

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Pays one affiliate: records a pending payout row, transfers the summed
 * available commissions to their connected account, then marks the payout and
 * its commissions paid. On a Stripe failure the payout row is marked failed and
 * the commissions are left `available` to retry next run. Returns a result so a
 * single failure never aborts the whole batch.
 */
async function payoutAffiliate(
  admin: Admin,
  affiliateId: string,
  connectAccountId: string,
  commissionIds: string[],
  totalCents: number,
): Promise<{ ok: boolean; error?: string }> {
  const { data: payoutRow, error: insertErr } = await admin
    .from("affiliate_payouts")
    .insert({ affiliate_id: affiliateId, amount_cents: totalCents, status: "pending" })
    .select("id")
    .single();
  if (insertErr || !payoutRow) return { ok: false, error: insertErr?.message || "payout row insert failed" };
  const payoutId = (payoutRow as { id: string }).id;

  try {
    const transfer = await stripe.transfers.create({
      amount: totalCents,
      currency: "usd",
      destination: connectAccountId,
      metadata: { affiliate_id: affiliateId, payout_id: payoutId },
    });
    const paidAt = new Date().toISOString();
    await admin
      .from("affiliate_payouts")
      .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: paidAt })
      .eq("id", payoutId);
    await admin
      .from("affiliate_commissions")
      .update({ status: "paid", paid_at: paidAt, payout_id: payoutId })
      .in("id", commissionIds);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transfer failed";
    await admin.from("affiliate_payouts").update({ status: "failed", failure_reason: msg }).eq("id", payoutId);
    return { ok: false, error: msg };
  }
}

/**
 * GET /api/cron/affiliate-payouts — monthly Vercel Cron.
 * 1) Matures 30-day-old commissions (pending → available).
 * 2) Pays each affiliate whose available balance ≥ $50 and whose Stripe Connect
 *    onboarding is complete.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1) Mature holds.
  await admin
    .from("affiliate_commissions")
    .update({ status: "available" })
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString());

  // 2) Group available commissions by affiliate.
  const { data: comms } = await admin
    .from("affiliate_commissions")
    .select("id, affiliate_id, commission_amount_cents")
    .eq("status", "available");

  const groups: Record<string, { ids: string[]; total: number }> = {};
  for (const c of (comms ?? []) as { id: string; affiliate_id: string; commission_amount_cents: number }[]) {
    const g = groups[c.affiliate_id] ?? { ids: [], total: 0 };
    g.ids.push(c.id);
    g.total += c.commission_amount_cents;
    groups[c.affiliate_id] = g;
  }

  let processed = 0;
  let totalPaidCents = 0;
  let skipped = 0;
  const errors: { affiliateId: string; error: string }[] = [];

  for (const affiliateId of Object.keys(groups)) {
    const group = groups[affiliateId];
    if (group.total < MIN_PAYOUT_CENTS) { skipped++; continue; }

    const { data: affRow } = await admin
      .from("affiliates")
      .select("stripe_connect_account_id, connect_onboarding_status")
      .eq("id", affiliateId)
      .single();
    const affiliate = affRow as { stripe_connect_account_id: string | null; connect_onboarding_status: string } | null;
    if (!affiliate?.stripe_connect_account_id || affiliate.connect_onboarding_status !== "complete") {
      skipped++;
      continue; // not onboarded yet — balance carries to next run
    }

    const res = await payoutAffiliate(admin, affiliateId, affiliate.stripe_connect_account_id, group.ids, group.total);
    if (res.ok) {
      processed++;
      totalPaidCents += group.total;
    } else {
      errors.push({ affiliateId, error: res.error || "unknown" });
    }
  }

  return NextResponse.json({ processed, totalPaidCents, skipped, errors });
}
