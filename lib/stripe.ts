import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

/**
 * Monthly video allowance -> profiles.credits_remaining (1 per video, up to
 * 2 minutes each).
 *
 * Long AI videos were retired on 2026-11-13 (the owner's call): customers had
 * made one in four months, an 8-minute render sits at HeyGen's 30-minute
 * auto-fail, and the plans now give more videos instead: 4 / 7 / 10. Camera
 * recordings stay any length and never use the allowance. longVideos stays 0
 * so the webhook writes 0 to profiles.long_credits_remaining.
 *
 * `videos` and `shortVideos` are the same count. Users never see the word
 * "credit" — the UI shows video counts and minutes.
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
    blurb: "4 videos",
    tier: "starter" as const,
  },
  agent: {
    name: "Producer",
    // $149 from $189 on 2026-10-20, in STRIPE_PRICE_PRODUCER.
    priceId: (process.env.STRIPE_PRICE_PRODUCER || process.env.STRIPE_PRICE_AGENT)!,
    price: 149,
    // 4 short + 2 long until 2026-11-13; 7 videos now (worst case ~41% before bills).
    videos: 7,
    shortVideos: 7,
    longVideos: 0,
    blurb: "7 videos",
    tier: "agent" as const,
  },
  pro: {
    name: "Influencer",
    // $199 from $269 on 2026-10-20, in STRIPE_PRICE_INFLUENCER.
    priceId: (process.env.STRIPE_PRICE_INFLUENCER || process.env.STRIPE_PRICE_PRO)!,
    price: 199,
    // 4 short + 4 long until 2026-11-13; 10 videos now (worst case ~37% before bills).
    videos: 10,
    shortVideos: 10,
    longVideos: 0,
    blurb: "10 videos",
    tier: "pro" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
