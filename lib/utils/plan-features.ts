/**
 * Which plans unlock which features.
 *
 * Digital twins were switched off on 2026-09-01 on the belief that per-customer
 * twins needed HeyGen's Enterprise API, after the API refused a second twin in
 * July. On 2026-10-19 HeyGen support confirmed to the owner that API-created
 * twins need no Enterprise plan and no web slots ($2.13 each), and they are on
 * for every plan again (DIGITAL_TWIN_TIERS below).
 *
 * Photo avatars are unaffected and are what every customer's videos use: $1.00
 * per creation on this plan, available to everyone, and already set up for the
 * users who have one.
 *
 * Empty rather than deleted. The gate is applied at creation, at render time
 * and in the settings UI, and leaving one definition in place — still passing
 * for admins, who hold the account's own slot — keeps those three agreeing.
 * Restoring the feature is this list, not a hunt through three files.
 */
/**
 * Every plan since 2026-10-19, the owner's call, after HeyGen confirmed that
 * twins created through the API need no Enterprise plan and no web slots:
 * $2.13 each, rendered by the second (Avatar III $0.60/min, which the Direct
 * path already uses for twins). See docs/heygen-pricing.md. In July the API
 * did refuse a second twin ("resource_limit_reached"); the creation route now
 * tells support at once if that comes back.
 */
export const DIGITAL_TWIN_TIERS: readonly string[] = ["free", "pro", "agency"];

export function canUseDigitalTwin(tier: string | null | undefined, role?: string | null): boolean {
  if (role === "admin") return true;
  return DIGITAL_TWIN_TIERS.includes(tier ?? "free");
}

/**
 * Says the feature is not offered, not that a bigger plan would unlock it.
 *
 * The old wording pointed at Billing and promised a twin on Producer or
 * Influencer. Once no tier passes the gate, that sends a paying customer to
 * spend more money on something they still will not get.
 */
export const DIGITAL_TWIN_UPGRADE_MESSAGE =
  "Digital twins aren't available right now. Your photo avatar works on every plan and is what your videos are made with — nothing to set up beyond the headshot in your profile.";
