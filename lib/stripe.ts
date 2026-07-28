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
export const PLANS = {
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER!,
    price: 59,
    videos: 4,
    shortVideos: 4,
    longVideos: 0,
    blurb: "4 short videos",
    tier: "starter" as const,
  },
  agent: {
    name: "Agent",
    priceId: process.env.STRIPE_PRICE_AGENT!,
    price: 189,
    videos: 4,
    shortVideos: 4,
    longVideos: 2,
    blurb: "4 short + 2 long videos",
    tier: "agent" as const,
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO!,
    price: 299,
    videos: 4,
    shortVideos: 4,
    longVideos: 5,
    blurb: "4 short + 5 long videos",
    tier: "pro" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
