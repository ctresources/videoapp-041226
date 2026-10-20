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
 * GET /api/cron/affiliate-payouts — daily Vercel Cron.
 * 1) Every day: matures 30-day-old commissions (pending → available), but only
 *    for a customer still subscribed at day 30 (2026-10-20, the owner's rule).
 *    One who cancelled, or asked to cancel at the period's end, voids it.
 * 2) On the 1st of the month only: pays each affiliate whose available balance
 *    is ≥ $50 and whose Stripe Connect onboarding is complete.
 *
 * Daily rather than monthly so the day-30 check happens at day 30: a monthly
 * run would judge a commission anywhere from day 30 to day 60.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1) Mature holds, for customers still subscribed.
  const matured = await matureHolds(admin);

  // Payouts go out on the 1st only; the other days just mature holds.
  if (new Date().getUTCDate() !== 1) {
    return NextResponse.json({ ...matured, payouts: "not the 1st — none sent" });
  }

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

  return NextResponse.json({ ...matured, processed, totalPaidCents, skipped, errors });
}

/**
 * pending → available once the 30-day hold is over, if the referred customer is
 * still on a paid plan and has not asked to cancel. Cancelled → void, so it is
 * never paid. Past due (a card being retried) is left pending and looked at
 * again tomorrow: Stripe may still collect it.
 */
async function matureHolds(admin: ReturnType<typeof createAdminClient>) {
  const { data: dueRows } = await admin
    .from("affiliate_commissions")
    .select("id, conversion_id")
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString());
  const due = (dueRows ?? []) as { id: string; conversion_id: string }[];
  if (due.length === 0) return { matured: 0, voided: 0, waiting: 0 };

  const { data: convRows } = await admin
    .from("affiliate_conversions")
    .select("id, user_id")
    .in("id", Array.from(new Set(due.map((d) => d.conversion_id))));
  const userOf = new Map(((convRows ?? []) as { id: string; user_id: string }[]).map((c) => [c.id, c.user_id]));

  const { data: profRows } = await admin
    .from("profiles")
    .select("id, subscription_status, cancel_at_period_end")
    .in("id", Array.from(new Set(Array.from(userOf.values()))));
  const subOf = new Map(
    ((profRows ?? []) as { id: string; subscription_status: string | null; cancel_at_period_end: boolean | null }[])
      .map((p) => [p.id, p]),
  );

  const toAvailable: string[] = [];
  const toVoid: string[] = [];
  let waiting = 0;
  for (const c of due) {
    const sub = subOf.get(userOf.get(c.conversion_id) ?? "");
    if (!sub) { waiting++; continue; } // can't tell — look again tomorrow
    if (sub.subscription_status === "active" && !sub.cancel_at_period_end) toAvailable.push(c.id);
    else if (sub.subscription_status === "past_due") waiting++;
    else toVoid.push(c.id);
  }

  if (toAvailable.length) {
    await admin.from("affiliate_commissions").update({ status: "available" }).in("id", toAvailable).eq("status", "pending");
  }
  if (toVoid.length) {
    await admin
      .from("affiliate_commissions")
      .update({ status: "void", void_reason: "cancelled within 30 days" })
      .in("id", toVoid)
      .eq("status", "pending");
    console.log(`[affiliate-payouts] Voided ${toVoid.length} commission(s): customer not subscribed at day 30`);
  }
  return { matured: toAvailable.length, voided: toVoid.length, waiting };
}
