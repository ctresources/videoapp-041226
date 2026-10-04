import { createAdminClient } from "@/lib/supabase/admin";
import { releaseSocialSlot } from "@/lib/api/social-slot";
import { uploadPostConfigured } from "@/lib/api/upload-post";
import { partnerPlatformLimit } from "@/lib/utils/social-platforms";
import { NextRequest, NextResponse } from "next/server";

/**
 * Takes publishing slots back from accounts that no longer have a plan.
 *
 * The Stripe webhook releases a slot the moment a subscription ends. This is
 * the net under it: a webhook that never arrived, or a plan changed by hand
 * in the database, would otherwise leave an unpaid account holding one of a
 * fixed number of slots until someone noticed the plan was full.
 *
 * "No longer has a plan" is the same rule that decides who may connect in the
 * first place (partnerPlatformLimit), so the two can never disagree about who
 * is entitled to a slot. A customer who cancelled but is still inside the
 * period they paid for keeps theirs: their tier does not change until the
 * subscription actually ends.
 */

// Without this the route is prerendered, so a build queries the database and
// releases slots — the mistake the other crons already guard against.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!uploadPostConfigured()) return NextResponse.json({ released: 0, skipped: "not configured" });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, subscription_tier, role")
    .not("social_profile_created_at", "is", null);

  if (error) {
    console.error("[cron/social-slots]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { id: string; subscription_tier: string | null; role: string | null }[];
  let released = 0;
  for (const row of rows) {
    if (partnerPlatformLimit(row.subscription_tier, row.role) > 0) continue;
    if (await releaseSocialSlot(admin, row.id, "nightly sweep: no plan")) released += 1;
  }
  return NextResponse.json({ holding: rows.length, released });
}
