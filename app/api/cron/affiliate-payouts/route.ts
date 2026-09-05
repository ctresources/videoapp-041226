import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MIN_PAYOUT_CENTS = 5000; // $50 minimum balance before a payout is sent

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Has this affiliate already been paid for these commissions?
 *
 * The retry rule — mark the payout failed, leave the commissions available,
 * try again next run — assumes a failure means no money moved. It does not.
 * A network timeout, or this function's 60-second budget expiring after
 * Stripe accepted the transfer, both land in the failure path with the
 * transfer already made. Next run then pays the same balance a second time,
 * and the table shows one failed row beside one paid row, so the duplicate is
 * invisible from inside the app.
 *
 * Stripe's own idempotency keys expire after 24 hours, which is no help at
 * all on a monthly cron. So before re-paying an affiliate who has a failed
 * payout on record, ask Stripe what actually reached their account. Every
 * transfer carries its payout_id, so a failed row whose transfer exists is a
 * bookkeeping failure, not a payment failure — and it is repaired rather than
 * repeated.
 */
async function alreadyTransferred(
  admin: Admin,
  affiliateId: string,
  connectAccountId: string,
): Promise<{ payoutId: string; transferId: string } | null> {
  const { data: failedRows } = await admin
    .from("affiliate_payouts")
    .select("id")
    .eq("affiliate_id", affiliateId)
    .eq("status", "failed");
  const failedIds = new Set((failedRows ?? []).map((r) => (r as { id: string }).id));
  if (failedIds.size === 0) return null;

  // Bounded: only transfers to this affiliate's account, newest first. A
  // failed payout older than this window has long since been reconciled by
  // hand or written off.
  const transfers = await stripe.transfers.list({ destination: connectAccountId, limit: 100 });
  for (const t of transfers.data) {
    const payoutId = t.metadata?.payout_id;
    if (payoutId && failedIds.has(payoutId)) return { payoutId, transferId: t.id };
  }
  return null;
}

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
  // Repair before paying. If a previous run's "failure" actually sent the
  // money, mark that payout paid, settle its commissions, and send nothing.
  try {
    const found = await alreadyTransferred(admin, affiliateId, connectAccountId);
    if (found) {
      const paidAt = new Date().toISOString();
      await admin
        .from("affiliate_payouts")
        .update({ status: "paid", stripe_transfer_id: found.transferId, paid_at: paidAt, failure_reason: null })
        .eq("id", found.payoutId);
      await admin
        .from("affiliate_commissions")
        .update({ status: "paid", paid_at: paidAt, payout_id: found.payoutId })
        .in("id", commissionIds);
      console.warn(
        `[affiliate-payouts] payout ${found.payoutId} was recorded failed but transfer ${found.transferId} exists — reconciled, no new transfer sent`,
      );
      return { ok: true };
    }
  } catch (err) {
    // Reconciliation itself failing must not send money on a guess.
    const msg = err instanceof Error ? err.message : "reconciliation failed";
    console.error(`[affiliate-payouts] could not reconcile ${affiliateId}, skipping this run:`, msg);
    return { ok: false, error: `reconciliation failed: ${msg}` };
  }

  const { data: payoutRow, error: insertErr } = await admin
    .from("affiliate_payouts")
    .insert({ affiliate_id: affiliateId, amount_cents: totalCents, status: "pending" })
    .select("id")
    .single();
  if (insertErr || !payoutRow) return { ok: false, error: insertErr?.message || "payout row insert failed" };
  const payoutId = (payoutRow as { id: string }).id;

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: totalCents,
        currency: "usd",
        destination: connectAccountId,
        metadata: { affiliate_id: affiliateId, payout_id: payoutId },
      },
      // Covers the short window the reconciliation above cannot: a retry
      // inside 24 hours returns the original transfer instead of a second one.
      { idempotencyKey: `affiliate-payout-${payoutId}` },
    );
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
