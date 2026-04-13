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
    .select("stripe_customer_id, full_name, email")
    .eq("id", user.id)
    .single();

  const p = profile as { stripe_customer_id: string | null; full_name: string | null; email: string | null } | null;

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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1&plan=${plan}`,
    cancel_url: `${appUrl}/billing?canceled=1`,
    metadata: { supabase_user_id: user.id, plan },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  return NextResponse.redirect(session.url!);
}
