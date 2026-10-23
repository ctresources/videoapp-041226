import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email";
import { affiliateForWelcome } from "@/lib/affiliate";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The welcome email, once per account ever (2026-10-23, the owner's ask).
 * Used by the Stripe webhook on a first subscription and by the Admin panel's
 * Send welcome email button. The stamp is claimed first, so two calls can't
 * both send it; a failed send gives the stamp back.
 *
 * @returns "sent", "already" (sent before) or "failed"
 */
export async function sendWelcomeOnce(
  admin: Admin,
  userId: string,
  tier?: string | null,
): Promise<"sent" | "already" | "failed"> {
  const { data: claimed } = await admin
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", userId)
    .is("welcome_email_sent_at", null)
    .select("full_name, subscription_tier")
    .maybeSingle();
  if (!claimed) return "already";
  const p = claimed as { full_name: string | null; subscription_tier: string | null };

  let email: string | null = null;
  try {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = u?.user?.email ?? null;
  } catch { /* no email, nothing to send */ }

  // Already an approved affiliate: their link and dashboard instead of the invitation.
  const affiliate = email ? await affiliateForWelcome(admin, userId, email).catch(() => null) : null;
  const sent = email
    ? await sendWelcomeEmail({ email, name: p.full_name, tier: tier ?? p.subscription_tier ?? "starter", affiliate })
    : false;
  if (!sent) {
    await admin.from("profiles").update({ welcome_email_sent_at: null }).eq("id", userId);
    return "failed";
  }
  return "sent";
}
