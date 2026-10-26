import { FAQ_GROUPS, FEATURE_PAGES, PRICING_FAQS } from "@/lib/marketing/content";
import { PLANS } from "@/lib/stripe";

/**
 * What Ask Sparklee on the public website may answer from (2026-10-26): the
 * website's own feature pages, FAQs and plan prices, so her answers stay in
 * step with what the pages say. Built once per server instance.
 */
let cached: string | null = null;

export function websiteKnowledge(): string {
  if (cached) return cached;
  const parts: string[] = [];

  parts.push("PLANS (monthly):");
  for (const p of Object.values(PLANS)) parts.push(`- ${p.name}: $${p.price} a month, ${p.blurb}.`);
  parts.push("- Free: the first 100 agents get 1 free AI video, no credit card. The free video publishes to YouTube; Instagram, Facebook, LinkedIn and more come with a paid plan.");

  parts.push("", "FEATURES:");
  for (const f of FEATURE_PAGES) {
    parts.push(`## ${f.navLabel}${f.paid ? " (paid plans)" : ""}: ${f.blurb}`);
    parts.push(f.lead);
    if (f.gets.length) parts.push(`What you get: ${f.gets.join("; ")}`);
    for (const q of f.faqs) parts.push(`Q: ${q.q} A: ${q.a}`);
  }

  parts.push("", "FAQ:");
  for (const g of FAQ_GROUPS) for (const q of g.items) parts.push(`Q: ${q.q} A: ${q.a}`);
  for (const q of PRICING_FAQS) parts.push(`Q: ${q.q} A: ${q.a}`);

  cached = parts.join("\n");
  return cached;
}
