/**
 * What each plan includes: the one place these numbers live.
 *
 * lib/stripe.ts, the allowance service, Home and the render all read them
 * here. This module stays free of imports so it can be read anywhere, unlike
 * lib/stripe.ts, which starts the payment client on load.
 *
 * Two plans since 2026-11-22 (the owner's approved pricing):
 *   Creator  $99:  4 AI videos a month, any style.
 *   Producer $149: 4 Full AI Avatar videos a month, plus unlimited AI Avatar
 *                  in Circle videos, up to 1 a day.
 * Influencer ("pro") is off the pricing page; nobody pays for it today, and
 * the tier keeps working for the owner's admin accounts and any old link.
 */
export const VIDEOS_PER_MONTH = { starter: 4, agent: 4, pro: 10 } as const;

/**
 * Videos a plan refills each month. `override` is profiles.plan_videos_override:
 * a customer already on Producer when it changed keeps their 7 for as long as
 * they stay subscribed.
 */
export function videosPerMonth(tier: string | null | undefined, override?: number | null): number {
  if (tier === "agent" && override) return override;
  return (VIDEOS_PER_MONTH as Record<string, number>)[tier ?? ""] ?? 0;
}

/** Free AI Avatar in Circle videos a day, on the plans that have them. */
export const CIRCLE_DAILY_LIMIT = 1;

/** What a free one is recorded as on the video, for counting today's. */
export const CIRCLE_CREDIT_SOURCE = "circle_unlimited";

export const hasUnlimitedCircle = (tier: string | null | undefined): boolean => tier === "agent" || tier === "pro";
