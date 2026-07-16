import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

/**
 * Plan credit allotments. A short AI video costs 1 credit; a long-form
 * (8–10 min) video costs LONG_FORM_CREDIT_COST (6) — so `videos` below is a
 * CREDIT budget, not a video count:
 *   Starter  4 credits = 4 short
 *   Agent   28 credits = 4 long (24) + 4 short (4)
 *   Pro     52 credits = 8 long (48) + 4 short (4)
 */
export const PLANS = {
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER!,
    price: 59,
    videos: 4,
    blurb: "4 short videos",
    tier: "starter" as const,
  },
  agent: {
    name: "Agent",
    priceId: process.env.STRIPE_PRICE_AGENT!,
    price: 189,
    videos: 28,
    blurb: "4 long-form + 4 short videos",
    tier: "agent" as const,
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO!,
    price: 299,
    videos: 52,
    blurb: "8 long-form + 4 short videos",
    tier: "pro" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
