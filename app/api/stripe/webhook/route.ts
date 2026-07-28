import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCommissionIfEligible } from "@/lib/affiliate-commission";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Map Stripe price ID → tier + the two monthly video allowances
function tierFromPriceId(
  priceId: string,
): { tier: string; shortVideos: number; longVideos: number } | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.priceId === priceId) {
      return { tier: plan.tier, shortVideos: plan.shortVideos, longVideos: plan.longVideos };
    }
  }
  return null;
}

async function updateProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  updates: Record<string, unknown>
) {
  await admin.from("profiles").update(updates).eq("id", userId);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.metadata?.supabase_user_id as string | undefined);
      if (!userId) break;

      // One-time video pack purchase. `credits_kind` says which allowance it
      // tops up — short and long are tracked separately.
      if (session.mode === "payment") {
        const creditsToAdd = parseInt(session.metadata?.credits_to_add ?? "0", 10);
        const isLongPack = session.metadata?.credits_kind === "long";
        if (creditsToAdd > 0) {
          const column = isLongPack ? "long_credits_remaining" : "credits_remaining";
          const { data: profileRow } = await admin
            .from("profiles")
            .select("credits_remaining, long_credits_remaining")
            .eq("id", userId)
            .single();
          const current =
            (profileRow as Record<string, number> | null)?.[column] ?? 0;
          await updateProfile(admin, userId, { [column]: current + creditsToAdd });
        }
        break;
      }

      // Subscription checkout
      if (!session.subscription) break;
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const item = sub.items.data[0];
      const priceId = item?.price.id;
      const planInfo = tierFromPriceId(priceId);
      const periodEnd = item?.current_period_end;

      await updateProfile(admin, userId, {
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: sub.id,
        subscription_tier: planInfo?.tier || "pro",
        subscription_status: sub.status,
        // Trials get 1 short video to try it out; the full allowance lands when
        // the trial converts (customer.subscription.updated below).
        credits_remaining: sub.status === "trialing" ? 1 : (planInfo?.shortVideos ?? 4),
        long_credits_remaining: sub.status === "trialing" ? 0 : (planInfo?.longVideos ?? 0),
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;

      const item = sub.items.data[0];
      const priceId = item?.price.id;
      const planInfo = tierFromPriceId(priceId);
      const periodEnd = item?.current_period_end;
      const previousStatus = (event.data.previous_attributes as Record<string, unknown>)?.status as string | undefined;
      const trialJustConverted = previousStatus === "trialing" && sub.status === "active";

      await updateProfile(admin, userId, {
        stripe_subscription_id: sub.id,
        subscription_tier: planInfo?.tier || "pro",
        subscription_status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        // Restore full credits when trial converts to paid
        ...(trialJustConverted && {
          credits_remaining: planInfo?.shortVideos ?? 4,
          long_credits_remaining: planInfo?.longVideos ?? 0,
        }),
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;

      await updateProfile(admin, userId, {
        subscription_tier: "free",
        subscription_status: "canceled",
        stripe_subscription_id: null,
        cancel_at_period_end: false,
        credits_remaining: 0,
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const { data: profiles } = await admin
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .limit(1);
      if (profiles?.[0]) {
        await updateProfile(admin, profiles[0].id, { subscription_status: "past_due" });
      }
      break;
    }

    // Affiliate commissions (first charge + renewals) and credit refresh (renewals)
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, subscription_tier")
        .eq("stripe_customer_id", customerId)
        .limit(1);
      const profile = profiles?.[0];

      // Commission on the first real charge AND every renewal within the window.
      if (profile && (invoice.billing_reason === "subscription_create" || invoice.billing_reason === "subscription_cycle")) {
        await createCommissionIfEligible(admin, invoice, profile.id);
      }

      // Allowance refresh at the start of each billing period. Both buckets
      // reset — unused videos do not roll over.
      if (invoice.billing_reason !== "subscription_cycle" || !profile) break;
      const plan = Object.values(PLANS).find((p) => p.tier === profile.subscription_tier);
      if (plan) {
        await updateProfile(admin, profile.id, {
          credits_remaining: plan.shortVideos,
          long_credits_remaining: plan.longVideos,
          subscription_status: "active",
        });
      }
      break;
    }

    // Refund/dispute → void any not-yet-paid commission for that invoice.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const invoiceField = (charge as unknown as { invoice?: string | { id: string } | null }).invoice;
      const invoiceId = !invoiceField ? null : typeof invoiceField === "string" ? invoiceField : invoiceField.id;
      if (!invoiceId) break;
      const { data: commRow } = await admin
        .from("affiliate_commissions")
        .select("id, status")
        .eq("stripe_invoice_id", invoiceId)
        .maybeSingle();
      const commission = commRow as { id: string; status: string } | null;
      if (!commission) break;
      if (commission.status === "pending" || commission.status === "available") {
        await admin
          .from("affiliate_commissions")
          .update({ status: "void", void_reason: "refunded" })
          .eq("id", commission.id);
        console.log(`[webhook] Voided commission ${commission.id} — invoice ${invoiceId} refunded`);
      } else if (commission.status === "paid") {
        console.warn(`[webhook] Commission ${commission.id} already paid but invoice ${invoiceId} was refunded — manual reconciliation needed`);
      }
      break;
    }

    // Keep an affiliate's Stripe Connect onboarding status in sync (requires
    // "Listen to events on connected accounts" enabled for this endpoint).
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const { data: affRow } = await admin
        .from("affiliates")
        .select("id")
        .eq("stripe_connect_account_id", account.id)
        .maybeSingle();
      const aff = affRow as { id: string } | null;
      if (aff) {
        const status = account.details_submitted && account.payouts_enabled
          ? "complete"
          : account.requirements?.disabled_reason
            ? "restricted"
            : "pending";
        await admin.from("affiliates").update({ connect_onboarding_status: status }).eq("id", aff.id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
