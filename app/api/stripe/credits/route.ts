import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Add-on packs. Prices are built inline via price_data, so changing these
// needs no Stripe dashboard work. The $29 long video pack (long1, and its old
// alias "3") was retired with long AI videos on 2026-11-13: those links now
// fall through to the !packInfo redirect to /billing below.
const CREDIT_PACKS = {
  short1: { credits: 1, amount: 2500, kind: "short", label: "1 Video" },
  // Legacy query-param alias so any old link or bookmark still resolves.
  // "2" (the old 2-video pack) intentionally dropped.
  "1": { credits: 1, amount: 2500, kind: "short", label: "1 Video" },
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
