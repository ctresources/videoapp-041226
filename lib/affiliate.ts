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
 * Finds the affiliate row for a logged-in user, by user_id and nothing else.
 * An approved application is joined to an account only by redeeming the claim
 * token emailed to it — see claimAffiliateByToken below.
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

  /**
   * Matching on email alone used to link the row here, and that was the bug.
   *
   * Registration auto-confirms every account, so holding an address at signup
   * proves nothing about controlling it. Anyone who knew an approved
   * affiliate's email could register with it and inherit their ref code and
   * their whole commission balance, then connect their own bank — before the
   * real affiliate ever made an account.
   *
   * Linking now happens in one place only: POST /api/affiliate/claim, with the
   * token emailed to that address on approval. An account with no affiliate
   * row of its own simply has none, whatever its email says.
   */
  return null;
}

/**
 * Links an approved affiliate to the account redeeming its claim token.
 *
 * Returns null for a token that is unknown, expired, or already spent — the
 * caller reports all three the same way, so a wrong guess cannot be told
 * apart from an expired one.
 */
export async function claimAffiliateByToken(
  admin: Admin,
  userId: string,
  token: string,
): Promise<AffiliateRow | null> {
  const { data: row } = await admin
    .from("affiliates")
    .select("*")
    .eq("claim_token", token)
    .is("user_id", null)
    .maybeSingle();
  if (!row) return null;

  const aff = row as AffiliateRow & { claim_token_expires_at?: string | null };
  if (aff.claim_token_expires_at && new Date(aff.claim_token_expires_at) < new Date()) return null;

  // The token is cleared as it is spent, so a forwarded email cannot be
  // redeemed twice, and the unique index stays free for reissue.
  const { data: linked, error } = await admin
    .from("affiliates")
    .update({
      user_id: userId,
      claim_token: null,
      claim_token_expires_at: null,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", aff.id)
    .is("user_id", null)
    .select("*")
    .single();
  if (error || !linked) return null;
  return linked as AffiliateRow;
}
