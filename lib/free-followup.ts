import { createAdminClient } from "@/lib/supabase/admin";
import { sendFreeFollowupEmail } from "@/lib/email";

type Admin = ReturnType<typeof createAdminClient>;
export type FollowupStep = 1 | 2 | 3;
export type FollowupResult = "sent" | "already" | "not_eligible" | "opted_out" | "failed";

const STAMP: Record<FollowupStep, "followup1_sent_at" | "followup2_sent_at" | "followup3_sent_at"> = {
  1: "followup1_sent_at",
  2: "followup2_sent_at",
  3: "followup3_sent_at",
};

/**
 * Follow-up email 1, 2 or 3 to a free account that hasn't made its free
 * video (2026-10-23). The owner sends these by hand from the Admin panel.
 * Each goes once: the stamp is claimed first, and a failed send gives it back.
 */
export async function sendFreeFollowup(admin: Admin, userId: string, step: FollowupStep): Promise<FollowupResult> {
  const { data: p } = await admin
    .from("profiles")
    .select("email, full_name, location_city, subscription_tier, first_video_generated_at, followup_opt_out_at, followup_token, suspended")
    .eq("id", userId)
    .maybeSingle();
  const row = p as {
    email: string | null; full_name: string | null; location_city: string | null;
    subscription_tier: string | null; first_video_generated_at: string | null;
    followup_opt_out_at: string | null; followup_token: string; suspended: boolean | null;
  } | null;
  if (!row) return "not_eligible";
  if (row.followup_opt_out_at) return "opted_out";
  if (row.subscription_tier !== "free" || row.first_video_generated_at || row.suspended) return "not_eligible";

  const col = STAMP[step];
  const { data: claimed } = await admin
    .from("profiles")
    .update({ [col]: new Date().toISOString() })
    .eq("id", userId)
    .is(col, null)
    .select("id")
    .maybeSingle();
  if (!claimed) return "already";

  let email = row.email;
  if (!email) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      email = u?.user?.email ?? null;
    } catch { /* no email, nothing to send */ }
  }

  const sent = email
    ? await sendFreeFollowupEmail({
        email,
        name: row.full_name,
        city: row.location_city,
        step,
        unsubscribeUrl: `https://www.sparkreels.ai/api/public/unsubscribe?t=${row.followup_token}`,
      })
    : false;
  if (!sent) {
    await admin.from("profiles").update({ [col]: null }).eq("id", userId);
    return "failed";
  }
  return "sent";
}
