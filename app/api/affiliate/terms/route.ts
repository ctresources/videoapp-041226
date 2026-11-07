import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAffiliateForUser, userAffiliateEligible } from "@/lib/affiliate";
import { AFFILIATE_ELIGIBILITY_TEXT } from "@/lib/access";
import { AFFILIATE_TERMS_VERSION } from "@/lib/affiliate-terms";

export const dynamic = "force-dynamic";

/**
 * POST { version } — an approved affiliate accepts the SparkReels.ai Affiliate
 * Program Terms (2026-11-07). Only the current version can be accepted, so a
 * page left open across a change can't accept the old wording.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!(await userAffiliateEligible(admin, user.id))) {
    return NextResponse.json({ error: AFFILIATE_ELIGIBILITY_TEXT }, { status: 403 });
  }
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Only approved affiliates can accept the terms." }, { status: 403 });
  }

  const { version } = (await req.json().catch(() => ({}))) as { version?: string };
  if (version !== AFFILIATE_TERMS_VERSION) {
    return NextResponse.json({ error: "The terms were updated. Refresh to read the new version." }, { status: 409 });
  }

  const at = new Date().toISOString();
  const { error } = await admin.from("affiliates")
    .update({ terms_version: AFFILIATE_TERMS_VERSION, terms_accepted_at: at, updated_at: at })
    .eq("id", affiliate.id);
  if (error) return NextResponse.json({ error: "Couldn't save it. Try again." }, { status: 500 });
  return NextResponse.json({ termsVersion: AFFILIATE_TERMS_VERSION, termsAcceptedAt: at });
}
