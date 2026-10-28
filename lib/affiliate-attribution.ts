import { createAdminClient } from "@/lib/supabase/admin";
import { notifyReferralSignup } from "@/lib/email";
import { affiliateIsActive } from "@/lib/affiliate";

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
      .select("id, email, full_name, status, user_id")
      .eq("ref_code", code)
      .eq("status", "approved")
      .maybeSingle();
    if (!aff) return;
    // A paused affiliate (no longer a paid subscriber, 2026-10-28) isn't
    // credited with new sign-ups; their account and earnings are kept.
    if (!(await affiliateIsActive(admin, aff as { status: string; user_id: string | null }))) return;

    const affiliate = aff as { id: string; email: string | null; full_name: string | null };
    // Self-referral guard: an affiliate can't earn commission on their own signup.
    if (userEmail && affiliate.email && affiliate.email.toLowerCase() === userEmail.toLowerCase()) {
      return;
    }

    const { error } = await admin
      .from("profiles")
      .update({
        referred_by_affiliate_id: affiliate.id,
        referral_code_used: code,
        referral_attributed_at: new Date().toISOString(),
      })
      .eq("id", userId);
    // Tell the owner (2026-10-16): referral sign-ups used to show only in the
    // Admin panel.
    if (!error) {
      await notifyReferralSignup({
        affiliateName: affiliate.full_name || affiliate.email || code,
        refCode: code,
        userEmail: userEmail ?? null,
      });
    }
  } catch {
    // Attribution is best-effort; a failure must never block signup.
  }
}
