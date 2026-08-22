/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Beta capacity — ONE definition, used by every path that can create a user.
 *
 * This previously lived in three places that disagreed: the capacity endpoint
 * stopped at 100, the OAuth callback used `count > MAX` and so let the 101st
 * user through, and email registration did not check at all — which made the
 * cap bypassable simply by using the email form instead of Google.
 */
export const MAX_BETA_USERS = Number(process.env.MAX_BETA_USERS ?? 100);

/**
 * Only accounts created on or after this instant count against the beta cap.
 *
 * This is the reset switch: set BETA_START_AT to today and the run starts over
 * at 0 of 100 without touching any existing account. Unset means "count
 * everyone", which is the original behaviour.
 */
const BETA_START_AT = process.env.BETA_START_AT || null;

export interface Capacity {
  open: boolean;
  count: number;
  max: number;
  remaining: number;
}

/** Current signup capacity, for display and for pre-signup gating. */
export async function getCapacity(admin: any): Promise<Capacity> {
  // Admin accounts (the owner's own test/support logins) don't count against
  // the 100 real-agent beta slots.
  let query = admin.from("profiles").select("*", { count: "exact", head: true }).neq("role", "admin");
  if (BETA_START_AT) query = query.gte("created_at", BETA_START_AT);
  const { count } = await query;

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
  let query = admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .neq("id", newUserId)
    .neq("role", "admin");
  if (BETA_START_AT) query = query.gte("created_at", BETA_START_AT);
  const { count } = await query;

  return (count ?? 0) < MAX_BETA_USERS;
}

/** Spots remaining at which the owner gets a heads-up email. */
const LOW_SPOTS_THRESHOLD = 10;

/**
 * Emails the owner once when the beta is nearly full, and once when it's gone.
 *
 * The "once" matters: this runs after every signup, and without the
 * app_settings flag the owner would get an alert per signup for the last ten
 * accounts. Never throws — a failed notification must not fail a signup.
 */
export async function maybeNotifyCapacity(admin: any): Promise<void> {
  try {
    const cap = await getCapacity(admin);
    if (cap.remaining > LOW_SPOTS_THRESHOLD) return;

    const flag = cap.remaining <= 0 ? "beta_full_notified" : "beta_low_notified";
    const { data: existing } = await admin
      .from("app_settings")
      .select("key")
      .eq("key", flag)
      .maybeSingle();
    if (existing) return; // already told them

    await admin.from("app_settings").upsert({
      key: flag,
      value: { count: cap.count, max: cap.max, at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });

    const { notifyBetaCapacity } = await import("@/lib/email");
    await notifyBetaCapacity({ count: cap.count, max: cap.max, remaining: cap.remaining });
  } catch (err) {
    console.error("[capacity] notify failed:", err);
  }
}
