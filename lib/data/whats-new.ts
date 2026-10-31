import type { FeatureKey } from "@/lib/access";

/**
 * What's New (2026-10-28). One object per update; the page sorts newest first.
 *
 * To add an update: add an object here, with a howItWorksAnchor that exists
 * on the How It Works page (an id="..." there). The menu's NEW dot comes back
 * for everyone on its own, because the newest id changes.
 *
 * Only features that are built and on the site. Marketing-level wording:
 * free accounts read the title and description, never the setup.
 */
export type WhatsNewItem = {
  id: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  releaseDate: string;
  featureKey?: FeatureKey;
  howItWorksAnchor?: string;
  badge?: "NEW" | "IMPROVED";
  /** The feature needs a paid plan: free accounts get Unlock This Feature. */
  paidOnlyDetails?: boolean;
  /** For an update a free account can use: where its button goes. */
  freeHref?: string;
  freeLabel?: string;
  /** false hides it without deleting it. */
  published?: boolean;
};

const ITEMS: WhatsNewItem[] = [
  {
    id: "twin-photos-footage",
    title: "Your Twin in Front of Your Footage",
    description:
      "In a horizontal Avatar video, your Digital Twin stands in front of your photos and clips as they play, at the side or in the corner.",
    releaseDate: "2026-10-31",
    howItWorksAnchor: "digital-twin-backgrounds",
    badge: "NEW",
    // A twin in Avatar video is paid plans only.
    paidOnlyDetails: true,
    // Hidden 2026-10-31: built, but no live video made with it yet. Set true
    // once one has come back right.
    published: false,
  },
  {
    id: "video-business-card",
    title: "Video Business Card",
    description:
      "A short video card with your name and contact details, plus a card page with tap-to-call, Book a call and Save my contact. Share it by text, QR code or email signature.",
    releaseDate: "2026-10-30",
    howItWorksAnchor: "video-business-card",
    featureKey: "tool_workflows",
    badge: "NEW",
    // Paid plans only (2026-10-30, the owner's call).
    paidOnlyDetails: true,
  },
  {
    id: "home-ask-sparklee",
    title: "Home: Tell Sparklee What You Want",
    description:
      "Say or type a goal and Sparklee plans it from your plan and accounts. See what needs your approval, what she found and what is running, all on one page. Nothing posts until you approve.",
    releaseDate: "2026-10-29",
    howItWorksAnchor: "home",
    badge: "NEW",
    freeHref: "/home",
    freeLabel: "Open Home",
  },
  {
    id: "twin-outfits",
    title: "Outfits for Your Digital Twin",
    description:
      "Describe a new outfit and your Digital Twin wears it, moving just like you, in every video.",
    releaseDate: "2026-10-28",
    featureKey: "twin_outfits",
    howItWorksAnchor: "twin-outfits",
    badge: "NEW",
    // Paid plans only (2026-10-28, the owner's call).
    paidOnlyDetails: true,
  },
  {
    id: "google-review-video",
    title: "Ask for a Google Review by Video",
    description:
      "Send past clients a short, personal video asking for a Google review, with your review link one tap away.",
    releaseDate: "2026-10-27",
    featureKey: "tool_workflows",
    howItWorksAnchor: "google-review-video",
    badge: "NEW",
    paidOnlyDetails: true,
    // Hidden 2026-10-28: on the site, but not one review email has been sent
    // yet. Set true once one has gone out and arrived.
    published: false,
  },
  {
    id: "boldtrail-video-email",
    title: "BoldTrail Video Email",
    description:
      "Turn a finished Spark into a personal video follow-up for your contacts, sent from your BoldTrail address.",
    releaseDate: "2026-10-27",
    featureKey: "boldtrail",
    howItWorksAnchor: "email-it",
    badge: "NEW",
    paidOnlyDetails: true,
  },
  {
    id: "record-my-screen",
    title: "Record My Screen",
    description:
      "Walk through a listing, a market chart or a website with you in a corner circle, saved straight to My Sparks.",
    releaseDate: "2026-10-27",
    featureKey: "tool_workflows",
    howItWorksAnchor: "record-my-screen",
    badge: "NEW",
    // Paid plans only (2026-10-28, the owner's call).
    paidOnlyDetails: true,
  },
  {
    id: "seller-updates",
    title: "Seller Updates on AutoSparks",
    description:
      "A weekly video update for each listing's sellers, made from your numbers and sent on the day you choose.",
    releaseDate: "2026-10-26",
    featureKey: "autosparks",
    howItWorksAnchor: "seller-updates",
    badge: "NEW",
    paidOnlyDetails: true,
    // Confirmed working by the owner, 2026-10-28.
  },
  {
    id: "halo-sites",
    title: "Website / Halo Content Workflow",
    description:
      "Bring your existing authority content into SparkReels, make the video, publish it, and put the finished video back on the page that started it.",
    releaseDate: "2026-10-24",
    featureKey: "halo_sites",
    howItWorksAnchor: "halo-sites",
    badge: "NEW",
    paidOnlyDetails: true,
  },
  {
    id: "digital-twin-backgrounds",
    title: "Digital Twin Backgrounds",
    description:
      "Stand full size in front of a new background in your Agent Intro: a colour, a town photo, or a place you describe.",
    releaseDate: "2026-10-24",
    featureKey: "free_video",
    howItWorksAnchor: "digital-twin-backgrounds",
    badge: "NEW",
    paidOnlyDetails: false,
    freeHref: "/settings#twin",
    freeLabel: "Open Digital Twin",
  },
  {
    id: "auto-publish",
    title: "Auto-Publish",
    description: "Create once and publish across your connected social channels.",
    releaseDate: "2026-10-12",
    featureKey: "social_autopublishing",
    howItWorksAnchor: "auto-publish",
    badge: "NEW",
    paidOnlyDetails: true,
  },
];

/** Published updates, newest first (ties keep the order above). */
export const whatsNewItems: WhatsNewItem[] = ITEMS
  .filter((i) => i.published !== false)
  .map((item, index) => ({ item, index }))
  .sort((a, b) => b.item.releaseDate.localeCompare(a.item.releaseDate) || a.index - b.index)
  .map(({ item }) => item);

/** The newest update's id: what profiles.last_seen_whats_new is compared with. */
export const LATEST_WHATS_NEW_ID: string = whatsNewItems[0]?.id ?? "";

/** The event the menu listens for, so its dot clears without a reload. */
export const WHATS_NEW_SEEN_EVENT = "spark:whats-new-seen";
