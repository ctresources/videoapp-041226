import { randomBytes } from "crypto";
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

/**
 * What the welcome email says to a customer who is already an approved
 * affiliate (2026-10-23): their referral link, and a way into their
 * dashboard. The email goes to the address the application was made with,
 * which is what the claim token is for, so an application not yet joined to
 * an account gets its claim link (a fresh 90 days if it had none or it ran
 * out) and one tap both links it and opens the dashboard.
 */
export async function affiliateForWelcome(
  admin: Admin,
  userId: string,
  email: string,
): Promise<{ refLink: string; dashboardUrl: string } | null> {
  const app = "https://www.sparkreels.ai";
  const cols = "id, user_id, email, ref_code, status, claim_token, claim_token_expires_at";
  const { data: byUser } = await admin.from("affiliates").select(cols)
    .eq("user_id", userId).eq("status", "approved").limit(1);
  // By the address otherwise, case-insensitive and with LIKE's wildcards escaped.
  const { data: byEmail } = byUser?.length ? { data: null } : await admin.from("affiliates").select(cols)
    .ilike("email", email.replace(/[\\%_]/g, (c) => "\\" + c)).eq("status", "approved").limit(1);
  const rows = byUser?.length ? byUser : byEmail;
  const a = (rows?.[0] ?? null) as {
    id: string; user_id: string | null; ref_code: string | null;
    claim_token: string | null; claim_token_expires_at: string | null;
  } | null;
  if (!a?.ref_code) return null;
  const refLink = `${app}/?ref=${a.ref_code}`;
  if (a.user_id) return { refLink, dashboardUrl: `${app}/affiliate` };

  let token = a.claim_token;
  const expired = a.claim_token_expires_at && new Date(a.claim_token_expires_at).getTime() < Date.now();
  if (!token || expired) {
    token = randomBytes(24).toString("hex");
    await admin.from("affiliates").update({
      claim_token: token,
      claim_token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", a.id);
  }
  return { refLink, dashboardUrl: `${app}/affiliate?claim=${token}` };
}
