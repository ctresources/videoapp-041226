/**
 * The image generator's monthly limit.
 *
 * Counted from generated_images rather than kept as a balance on the profile.
 * A balance has to be refilled by the Stripe webhook on every renewal, trial
 * conversion and plan change; a count of this month's rows is right by
 * construction and resets on the 1st without anything running.
 *
 * Only AI backgrounds count. Those are the images that cost money to make;
 * text over the agent's own photo, or a text edit over a background already
 * made, costs nothing and is not limited.
 */

export const IMAGE_MONTHLY_LIMIT = 100;

/** Midnight UTC on the 1st of the current month. */
export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function aiImagesUsedThisMonth(
  client: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
): Promise<number> {
  const { count } = await client
    .from("generated_images")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("ai_background", true)
    .gte("created_at", monthStartIso());
  return count ?? 0;
}
