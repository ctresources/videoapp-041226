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

/**
 * A free-tier signup that never touches its one free video within this many
 * days quietly stops occupying one of the 100 marketed beta slots, so a new
 * person can take it. Internal only — never state this in user-facing copy;
 * the account itself is untouched (login still works, the credit is not
 * revoked), it just no longer blocks a new signup while dormant.
 */
const RECLAIM_DORMANT_TRIAL_AFTER_DAYS = 30;
const RECLAIM_MS = RECLAIM_DORMANT_TRIAL_AFTER_DAYS * 24 * 60 * 60 * 1000;
/** profiles.credits_remaining default for a fresh free-tier signup — "unused" means still exactly this. */
const FREE_VIDEO_STARTING_CREDITS = 1;

interface CapacityRow {
  subscription_tier: string | null;
  credits_remaining: number | null;
  created_at: string;
}

function isDormantUnusedTrial(p: CapacityRow): boolean {
  if (p.subscription_tier !== "free") return false;
  if (p.credits_remaining !== FREE_VIDEO_STARTING_CREDITS) return false; // any usage, or a purchased add-on, disqualifies
  return Date.now() - new Date(p.created_at).getTime() > RECLAIM_MS;
}

/**
 * Rows that count toward the 100-slot cap: excludes admins (the owner's own
 * test/support logins) and dormant free-tier accounts (see above). Fetches
 * rows rather than a head-only count because the dormant check needs
 * per-row fields — the cap tops out at 100 rows, so this is cheap.
 */
async function countedProfiles(admin: any, extraFilter?: (q: any) => any): Promise<number> {
  let query = admin
    .from("profiles")
    .select("subscription_tier, credits_remaining, created_at")
    .neq("role", "admin");
  if (BETA_START_AT) query = query.gte("created_at", BETA_START_AT);
  if (extraFilter) query = extraFilter(query);
  const { data } = await query;
  const rows = (data ?? []) as CapacityRow[];
  return rows.filter((r) => !isDormantUnusedTrial(r)).length;
}

export interface Capacity {
  open: boolean;
  count: number;
  max: number;
  remaining: number;
}

/** Current signup capacity, for display and for pre-signup gating. */
export async function getCapacity(admin: any): Promise<Capacity> {
  const total = await countedProfiles(admin);
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
  const total = await countedProfiles(admin, (q) => q.neq("id", newUserId));
  return total < MAX_BETA_USERS;
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
