import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { spamCheck } from "@/lib/spam-guards";
import { notifyNewAffiliateApplication } from "@/lib/email";

/**
 * POST /api/affiliate/apply — public affiliate application (no auth).
 * Body: { fullName, email, website?, promotionPlan? }
 * Inserts a pending affiliate row; the owner reviews it in Admin → Affiliates.
 */
export async function POST(req: NextRequest) {
  const { fullName, email, website, promotionPlan } = (await req.json()) as {
    fullName?: string;
    email?: string;
    website?: string;
    promotionPlan?: string;
  };

  if (!fullName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const spam = spamCheck(fullName, email);
  if (spam) return NextResponse.json({ error: spam }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin.from("affiliates").insert({
    full_name: fullName.trim(),
    email: email.trim(),
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

  notifyNewAffiliateApplication({ name: fullName.trim(), email: email.trim(), website: website?.trim() || null });

  return NextResponse.json({ success: true });
}
