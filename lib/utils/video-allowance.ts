/**
 * Video allowances.
 *
 * Each user has four balances — a monthly PLAN allowance that resets every
 * billing cycle, and PURCHASED add-ons that never expire:
 *
 *   plan short  -> profiles.credits_remaining
 *   plan long   -> profiles.long_credits_remaining
 *   bought short-> profiles.purchased_short_videos
 *   bought long -> profiles.purchased_long_videos
 *
 * Short and long never mix. Within a kind, the PLAN balance is always spent
 * first, because it expires at the end of the month while purchased videos
 * don't — spending the permanent one first would waste the expiring one.
 */

export type VideoKind = "short" | "long";
export type AllowanceSource = "plan" | "purchased";

export interface AllowanceColumns {
  credits_remaining: number;
  long_credits_remaining: number;
  purchased_short_videos: number;
  purchased_long_videos: number;
}

/** The four columns to select when you need to charge or display a balance. */
export const ALLOWANCE_SELECT =
  "credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos";

export function planColumn(kind: VideoKind): keyof AllowanceColumns {
  return kind === "long" ? "long_credits_remaining" : "credits_remaining";
}

export function purchasedColumn(kind: VideoKind): keyof AllowanceColumns {
  return kind === "long" ? "purchased_long_videos" : "purchased_short_videos";
}

/** Videos of this kind the user can make right now (plan + purchased). */
export function availableFor(p: Partial<AllowanceColumns> | null, kind: VideoKind): number {
  if (!p) return 0;
  return (p[planColumn(kind)] ?? 0) + (p[purchasedColumn(kind)] ?? 0);
}

/**
 * Works out which balance to charge. Returns the column to decrement, its new
 * value, and which source was used (recorded on the video so a failed render
 * refunds the same balance it took).
 */
export function chargeFor(
  p: Partial<AllowanceColumns>,
  kind: VideoKind,
): { column: keyof AllowanceColumns; newValue: number; source: AllowanceSource } | null {
  const planCol = planColumn(kind);
  const planLeft = p[planCol] ?? 0;
  if (planLeft > 0) {
    return { column: planCol, newValue: planLeft - 1, source: "plan" };
  }

  const boughtCol = purchasedColumn(kind);
  const boughtLeft = p[boughtCol] ?? 0;
  if (boughtLeft > 0) {
    return { column: boughtCol, newValue: boughtLeft - 1, source: "purchased" };
  }

  return null; // nothing left of this kind
}

/** The column a refund should go back to, given what the charge recorded. */
export function refundColumn(kind: VideoKind, source: AllowanceSource): keyof AllowanceColumns {
  return source === "purchased" ? purchasedColumn(kind) : planColumn(kind);
}
