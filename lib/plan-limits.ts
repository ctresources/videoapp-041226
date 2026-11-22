/**
 * Videos each plan gets a month: the one place this number lives.
 *
 * lib/stripe.ts, the allowance service and Home all read it here. Until
 * 2026-11-22 two copies said 4 for every plan, so Producer and Influencer
 * accounts saw "2 of 4" on AutoSparks and Home when their plans give 7 and
 * 10. This module stays free of imports so it can be read anywhere, unlike
 * lib/stripe.ts, which starts the payment client on load.
 */
export const VIDEOS_PER_MONTH = { starter: 4, agent: 7, pro: 10 } as const;

export function videosPerMonth(tier: string | null | undefined): number {
  return (VIDEOS_PER_MONTH as Record<string, number>)[tier ?? ""] ?? 0;
}
