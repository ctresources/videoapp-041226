import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AFFILIATE_ELIGIBILITY_TEXT } from "@/lib/access";
import { userAffiliateEligible } from "@/lib/affiliate";
import { LockedFeature } from "@/components/access/locked-feature";

/**
 * The Affiliate page is for active paid subscribers and admins (2026-10-28,
 * the owner's rule). Checked on the server, so typing /affiliate shows
 * nothing of the page to anyone else. An approved affiliate whose paid
 * period has ended sees that it's paused: the account, link and balance are
 * kept and come back when they subscribe again.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  if (await userAffiliateEligible(admin, user.id)) return <>{children}</>;

  const { data: aff } = await admin.from("affiliates").select("status").eq("user_id", user.id).maybeSingle();
  const paused = (aff as { status: string } | null)?.status === "approved";

  return (
    <div className="py-6">
      <LockedFeature
        feature="Affiliate Program"
        title={paused ? "Your affiliate account is paused" : "Available with SparkReels"}
        body={paused
          ? `${AFFILIATE_ELIGIBILITY_TEXT} Your account, referral link and earnings are kept, and everything comes back when you subscribe again.`
          : AFFILIATE_ELIGIBILITY_TEXT}
        cta={paused ? "Subscribe again" : "View Plans"}
      />
    </div>
  );
}
