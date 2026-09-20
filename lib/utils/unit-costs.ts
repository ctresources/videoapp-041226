/**
 * What one account costs to serve.
 *
 * Every figure here is a real supplier rate, and the ones that can be measured
 * are measured rather than assumed: a finished render records what it actually
 * cost (see estimateRenderCostUsd and store-video), so the video half of this
 * is arithmetic on invoices rather than a guess. Only the parts nobody bills
 * per unit — a sentence written, a page searched — are estimated, and they are
 * kept separate so an estimate can never be mistaken for a measurement.
 *
 * The point of separating them: video is roughly nine tenths of the variable
 * cost of this product. An estimate that is 50% out on article writing moves a
 * monthly total by cents. Reporting them in one undifferentiated number would
 * hide which of those two facts is which.
 */

/**
 * A rendered video whose cost was never recorded.
 *
 * Cost recording shipped after most of the early renders were made, so those
 * rows have a duration and no price. Priced at the blended rate from the rows
 * that DO have one rather than dropped, because dropping them understates a
 * user's cost and quietly flatters the margin.
 *
 * Overridable for the same reason the rates in heygen.ts are: it is somebody
 * else's price and a redeploy is a poor way to track it.
 */
export const FALLBACK_USD_PER_RENDER_SECOND =
  Number(process.env.RENDER_USD_PER_SECOND || "") || 0.0406;

/**
 * A render with neither a recorded cost NOR a recorded duration.
 *
 * Every video made before cost recording shipped is in this state — 97 of them
 * at the time of writing, all finished and all paid for. Pricing them per
 * second gives zero, which would report roughly $500 of real spending as free
 * and make the whole view a lie in the flattering direction.
 *
 * So they are priced at the blended average of the renders we DO have invoices
 * for, passed in by the caller. This constant is only the floor for an account
 * that has no priced renders at all to average.
 */
export const FALLBACK_USD_PER_RENDER =
  Number(process.env.RENDER_USD_PER_VIDEO || "") || 5.74;

/**
 * One AI image background.
 *
 * gpt-image-1 at medium quality bills about 1,570 output tokens for the 16:9
 * and 9:16 shapes this app asks for, at $40 per million — so a shade over six
 * cents. The type drawn over it is rendered on our own server and costs
 * nothing.
 */
export const IMAGE_USD = Number(process.env.IMAGE_USD_EACH || "") || 0.063;

/**
 * One AI writing call — a script, an article, a set of titles.
 *
 * The roughest number here, and deliberately a single blended one: the calls
 * differ (a searched 1,200-word article against a short metadata pass) but
 * they are all cents, and splitting them into three estimates would give the
 * appearance of precision none of them has. An article with web search runs
 * around 10c; the short passes are nearer 1c.
 */
export const AI_TEXT_USD = Number(process.env.AI_TEXT_USD_EACH || "") || 0.06;

/** Monthly price of each plan, for margin. Free and admin accounts bill nothing. */
export const PLAN_REVENUE: Record<string, number> = {
  starter: 99,
  agent: 189,
  pro: 269,
};

export interface UserCost {
  userId: string;
  email: string | null;
  name: string | null;
  tier: string;
  role: string | null;
  /** Renders with a recorded cost, and what they actually came to. */
  videosPriced: number;
  videoUsdMeasured: number;
  /** Renders with no recorded cost, priced at the blended rate. */
  videosEstimated: number;
  videoUsdEstimated: number;
  images: number;
  imageUsd: number;
  aiCalls: number;
  aiTextUsd: number;
  totalUsd: number;
  revenueUsd: number;
  marginUsd: number;
}

export function costsFor(input: {
  userId: string;
  email: string | null;
  name: string | null;
  tier: string | null;
  role: string | null;
  pricedCostUsd: number;
  pricedVideos: number;
  /** Already costed by the caller: by duration where there is one, else blended. */
  unpricedCostUsd: number;
  unpricedVideos: number;
  images: number;
  aiCalls: number;
}): UserCost {
  const videoUsdEstimated = input.unpricedCostUsd;
  const imageUsd = input.images * IMAGE_USD;
  const aiTextUsd = input.aiCalls * AI_TEXT_USD;
  const totalUsd = input.pricedCostUsd + videoUsdEstimated + imageUsd + aiTextUsd;
  const tier = input.tier ?? "free";
  // An admin account is staff, not a customer: counting its plan as revenue
  // would show the house paying itself and turn real losses into profits.
  const revenueUsd = input.role === "admin" ? 0 : (PLAN_REVENUE[tier] ?? 0);

  return {
    userId: input.userId,
    email: input.email,
    name: input.name,
    tier,
    role: input.role,
    videosPriced: input.pricedVideos,
    videoUsdMeasured: input.pricedCostUsd,
    videosEstimated: input.unpricedVideos,
    videoUsdEstimated,
    images: input.images,
    imageUsd,
    aiCalls: input.aiCalls,
    aiTextUsd,
    totalUsd,
    revenueUsd,
    marginUsd: revenueUsd - totalUsd,
  };
}

export function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}
