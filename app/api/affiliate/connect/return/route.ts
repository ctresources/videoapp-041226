import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { resolveAffiliateForUser } from "@/lib/affiliate";
import { NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * GET /api/affiliate/connect/return — Stripe redirects here when the affiliate
 * finishes (or abandons) onboarding. We re-read the connected account and sync
 * the onboarding status, then send them back to the affiliate dashboard.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/login`);

  const admin = createAdminClient();
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);

  if (affiliate?.stripe_connect_account_id) {
    try {
      const account = await stripe.accounts.retrieve(affiliate.stripe_connect_account_id);
      const status = account.details_submitted && account.payouts_enabled
        ? "complete"
        : account.requirements?.disabled_reason
          ? "restricted"
          : "pending";
      await admin.from("affiliates").update({ connect_onboarding_status: status }).eq("id", affiliate.id);
    } catch (err) {
      console.error("[affiliate/connect/return] error:", err);
    }
  }

  return NextResponse.redirect(`${APP_URL}/affiliate?connect=done`);
}
