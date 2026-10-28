import { hasAdminPerks } from "@/lib/utils/roles";
import { PAID_TIERS } from "@/lib/utils/plan-features";

/**
 * Free vs paid, in one place (2026-10-28, the owner's brief).
 *
 * The rule: free accounts see outcomes, paid accounts see workflows. A free
 * account keeps its free video, My Sparks, Settings, billing and a short
 * product overview; the paid pages and the full How It Works guide are for
 * Creator, Producer and Influencer.
 *
 * Built on what the app already trusts: profiles.subscription_tier (the Stripe
 * webhook sets it, and sets "free" again on cancel) and profiles.role
 * (hasAdminPerks: admin and staff get everything). Nothing here is a second
 * subscription record. Plain functions with no server imports, so the menu
 * (browser) and the page guards (server) read the same map.
 */

export type AccessLevel = "visitor" | "free" | "creator" | "producer" | "influencer" | "admin";

export type FeatureKey =
  | "free_video"
  | "whats_new"
  | "whats_new_details"
  | "full_how_it_works"
  | "autosparks"
  | "spark_tools"
  | "spark_calendar"
  | "spark_insights"
  | "newsletter"
  | "video_email"
  | "advanced_publishing"
  | "social_autopublishing"
  | "youtube_tools"
  | "crm_integrations"
  | "halo_sites"
  | "boldtrail"
  | "gohighlevel";

/** subscription_tier → level. "agency" is an old tier, kept as the top plan. */
const TIER_LEVEL: Record<string, AccessLevel> = {
  starter: "creator",
  agent: "producer",
  pro: "influencer",
  agency: "influencer",
};

const PAID: AccessLevel[] = ["creator", "producer", "influencer", "admin"];
const SIGNED_IN: AccessLevel[] = ["free", ...PAID];

/**
 * Who may use what. Every paid plan gets every workflow today; when a feature
 * becomes Producer-and-up, change its line here and nowhere else.
 */
export const FEATURE_ACCESS: Record<FeatureKey, readonly AccessLevel[]> = {
  free_video: SIGNED_IN,
  whats_new: SIGNED_IN,
  whats_new_details: PAID,
  full_how_it_works: PAID,
  autosparks: PAID,
  spark_tools: PAID,
  spark_calendar: PAID,
  spark_insights: PAID,
  newsletter: PAID,
  video_email: PAID,
  advanced_publishing: PAID,
  social_autopublishing: PAID,
  youtube_tools: PAID,
  crm_integrations: PAID,
  halo_sites: PAID,
  boldtrail: PAID,
  gohighlevel: PAID,
};

export function getAccessLevel(
  profile: { subscription_tier?: string | null; role?: string | null } | null | undefined,
): AccessLevel {
  if (!profile) return "visitor";
  if (hasAdminPerks(profile.role)) return "admin";
  const tier = profile.subscription_tier ?? "free";
  if (PAID_TIERS.includes(tier)) return TIER_LEVEL[tier] ?? "creator";
  return "free";
}

export function isPaidLevel(level: AccessLevel): boolean {
  return PAID.includes(level);
}

export function canAccessFeature(level: AccessLevel, feature: FeatureKey): boolean {
  return FEATURE_ACCESS[feature].includes(level);
}

/** Where every Upgrade / Unlock / View Plans button goes: the existing Billing tab. */
export const UPGRADE_HREF = "/settings/billing";
