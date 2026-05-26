import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

export const PLANS = {
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER!,
    price: 39,
    videos: 4,
    tier: "starter" as const,
  },
  agent: {
    name: "Agent",
    priceId: process.env.STRIPE_PRICE_AGENT!,
    price: 69,
    videos: 12,
    tier: "agent" as const,
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO!,
    price: 99,
    videos: 16,
    tier: "pro" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
