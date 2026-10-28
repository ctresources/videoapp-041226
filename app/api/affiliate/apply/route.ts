import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { spamCheck } from "@/lib/spam-guards";
import { notifyNewAffiliateApplication } from "@/lib/email";
import { userAffiliateEligible } from "@/lib/affiliate";
import { AFFILIATE_ELIGIBILITY_TEXT } from "@/lib/access";

/**
 * POST /api/affiliate/apply — an affiliate application.
 * Body: { fullName, website?, promotionPlan? }
 *
 * Since 2026-10-28 (the owner's rule) only active paid subscribers may apply,
 * so this needs a signed-in, eligible account (lib/access.ts
 * isAffiliateEligible). It used to be public, with the account joined later
 * by an emailed claim link; the application now belongs to the account that
 * makes it, with that account's email, so approval needs no claim step
 * (the admin route already skips the claim link when user_id is set).
 * Inserts a pending row; the owner reviews it in Admin → Affiliates.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: `${AFFILIATE_ELIGIBILITY_TEXT} Sign in to apply.` }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!(await userAffiliateEligible(admin, user.id))) {
    return NextResponse.json({ error: AFFILIATE_ELIGIBILITY_TEXT, code: "affiliate_not_eligible" }, { status: 403 });
  }

  const { fullName, website, promotionPlan } = (await req.json().catch(() => ({}))) as {
    fullName?: string;
    website?: string;
    promotionPlan?: string;
  };
  const email = user.email ?? "";

  if (!fullName?.trim() || !email) {
    return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  }

  const spam = spamCheck(fullName, email);
  if (spam) return NextResponse.json({ error: spam }, { status: 400 });

  // One application per account.
  const { data: existing } = await admin.from("affiliates").select("id").eq("user_id", user.id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You've already applied. We'll be in touch soon." }, { status: 409 });
  }

  const { error } = await admin.from("affiliates").insert({
    user_id: user.id,
    full_name: fullName.trim(),
    email,
    website_or_social: website?.trim() || null,
    promotion_plan: promotionPlan?.trim() || null,
  });

  if (error) {
    // Unique index on lower(email) → friendly "already applied" message.
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return NextResponse.json(
        { error: "You've already applied with this email. We'll be in touch soon." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  notifyNewAffiliateApplication({ name: fullName.trim(), email, website: website?.trim() || null });

  return NextResponse.json({ success: true, email });
}
