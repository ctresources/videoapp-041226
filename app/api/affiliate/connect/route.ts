import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { resolveAffiliateForUser } from "@/lib/affiliate";
import { NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * GET /api/affiliate/connect — starts Stripe Connect (Express) onboarding for
 * an approved affiliate. Creates the connected account on first use, then
 * redirects to a fresh Stripe-hosted onboarding link.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/login`);

  const admin = createAdminClient();
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.redirect(`${APP_URL}/affiliate?error=not_approved`);
  }

  try {
    let accountId = affiliate.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: affiliate.email,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { affiliate_id: affiliate.id, supabase_user_id: user.id },
      });
      accountId = account.id;
      await admin
        .from("affiliates")
        .update({ stripe_connect_account_id: accountId, connect_onboarding_status: "pending" })
        .eq("id", affiliate.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/api/affiliate/connect/refresh`,
      return_url: `${APP_URL}/api/affiliate/connect/return`,
      type: "account_onboarding",
    });
    return NextResponse.redirect(link.url);
  } catch (err) {
    console.error("[affiliate/connect] error:", err);
    return NextResponse.redirect(`${APP_URL}/affiliate?error=connect_failed`);
  }
}
