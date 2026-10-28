import { FREE_BLOGS_BEFORE_VIDEO, FREE_IMAGES_BEFORE_VIDEO, FREE_RECORDINGS_BEFORE_VIDEO, FREE_RUNS_BEFORE_VIDEO, FREE_TRIAL_DAYS } from "@/lib/utils/free-trial";

/**
 * What Ask Sparklee tells a free account is free and what is paid
 * (2026-10-28, the owner's ask). Kept beside the rules it describes: the
 * numbers come from lib/utils/free-trial.ts, and the paid list matches
 * FEATURE_ACCESS in lib/access.ts. When a feature changes plan, change it in
 * both places.
 */
export const FREE_PLAN_INCLUDES: string[] = [
  "One free video, made with your avatar or as a voice over. With a Digital Twin, the free video is Avatar in circle.",
  `Before the free video: ${FREE_BLOGS_BEFORE_VIDEO} blog, ${FREE_RECORDINGS_BEFORE_VIDEO} camera recording, ${FREE_RUNS_BEFORE_VIDEO} Spark Tools tries and ${FREE_IMAGES_BEFORE_VIDEO} AI images.`,
  `For ${FREE_TRIAL_DAYS} days after the free video: unlimited blogs, camera recordings and the Spark Tools generators (titles, descriptions, tags, scripts, thumbnails, images, banners, channel name, LinkedIn profile, AI Answer Blocks).`,
  "Setting up in Settings: market, AI voice clone, brand profile, Digital Twin and its approval, closing line, import address, phone.",
  "Publishing to YouTube, My Sparks, What's New, and the short How It Works overview.",
  "Ask Sparklee, 5 conversations a day.",
];

export const PAID_PLANS_ONLY: string[] = [
  "Avatar video (the full video) with your Digital Twin",
  "Outfits for your Digital Twin",
  "Record My Screen",
  "Spark Tools after the free tries and the free days are used",
  "Seller Update, Ask for Google Review Video Email and Google Reviews in Spark Tools",
  "Email it (sending a video by email) and the newsletter",
  "AutoSparks: weekly drafts, Halo sites, email drafts and seller updates",
  "Posting to Facebook, Instagram, LinkedIn, TikTok, Google Business and the other accounts (Creator posts to YouTube plus 3 others; Producer and Influencer to all)",
  "CRM: BoldTrail and GoHighLevel",
  "Spark Insights and Spark Calendar",
  "The Affiliate Program",
  "The full step-by-step How It Works guides",
];

export const PAID_PLAN_NAMES = "Creator, Producer and Influencer";

/** The block added to Sparklee's instructions for a free account. */
export function freePlanBriefing(): string {
  return [
    "THEY ARE ON THE FREE PLAN. What the free plan includes:",
    ...FREE_PLAN_INCLUDES.map((l) => `- ${l}`),
    "",
    `Paid plans only (${PAID_PLAN_NAMES}):`,
    ...PAID_PLANS_ONLY.map((l) => `- ${l}`),
    "",
    "If they ask about anything on the paid-only list, say plainly that it's for paid plans and that Settings, then Billing, shows the plans. Say what it does in one short sentence if they ask, but never explain how to set it up or use it. If something is on the free list, help them with it as usual. If you're not sure which list something is on, say you're not sure and suggest Settings, then Billing.",
  ].join("\n");
}
