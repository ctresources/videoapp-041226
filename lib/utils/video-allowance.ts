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

/**
 * Spends one video of this kind, and does it exactly once.
 *
 * chargeFor computes an absolute new value from a balance that was read
 * earlier, and writing that value back is a lost update: press Generate in
 * two tabs a second apart and both read 2, both write 1, and two videos are
 * made for the price of one. The same shape sits in the refund path, so a
 * refund landing beside a charge could erase one of them.
 *
 * The write is now conditional on the balance still being what we read — the
 * update matches on the old value as well as the user id, so the second
 * writer changes no rows and is sent back to re-read. Postgres does the
 * comparing, so no amount of overlap can double-spend.
 *
 * Returns what was charged, so a failed render refunds the same balance it
 * took, or null when there is nothing of this kind left.
 */
export async function chargeOneVideo(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  kind: VideoKind,
): Promise<{ column: keyof AllowanceColumns; source: AllowanceSource } | null> {
  // Three attempts. Each retry means another tab won the race, and a user has
  // to run out of balance long before they run out of attempts.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: fresh } = await admin
      .from("profiles")
      .select(ALLOWANCE_SELECT)
      .eq("id", userId)
      .single();
    if (!fresh) return null;

    const charge = chargeFor(fresh as Partial<AllowanceColumns>, kind);
    if (!charge) return null;

    const { data: updated } = await admin
      .from("profiles")
      .update({ [charge.column]: charge.newValue })
      .eq("id", userId)
      .eq(charge.column, charge.newValue + 1) // still what we read?
      .select("id");

    if (updated && updated.length > 0) {
      return { column: charge.column, source: charge.source };
    }
  }
  return null;
}
