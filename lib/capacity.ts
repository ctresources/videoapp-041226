/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Beta capacity — ONE definition, used by every path that can create a user.
 *
 * This previously lived in three places that disagreed: the capacity endpoint
 * stopped at 100, the OAuth callback used `count > MAX` and so let the 101st
 * user through, and email registration did not check at all — which made the
 * cap bypassable simply by using the email form instead of Google.
 */
export const MAX_BETA_USERS = 100;

export interface Capacity {
  open: boolean;
  count: number;
  max: number;
  remaining: number;
}

/** Current signup capacity, for display and for pre-signup gating. */
export async function getCapacity(admin: any): Promise<Capacity> {
  const { count } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });

  const total = count ?? 0;
  return {
    // `<` not `<=`: with 100 profiles the beta is full, not open for one more.
    open: total < MAX_BETA_USERS,
    count: total,
    max: MAX_BETA_USERS,
    remaining: Math.max(0, MAX_BETA_USERS - total),
  };
}

/**
 * Capacity check for a user who has ALREADY been created.
 *
 * Google OAuth creates the auth user (and, via the handle_new_user trigger,
 * their profile row) during the code exchange — before we get a chance to
 * refuse. So the newcomer is already in the count, and a plain `total < MAX`
 * would turn away the 100th person. Exclude them and ask whether the other
 * profiles have already filled the beta.
 */
export async function hasCapacityForNewUser(admin: any, newUserId: string): Promise<boolean> {
  const { count } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .neq("id", newUserId);

  return (count ?? 0) < MAX_BETA_USERS;
}
