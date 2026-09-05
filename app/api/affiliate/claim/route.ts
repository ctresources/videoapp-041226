/**
 * POST /api/affiliate/claim
 *
 * Joins an approved affiliate application to the signed-in account, using the
 * token emailed to the applicant's address on approval.
 *
 * This replaces linking by email. Registration auto-confirms every account, so
 * arriving with an address proved nothing about controlling it — anyone who
 * knew an approved affiliate's email could register with it and inherit the
 * ref code, the commission balance and the ability to point payouts at their
 * own bank. Receiving the token is the proof signing up never was.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimAffiliateByToken } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "No claim token." }, { status: 400 });

  const admin = createAdminClient();

  // One account, one affiliate row. Without this an admin who already has an
  // affiliate row could redeem someone else's link and end up with two.
  const { data: existing } = await admin
    .from("affiliates")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "This account is already linked to an affiliate application." },
      { status: 409 },
    );
  }

  const affiliate = await claimAffiliateByToken(admin, user.id, token);
  if (!affiliate) {
    // Unknown, expired and already-claimed all answer the same, so guessing a
    // token tells the guesser nothing about which it was.
    return NextResponse.json(
      { error: "That link is no longer valid. Ask us for a new one at support@sparkreels.ai." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, refCode: affiliate.ref_code });
}
