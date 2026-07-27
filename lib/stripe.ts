import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

/**
 * Monthly render allowance. Internally this is a budget: a short video draws 1,
 * a long video draws LONG_FORM_CREDIT_COST (3) because it costs roughly 3x as
 * much to render. `videos` is that BUDGET, not a video count:
 *   Starter   4 = 4 short (up to 3 min each)
 *   Agent    10 = 4 short (up to 4 min) + 2 long (up to 8 min, 2x3=6)
 *   Pro      19 = 4 short (up to 4 min) + 5 long (up to 8 min, 5x3=15)
 *
 * Users never see the word "credit" — the UI presents this as video counts and
 * minutes (see the billing and dashboard pages).
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
    videos: 10,
    blurb: "4 short + 2 long videos",
    tier: "agent" as const,
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO!,
    price: 299,
    videos: 19,
    blurb: "4 short + 5 long videos",
    tier: "pro" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
