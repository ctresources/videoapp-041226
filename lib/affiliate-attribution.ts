import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Attributes a new signup to an affiliate, given the ref code captured at
 * visit time. Validates the code against approved affiliates, blocks
 * self-referral (an affiliate signing up under their own link), and writes
 * the attribution onto the new user's profile. Best-effort: never throws.
 *
 * Called from both signup paths — the email/password register route and the
 * Google OAuth callback — after the auth user (and its profile row) exist.
 */
export async function attributeReferral(
  admin: Admin,
  userId: string,
  userEmail: string | null | undefined,
  refCode: string | null | undefined,
): Promise<void> {
  const code = refCode?.trim().toUpperCase();
  if (!code) return;
  try {
    const { data: aff } = await admin
      .from("affiliates")
      .select("id, email")
      .eq("ref_code", code)
      .eq("status", "approved")
      .maybeSingle();
    if (!aff) return;

    const affiliate = aff as { id: string; email: string | null };
    // Self-referral guard: an affiliate can't earn commission on their own signup.
    if (userEmail && affiliate.email && affiliate.email.toLowerCase() === userEmail.toLowerCase()) {
      return;
    }

    await admin
      .from("profiles")
      .update({
        referred_by_affiliate_id: affiliate.id,
        referral_code_used: code,
        referral_attributed_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch {
    // Attribution is best-effort; a failure must never block signup.
  }
}
