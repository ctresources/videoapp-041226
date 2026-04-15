import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Map Stripe price ID → our tier name + monthly video credits
function tierFromPriceId(priceId: string): { tier: string; credits: number } | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.priceId === priceId) return { tier: plan.tier, credits: plan.videos };
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
      if (!userId || !session.subscription) break;

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
        credits_remaining: planInfo?.credits ?? 40,
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

      await updateProfile(admin, userId, {
        stripe_subscription_id: sub.id,
        subscription_tier: planInfo?.tier || "pro",
        subscription_status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
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

    // Refresh credits at the start of each billing period
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== "subscription_cycle") break;
      const customerId = invoice.customer as string;
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, subscription_tier")
        .eq("stripe_customer_id", customerId)
        .limit(1);
      if (!profiles?.[0]) break;

      const plan = Object.values(PLANS).find((p) => p.tier === profiles[0].subscription_tier);
      if (plan) {
        await updateProfile(admin, profiles[0].id, {
          credits_remaining: plan.videos,
          subscription_status: "active",
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
