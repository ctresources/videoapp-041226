import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, PLANS, PlanKey } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get("plan") as PlanKey | null;
  if (!plan || !PLANS[plan]) {
    return NextResponse.redirect(new URL("/#pricing", req.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in → send to register with plan hint
  if (!user) {
    return NextResponse.redirect(new URL(`/register?plan=${plan}`, req.url));
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, full_name, email")
    .eq("id", user.id)
    .single();

  const p = profile as { stripe_customer_id: string | null; stripe_subscription_id: string | null; full_name: string | null; email: string | null } | null;

  // Get or create Stripe customer
  let customerId = p?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: p?.full_name || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Only offer trial to users who have never had a subscription
  const isNewCustomer = !p?.stripe_subscription_id;

  /**
   * An existing subscriber belongs in the billing portal, not in checkout.
   *
   * This route creates a subscription; it has no idea one already exists. So
   * "Upgrade" opened a second one on the same customer, and the webhook then
   * overwrote stripe_subscription_id with the new id — orphaning the first,
   * which kept billing forever with nothing in the app pointing at it. A
   * Creator moving to Influencer paid both.
   *
   * The billing page now links existing subscribers straight to the portal.
   * This is the backstop for a stale tab or a hand-typed URL, and it is the
   * half that cannot be bypassed.
   */
  if (p?.stripe_subscription_id) {
    return NextResponse.redirect(new URL("/api/stripe/portal", req.url));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1&plan=${plan}`,
    cancel_url: `${appUrl}/billing?canceled=1`,
    metadata: { supabase_user_id: user.id, plan },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    // The metadata has to be on the SUBSCRIPTION, not only on the session.
    // customer.subscription.updated and .deleted read it off the subscription
    // object, found none, and returned without writing anything — so no
    // cancellation, and no portal plan change, ever reached the database.
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan },
      ...(isNewCustomer && { trial_period_days: 7 }),
    },
  });

  return NextResponse.redirect(session.url!);
}
