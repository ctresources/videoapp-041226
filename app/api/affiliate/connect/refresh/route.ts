import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { resolveAffiliateForUser } from "@/lib/affiliate";
import { NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * GET /api/affiliate/connect/refresh — Stripe redirects here when an
 * onboarding link expires; we mint a fresh one and send the user back.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/login`);

  const admin = createAdminClient();
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);
  if (!affiliate?.stripe_connect_account_id) {
    return NextResponse.redirect(`${APP_URL}/affiliate`);
  }

  try {
    const link = await stripe.accountLinks.create({
      account: affiliate.stripe_connect_account_id,
      refresh_url: `${APP_URL}/api/affiliate/connect/refresh`,
      return_url: `${APP_URL}/api/affiliate/connect/return`,
      type: "account_onboarding",
    });
    return NextResponse.redirect(link.url);
  } catch (err) {
    console.error("[affiliate/connect/refresh] error:", err);
    return NextResponse.redirect(`${APP_URL}/affiliate?error=connect_failed`);
  }
}
