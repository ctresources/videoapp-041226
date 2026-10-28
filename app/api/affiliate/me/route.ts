import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAffiliateForUser, userAffiliateEligible } from "@/lib/affiliate";
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
  // Paid subscribers only (2026-10-28). Someone not eligible learns only
  // whether they have an affiliate account to come back to (paused).
  const eligible = await userAffiliateEligible(admin, user.id);
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);
  if (!eligible) {
    return NextResponse.json({
      eligible: false,
      paused: affiliate?.status === "approved",
      affiliate: null,
    });
  }
  if (!affiliate) return NextResponse.json({ eligible: true, affiliate: null });

  const [clicksRes, conversionsRes, commsRes] = await Promise.all([
    admin.from("affiliate_clicks").select("*", { count: "exact", head: true }).eq("affiliate_id", affiliate.id),
    admin.from("affiliate_conversions").select("*", { count: "exact", head: true }).eq("affiliate_id", affiliate.id),
    admin.from("affiliate_commissions").select("commission_amount_cents, status").eq("affiliate_id", affiliate.id),
  ]);

  /**
   * Agents who pressed Get Halo through this affiliate's Halo link (2026-10-24,
   * the owner's ask), so a Halo affiliate can match them on their own Halo
   * dashboard. Name and email only: the agent signed up with SparkReels, not
   * with them, so no phone. One row per agent, newest press first.
   */
  const { data: presses } = await admin
    .from("halo_get_clicks")
    .select("user_id, created_at")
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false })
    .limit(500);
  const lastBy = new Map<string, string>();
  for (const p of (presses ?? []) as { user_id: string; created_at: string }[]) if (!lastBy.has(p.user_id)) lastBy.set(p.user_id, p.created_at);
  const pressIds = Array.from(lastBy.keys());
  const { data: pressProfiles } = pressIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", pressIds)
    : { data: [] };
  const who = new Map(((pressProfiles ?? []) as { id: string; full_name: string | null; email: string }[]).map((x) => [x.id, x]));
  const haloPresses = pressIds.map((id) => ({ name: who.get(id)?.full_name ?? null, email: who.get(id)?.email ?? "", at: lastBy.get(id)! }));

  const comms = (commsRes.data ?? []) as { commission_amount_cents: number; status: string }[];
  const sumBy = (status: string) =>
    comms.filter((c) => c.status === status).reduce((a, c) => a + c.commission_amount_cents, 0);

  return NextResponse.json({
    eligible: true,
    affiliate: {
      status: affiliate.status,
      refCode: affiliate.ref_code,
      connectStatus: affiliate.connect_onboarding_status,
      commissionRate: affiliate.commission_rate,
      commissionDurationMonths: affiliate.commission_duration_months,
      // Their own Halo link, for referred agents' Get Halo button (2026-10-24).
      haloLink: (affiliate as { halo_link?: string | null }).halo_link ?? null,
    },
    stats: {
      clicks: clicksRes.count ?? 0,
      conversions: conversionsRes.count ?? 0,
      pendingCents: sumBy("pending"),
      availableCents: sumBy("available"),
      paidCents: sumBy("paid"),
      // Refund deductions not yet taken from a payout (negative rows), shown
      // on their own so a smaller Available balance is explained.
      deductionCents: -comms
        .filter((c) => c.status === "available" && c.commission_amount_cents < 0)
        .reduce((a, c) => a + c.commission_amount_cents, 0),
    },
    haloPresses,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  });
}
