import { FEATURE_PAGES, PRICING_FAQS } from "@/lib/marketing/content";
import { whatsNewItems } from "@/lib/data/whats-new";
import { PLANS } from "@/lib/stripe";
import { hasFeature } from "@/lib/utils/feature-access";

/**
 * SparkReels mode (2026-11-01, the owner's approved mockup).
 *
 * An account switched to it makes videos that promote SparkReels to real
 * estate agents instead of real estate videos for buyers and sellers: the
 * owner's demo account, support@sparkreels.ai. Sparklee's plans, AutoSparks'
 * weekly ideas, Spark Studio's idea chips, the script and blog writer and the
 * Feature videos list on AutoSparks all follow it.
 *
 * The switch lives in feature_access (only the service role writes it, so an
 * account can't turn it on for itself) and is set from Admin.
 *
 * Every fact comes from what the public site already says (lib/marketing),
 * the plans (lib/stripe) and What's New, so a video never promises a feature
 * or a price the app doesn't have.
 */

export const SPARKREELS_MODE = "sparkreels_mode";

export async function isSparkreelsMode(userId: string): Promise<boolean> {
  return hasFeature(userId, SPARKREELS_MODE);
}

/** The ending every SparkReels video asks for. */
export const SPARKREELS_CTA = "Invite real estate agents to try SparkReels free at SparkReels.ai.";

export { SPARKREELS_CHIPS } from "@/lib/sparkreels-chips";

export interface FeatureTopic {
  /** "page:<slug>" for a feature page, "new:<id>" for a What's New item. */
  id: string;
  title: string;
  blurb: string;
  /** Released in the last 30 days. */
  isNew: boolean;
  /** What the writer is asked for. */
  topic: string;
}

/** Every SparkReels feature worth a video: new What's New items first, then the feature pages, then older updates. */
export function featureTopics(now = Date.now()): FeatureTopic[] {
  const recent = (d: string) => now - Date.parse(d) < 30 * 86_400_000;
  const updates = whatsNewItems.map((w) => ({
    id: `new:${w.id}`, title: w.title, blurb: w.description, isNew: recent(w.releaseDate),
    topic: `SparkReels feature for real estate agents: ${w.title}. ${w.description}`,
  }));
  const pages = FEATURE_PAGES.map((f) => ({
    id: `page:${f.slug}`, title: f.navLabel, blurb: f.blurb, isNew: false,
    topic: `SparkReels feature for real estate agents: ${f.navLabel}. ${f.lead}`,
  }));
  return [...updates.filter((u) => u.isNew), ...pages, ...updates.filter((u) => !u.isNew)];
}

/** Everything the writer may say about SparkReels, as one plain-text brief. */
export function sparkreelsFacts(): string {
  const features = FEATURE_PAGES.map((f) => [
    `## ${f.navLabel}${f.paid ? " (paid plans)" : ""}`,
    f.lead,
    ...f.steps.map((s) => `- ${s.title}: ${s.text}`),
    ...f.gets.map((g) => `- ${g}`),
  ].join("\n")).join("\n\n");
  const plans = Object.values(PLANS).map((p) => `- ${p.name}: $${p.price}/month, ${p.blurb}`).join("\n");
  const pricing = PRICING_FAQS.map((q) => `- ${q.q} ${q.a}`).join("\n");
  const updates = whatsNewItems.slice(0, 25).map((w) => `- ${w.title} (${w.releaseDate}): ${w.description}`).join("\n");
  return `SPARKREELS.AI FACTS (the only things you may say about the product)

SparkReels.ai is an AI video and content studio for real estate agents: speak a topic, and it writes the script and blog and makes the video with the agent's AI avatar or Digital Twin in their own cloned voice, then helps post it. Website: SparkReels.ai. Sparklee is the in-app helper. Start free, no credit card.

FEATURES
${features}

PLANS
${plans}
- Free: sign up and make your first AI video free.

PRICING QUESTIONS
${pricing}

RECENT UPDATES (What's New)
${updates}`;
}
