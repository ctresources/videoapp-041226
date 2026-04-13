import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

export const PLANS = {
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER!,
    price: 27,
    videos: 4,
    tier: "starter" as const,
  },
  agent: {
    name: "Agent",
    priceId: process.env.STRIPE_PRICE_AGENT!,
    price: 47,
    videos: 12,
    tier: "agent" as const,
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO!,
    price: 97,
    videos: 30,
    tier: "pro" as const,
  },
  agency: {
    name: "Agency",
    priceId: process.env.STRIPE_PRICE_AGENCY!,
    price: 197,
    videos: 100,
    tier: "agency" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
