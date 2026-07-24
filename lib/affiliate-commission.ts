import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Creates an affiliate commission ledger entry for a paid subscription invoice,
 * when the paying user was referred by an approved affiliate and is still inside
 * that affiliate's commission window. Idempotent on stripe_invoice_id. The
 * conversion row (upserted on first payment) anchors the N-month window, so
 * renewals past the window earn nothing. Self-referral is re-checked here as
 * defense in depth. No-op on $0 invoices (trials, full-coupon).
 */
export async function createCommissionIfEligible(
  admin: Admin,
  invoice: Stripe.Invoice,
  userId: string,
): Promise<void> {
  const amountPaid = invoice.amount_paid ?? 0;
  if (!invoice.id || amountPaid <= 0) return;

  const { data: profileRow } = await admin
    .from("profiles")
    .select("email, referred_by_affiliate_id")
    .eq("id", userId)
    .single();
  const profile = profileRow as { email: string | null; referred_by_affiliate_id: string | null } | null;
  if (!profile?.referred_by_affiliate_id) return;

  const { data: affRow } = await admin
    .from("affiliates")
    .select("id, user_id, email, status, commission_rate, commission_duration_months")
    .eq("id", profile.referred_by_affiliate_id)
    .single();
  const affiliate = affRow as {
    id: string; user_id: string | null; email: string | null; status: string;
    commission_rate: number; commission_duration_months: number;
  } | null;
  if (!affiliate || affiliate.status !== "approved") return;

  // Self-referral guard (defense in depth — also enforced at attribution time).
  if (affiliate.user_id && affiliate.user_id === userId) return;
  if (affiliate.email && profile.email && affiliate.email.toLowerCase() === profile.email.toLowerCase()) return;

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  const subField = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  const subscriptionId = !subField ? null : typeof subField === "string" ? subField : subField.id;

  // Upsert the conversion — the FIRST payment anchors the commission window.
  const eligibleUntil = new Date();
  eligibleUntil.setMonth(eligibleUntil.getMonth() + affiliate.commission_duration_months);
  await admin.from("affiliate_conversions").upsert(
    {
      affiliate_id: affiliate.id,
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      commission_eligible_until: eligibleUntil.toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  const { data: convRow } = await admin
    .from("affiliate_conversions")
    .select("id, commission_eligible_until")
    .eq("user_id", userId)
    .single();
  const conversion = convRow as { id: string; commission_eligible_until: string } | null;
  if (!conversion) return;
  if (new Date() > new Date(conversion.commission_eligible_until)) return; // past the window

  const commissionAmount = Math.round(amountPaid * Number(affiliate.commission_rate));
  if (commissionAmount <= 0) return;

  const availableAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30-day hold
  await admin.from("affiliate_commissions").upsert(
    {
      affiliate_id: affiliate.id,
      conversion_id: conversion.id,
      stripe_invoice_id: invoice.id,
      invoice_amount_cents: amountPaid,
      commission_rate: affiliate.commission_rate,
      commission_amount_cents: commissionAmount,
      status: "pending",
      available_at: availableAt,
    },
    { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
  );
}
