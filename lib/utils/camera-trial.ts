/**
 * Free-tier camera recording is only free for a limited trial window, not
 * forever — paid plans (any subscription_tier other than "free") are
 * unaffected and stay unlimited. Applies from account creation date for
 * every free-tier account, including ones that signed up before this
 * shipped — an account already past the window is gated the moment it
 * checks, not grandfathered.
 */
export const CAMERA_TRIAL_DAYS = 30;

const TRIAL_MS = CAMERA_TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** True when a free-tier account's camera trial window has run out. */
export function cameraTrialExpired(createdAt: string | Date, tier: string | null | undefined): boolean {
  if (tier && tier !== "free") return false;
  return Date.now() - new Date(createdAt).getTime() > TRIAL_MS;
}

/** Days left in the trial window, floored at 0. Only meaningful for free-tier accounts. */
export function cameraTrialDaysLeft(createdAt: string | Date): number {
  const remainingMs = TRIAL_MS - (Date.now() - new Date(createdAt).getTime());
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}
