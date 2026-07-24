import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAffiliateForUser } from "@/lib/affiliate";
import { NextResponse } from "next/server";

/**
 * GET /api/affiliate/me — the signed-in user's affiliate status, referral
 * link, and earnings stats. Returns { affiliate: null } for non-affiliates so
 * the page can show an apply CTA. Resolving also links an approved-but-unlinked
 * application to this account on first visit.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);
  if (!affiliate) return NextResponse.json({ affiliate: null });

  const [clicksRes, conversionsRes, commsRes] = await Promise.all([
    admin.from("affiliate_clicks").select("*", { count: "exact", head: true }).eq("affiliate_id", affiliate.id),
    admin.from("affiliate_conversions").select("*", { count: "exact", head: true }).eq("affiliate_id", affiliate.id),
    admin.from("affiliate_commissions").select("commission_amount_cents, status").eq("affiliate_id", affiliate.id),
  ]);

  const comms = (commsRes.data ?? []) as { commission_amount_cents: number; status: string }[];
  const sumBy = (status: string) =>
    comms.filter((c) => c.status === status).reduce((a, c) => a + c.commission_amount_cents, 0);

  return NextResponse.json({
    affiliate: {
      status: affiliate.status,
      refCode: affiliate.ref_code,
      connectStatus: affiliate.connect_onboarding_status,
      commissionRate: affiliate.commission_rate,
      commissionDurationMonths: affiliate.commission_duration_months,
    },
    stats: {
      clicks: clicksRes.count ?? 0,
      conversions: conversionsRes.count ?? 0,
      pendingCents: sumBy("pending"),
      availableCents: sumBy("available"),
      paidCents: sumBy("paid"),
    },
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  });
}
