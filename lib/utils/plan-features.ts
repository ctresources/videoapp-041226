/**
 * Which plans unlock which features.
 *
 * Digital twins are no plan's feature any more, and the reason is upstream
 * rather than commercial. Creating one through the API needs HeyGen's Digital
 * Twin Creation endpoint, which is Enterprise-only — $25,000 a year. On
 * Pay-As-You-Go the account has a single custom-avatar slot holding one
 * person's identity, so there is no per-customer twin to sell at any price.
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
export const DIGITAL_TWIN_TIERS: readonly string[] = [];

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
