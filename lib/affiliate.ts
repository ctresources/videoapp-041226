import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface AffiliateRow {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  ref_code: string | null;
  status: "pending" | "approved" | "rejected";
  stripe_connect_account_id: string | null;
  connect_onboarding_status: "not_started" | "pending" | "complete" | "restricted";
  commission_rate: number;
  commission_duration_months: number;
}

/**
 * Finds the affiliate row for a logged-in user. Matches first by user_id;
 * failing that, by email against an approved-but-unlinked application (which
 * it then links to this account) — so an affiliate who applied before ever
 * creating a SparkReels account gets connected the first time they sign in.
 */
export async function resolveAffiliateForUser(
  admin: Admin,
  userId: string,
  email: string | null | undefined,
): Promise<AffiliateRow | null> {
  const { data: byId } = await admin
    .from("affiliates")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (byId) return byId as AffiliateRow;

  if (email) {
    // Escape LIKE wildcards so an email with `_`/`%` can't match broadly.
    const safe = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: byEmail } = await admin
      .from("affiliates")
      .select("*")
      .ilike("email", safe)
      .is("user_id", null)
      .maybeSingle();
    if (byEmail) {
      await admin.from("affiliates").update({ user_id: userId }).eq("id", (byEmail as AffiliateRow).id);
      return { ...(byEmail as AffiliateRow), user_id: userId };
    }
  }
  return null;
}
