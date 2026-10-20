import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

/**
 * Monthly video allowance, tracked as TWO INDEPENDENT buckets so spending long
 * videos never eats into short ones:
 *   shortVideos -> profiles.credits_remaining       (1 per short video)
 *   longVideos  -> profiles.long_credits_remaining  (1 per long video)
 *
 * `videos` is kept as the short-video count for older callers that still read
 * it. Users never see the word "credit" — the UI shows video counts and minutes.
 */
// Plan keys (starter/agent/pro) and `tier` values are internal identifiers —
// they're stored in profiles.subscription_tier, read by the Stripe webhook,
// and passed as the checkout `plan` param. Renaming the *display* name below
// does not touch any of that; only `name`/`price`/`blurb` are user-facing.
export const PLANS = {
  starter: {
    name: "Creator",
    // The owner's Vercel names the prices Creator/Producer/Influencer; the
    // code read Starter/Agent/Pro. Either works (2026-10-20). Creator keeps
    // the old name first, as it has been working and did not change price.
    priceId: (process.env.STRIPE_PRICE_STARTER || process.env.STRIPE_PRICE_CREATOR)!,
    // $79 did not cover its own renders. Four short videos run through Video
    // Agent, the second-dearest endpoint on HeyGen's card, and at the old
    // 500-word cap that was $80.28 of HeyGen against $79 of revenue — before
    // Stripe. $99 against a 400-word cap leaves ~30%. See standardMaxWords.
    price: 99,
    videos: 4,
    shortVideos: 4,
    longVideos: 0,
    blurb: "4 short videos",
    tier: "starter" as const,
  },
  agent: {
    name: "Producer",
    // $149 from $189 on 2026-10-20, in STRIPE_PRICE_PRODUCER.
    priceId: (process.env.STRIPE_PRICE_PRODUCER || process.env.STRIPE_PRICE_AGENT)!,
    price: 149,
    videos: 4,
    shortVideos: 4,
    longVideos: 2,
    blurb: "4 short + 2 long videos",
    tier: "agent" as const,
  },
  pro: {
    name: "Influencer",
    // $199 from $269 on 2026-10-20, in STRIPE_PRICE_INFLUENCER.
    priceId: (process.env.STRIPE_PRICE_INFLUENCER || process.env.STRIPE_PRICE_PRO)!,
    price: 199,
    videos: 4,
    shortVideos: 4,
    longVideos: 4,
    blurb: "4 short + 4 long videos",
    tier: "pro" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
