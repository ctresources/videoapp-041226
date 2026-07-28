import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Add-on packs. Short and long videos have SEPARATE allowances, so `kind` says
// which one a pack tops up. Prices are built inline via price_data, so changing
// these needs no Stripe dashboard work. Priced to hold ~45% margin against
// render cost (a 4-min short costs us ~$8, an 8-min long ~$21).
const CREDIT_PACKS = {
  short1: { credits: 1, amount: 1500, kind: "short", label: "1 Short Video" },
  short2: { credits: 2, amount: 2800, kind: "short", label: "2 Short Videos" },
  long1:  { credits: 1, amount: 3900, kind: "long",  label: "1 Long Video (up to 8 minutes)" },
  // Legacy query-param aliases so any old link or bookmark still resolves.
  "1": { credits: 1, amount: 1500, kind: "short", label: "1 Short Video" },
  "2": { credits: 2, amount: 2800, kind: "short", label: "2 Short Videos" },
  "3": { credits: 1, amount: 3900, kind: "long",  label: "1 Long Video (up to 8 minutes)" },
} as const;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const pack = req.nextUrl.searchParams.get("pack") as keyof typeof CREDIT_PACKS | null;
  const packInfo = pack ? CREDIT_PACKS[pack] : null;
  if (!packInfo) return NextResponse.redirect(new URL("/billing", req.url));

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", user.id)
    .single();

  const p = profile as { stripe_customer_id: string | null; full_name: string | null } | null;

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
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: packInfo.label },
          unit_amount: packInfo.amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      supabase_user_id: user.id,
      credits_to_add: String(packInfo.credits),
      // Tells the webhook which allowance to top up.
      credits_kind: packInfo.kind,
    },
    success_url: `${appUrl}/billing?success=credits&added=${packInfo.credits}&kind=${packInfo.kind}`,
    cancel_url: `${appUrl}/billing?canceled=1`,
  });

  return NextResponse.redirect(session.url!);
}
