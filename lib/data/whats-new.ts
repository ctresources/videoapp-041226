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
    id: "two-plans",
    title: "Two Simple Plans, With Unlimited AI Avatar in Circle",
    description:
      "Creator is $99 with 4 AI videos a month. Producer is $149 with 4 Full AI Avatar videos plus unlimited AI Avatar in Circle videos, up to 1 a day. Recording yourself on camera never uses your videos.",
    releaseDate: "2026-11-22",
    howItWorksAnchor: "step-11",
    badge: "NEW",
    freeHref: "/settings/billing",
    freeLabel: "See plans",
  },
  {
    id: "like-a-video",
    title: "Make One Like a Video You Love",
    description:
      "Upload a video you like or paste a YouTube link, and say your topic. SparkReels reads its style and writes your own script built the same way, with the video type, shape, captions and music picked to match.",
    releaseDate: "2026-11-17",
    howItWorksAnchor: "like-a-video",
    badge: "NEW",
    freeHref: "/create?tab=like",
    freeLabel: "Try it",
  },
  {
    id: "moving-photos",
    title: "Moving Photos in Quick Reels",
    description:
      "Turn on Moving photos and each listing photo comes to life with a slow camera move, made only from the photo, so the home is never changed. Market Update and Neighborhood get moving shots of the town.",
    releaseDate: "2026-11-16",
    howItWorksAnchor: "moving-photos",
    badge: "NEW",
    paidOnlyDetails: true,
  },
  {
    id: "photo-touch-up",
    title: "Photo Touch-Up",
    description:
      "Make a listing photo shine: Enhance, Stage an empty room, Declutter, Twilight or Blue sky. The home itself is never changed, and each photo is labeled for the MLS. Pick a listing photo or upload your own.",
    releaseDate: "2026-11-15",
    featureKey: "tool_workflows",
    howItWorksAnchor: "photo-touch-up",
    badge: "NEW",
    paidOnlyDetails: true,
  },
  {
    id: "take-tips",
    title: "Take Tips for Camera Recordings",
    description:
      "After you record yourself, get one thing you did well and up to three quick tips, each with the moment in your video, like looking at the lens or slowing down.",
    releaseDate: "2026-11-15",
    howItWorksAnchor: "take-tips",
    badge: "NEW",
    freeHref: "/create?tab=camera",
    freeLabel: "Record yourself",
  },
  {
    id: "enhance-photo",
    title: "Enhance Your Avatar Photo",
    description:
      "Brighten and sharpen your headshot or a new look before it becomes your avatar. Your face is never changed, and you pick the original or the enhanced one.",
    releaseDate: "2026-11-15",
    howItWorksAnchor: "enhance-photo",
    badge: "NEW",
    freeHref: "/settings#brand",
    freeLabel: "Open Settings",
  },
  {
    id: "listing-photo-sort",
    title: "Listing Photos, Sorted",
    description:
      "Import a listing and the photos come back in tour order with the best front of the home first. Agent headshots, logos and repeat shots are taken out, and Undo puts them back.",
    releaseDate: "2026-11-15",
    howItWorksAnchor: "photo-sort",
    badge: "IMPROVED",
    freeHref: "/create",
    freeLabel: "Make a listing video",
  },
  {
    id: "thumbnails-match-script",
    title: "Thumbnails That Match Your Video",
    description:
      "The thumbnail background now pictures what your script talks about, and each one looks different from your last few.",
    releaseDate: "2026-11-15",
    howItWorksAnchor: "thumbnail-generator",
    badge: "IMPROVED",
    freeHref: "/tools?tab=thumbnail",
    freeLabel: "Open the Thumbnail Generator",
  },
  {
    id: "ai-visibility",
    title: "AI Visibility",
    description:
      "See whether ChatGPT, Perplexity and Gemini name you or cite your links when people ask about your town. Every week, from your town's top searches, with the sites AI used instead and a Make a video button for each gap.",
    releaseDate: "2026-11-14",
    featureKey: "spark_insights",
    howItWorksAnchor: "ai-visibility",
    badge: "NEW",
    paidOnlyDetails: true,
  },
  {
    id: "plans-4-7-10",
    title: "Simpler Plans: 4, 7 or 10 Videos",
    description:
      "Creator, Producer and Influencer now include 4, 7 or 10 AI videos a month, each up to 2 minutes. Recording yourself on camera never uses your videos.",
    releaseDate: "2026-11-13",
    howItWorksAnchor: "step-11",
    badge: "IMPROVED",
    freeHref: "/settings/billing",
    freeLabel: "See plans",
    // Replaced by "two-plans" (2026-11-22).
    published: false,
  },
  {
    id: "halo-leads",
    title: "Halo Leads",
    description:
      "Reply to every new lead from your Halo website with a video. SparkReels writes the email and script, a welcome for buyers and sellers or a spotlight for businesses. Your avatar says it, or you record it yourself, and you approve it to send.",
    releaseDate: "2026-11-09",
    featureKey: "autosparks",
    howItWorksAnchor: "halo-leads",
    badge: "NEW",
    paidOnlyDetails: true,
  },
  {
    id: "quick-reels-templates",
    title: "Quick Reels Templates",
    description:
      "Five ready-made designs: Just Listed, Luxury, Market Update, Neighborhood and Meet Your Agent. Your words animate in while you talk in the corner, and you can open with a short shot of you welcoming viewers.",
    releaseDate: "2026-11-03",
    howItWorksAnchor: "quick-reels-templates",
    badge: "NEW",
    freeHref: "/templates",
    freeLabel: "Open Quick Reels Templates",
  },
  {
    id: "send-to-website",
    title: "Send to Website",
    description:
      "Get your article and video onto your website in a few taps: text it to your Halo site, or copy it ready to paste into any other site.",
    releaseDate: "2026-10-31",
    howItWorksAnchor: "send-to-website",
    badge: "NEW",
    freeHref: "/videos",
    freeLabel: "Open My Sparks",
  },
  {
    id: "twin-photos-footage",
    title: "Your Twin in Front of Your Footage",
    description:
      "In a horizontal Full AI Avatar video, your Digital Twin stands in front of your photos and clips as they play, at the side or in the corner.",
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
