/**
 * Wording for the public feature pages and the FAQ page (2026-10-22, the
 * owner's ask: more pages for Google to find). One file, so every word the
 * public site says about a feature is in one place to review and change.
 *
 * Rules for this copy: no vendor names, plain sentences, and nothing the app
 * does not actually do today.
 */

export interface Faq { q: string; a: string }

export interface FeaturePage {
  slug: string;
  /** Short name for the Features menu, footer and "More from SparkReels". */
  navLabel: string;
  /** One line under the name in the Features menu. */
  blurb: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  h1Accent: string;
  lead: string;
  image: string;
  imageAlt: string;
  /** "Paid plans" tag beside the eyebrow. */
  paid?: boolean;
  steps: { title: string; text: string }[];
  getsTitle: string;
  gets: string[];
  forTitle: string;
  forList: string[];
  faqs: Faq[];
}

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "ai-video-for-real-estate-agents",
    navLabel: "AI video for agents",
    blurb: "Your avatar and voice, no filming",
    metaTitle: "AI Video for Real Estate Agents, No Filming Needed",
    metaDescription:
      "Talk for a minute and get a finished real estate video with your AI avatar, your cloned voice, captions and branding. Market updates, listings and buyer tips, ready to post.",
    eyebrow: "AI video for real estate agents",
    h1: "Post a video every week.",
    h1Accent: "Without filming a thing.",
    lead:
      "Talk for a minute about your market, a listing or a buyer tip. SparkReels writes the script for your town and makes a finished video with your AI avatar, your own cloned voice, captions and your branding, ready to post.",
    image: photo("photo-1576299090369-9067e4adca28"),
    imageAlt: "A real estate agent recording a short video update",
    steps: [
      { title: "Hit the mic", text: "Say what the video is about: a market update, a neighborhood, a listing or a buyer question. Or tap one of 25 topics with your city already filled in." },
      { title: "Spark it", text: "SparkReels writes the script with Fair Housing guardrails, then makes the video with your avatar speaking in your voice, with b-roll and captions." },
      { title: "Share it", text: "Publish to YouTube in one click, with the title, description and tags filled in. Paid plans post to Instagram, Facebook, LinkedIn, TikTok and more." },
    ],
    getsTitle: "What you get with every video",
    gets: [
      "Your AI avatar, or your Digital Twin, speaking in your cloned voice",
      "Automatic b-roll, captions, music and your logo and colors",
      "Vertical for Reels and Shorts, or horizontal for YouTube",
      "Short videos up to 3 minutes, and long videos up to 8 minutes on Producer and Influencer",
      "A blog post of 1,000 to 1,500 words for your own site",
      "Titles, descriptions and hashtags for every platform",
    ],
    forTitle: "Made for agents who…",
    forList: [
      "Know they should post video but never find the time",
      "Don't love being on camera",
      "Want to show up when buyers ask ChatGPT and Google",
      "Run a team and want everyone posting on brand",
    ],
    faqs: [
      { q: "Do I need to be on camera?", a: "No. Your AI avatar delivers the video in your cloned voice. On the days you want to film yourself, the built-in teleprompter is there too." },
      { q: "How long does a video take?", a: "About a minute of your time to say what it's about. The video is then made for you, and most short videos are ready within the hour." },
      { q: "Does it sound like me?", a: "Yes. You record a short sample of your voice once in Settings, and every video after that uses your cloned voice." },
      { q: "What kinds of videos can I make?", a: "Market updates, neighborhood tours, listing videos, just sold, open house recaps, buyer and seller tips, interest rate updates, and anything else you can talk about for a minute." },
      { q: "What does it cost?", a: "Start free. Paid plans are $99, $149 and $199 a month, with no contract. See the pricing page for what each includes." },
    ],
  },
  {
    slug: "digital-twin",
    navLabel: "Digital Twin",
    blurb: "A video avatar made from you",
    metaTitle: "AI Digital Twin for Realtors: A Video Avatar of You",
    metaDescription:
      "Record a short clip of yourself once and SparkReels makes a Digital Twin: a video avatar that looks, moves and sounds like you, for every real estate video after that.",
    eyebrow: "Digital Twin for real estate agents",
    h1: "Film yourself once.",
    h1Accent: "Your twin does the rest.",
    lead:
      "Record a short clip of yourself talking, on your phone or computer. SparkReels turns it into a Digital Twin: a video avatar that looks and moves like you and speaks in your cloned voice, in every video after that.",
    image: photo("photo-1484863137850-59afcfe05386"),
    imageAlt: "An agent recording a short clip for a Digital Twin",
    steps: [
      { title: "Record a clip", text: "In Settings, follow the steps and record yourself talking for a short while. An iPhone video works; SparkReels converts it for you." },
      { title: "Train your twin", text: "Press Train. Your twin is checked and set up, and you'll see it in your avatar choices once it's approved." },
      { title: "Use it everywhere", text: "Pick your twin for any video. It speaks your script in your voice, so you show up every week without filming again." },
    ],
    getsTitle: "Why agents use a twin",
    gets: [
      "Looks like you, not a stock presenter",
      "Speaks in your own cloned voice",
      "Works for market updates, listings and tips",
      "On every plan: free plans use it in the Avatar in circle video, paid plans in the full Avatar video too",
      "Your photo avatar stays available as well",
    ],
    forTitle: "A twin is for you if…",
    forList: [
      "You want your real face on your videos, without filming each one",
      "You film well once but don't have time every week",
      "Your clients know you and should recognize you",
    ],
    faqs: [
      { q: "What's the difference between a photo avatar and a Digital Twin?", a: "A photo avatar is made from one headshot. A Digital Twin is made from a short video of you, so it moves and gestures more like you do." },
      { q: "How do I record the clip?", a: "Settings walks you through it: good light, a plain background, look at the camera and talk naturally. A phone video is fine." },
      { q: "Is a Digital Twin included on my plan?", a: "Yes, on every plan. On the free plan you can use it in the Avatar in circle video. The full Avatar video with your twin needs a paid plan." },
      { q: "Can someone else make a twin of me?", a: "No. Every twin goes through a consent check, so it can only be made from you, with your OK." },
    ],
  },
  {
    slug: "real-estate-teleprompter",
    navLabel: "Teleprompter app",
    blurb: "Record yourself, reading smoothly",
    metaTitle: "Teleprompter App for Real Estate Agents, Free and Unlimited",
    metaDescription:
      "Film yourself with a script that scrolls as you talk. AI writes the script for your market, your photos or footage play behind you, and every camera recording is free and unlimited.",
    eyebrow: "Teleprompter for real estate agents",
    h1: "Look at the camera.",
    h1Accent: "Your script scrolls with you.",
    lead:
      "On the days you want to be on camera, SparkReels writes your script and scrolls it as you talk, right in your browser. Your photos, your own footage or local scenes can play behind you, and camera recordings are free and unlimited on every paid plan.",
    image: photo("photo-1781606989379-5c62ed674c41"),
    imageAlt: "A real estate agent filming with a teleprompter",
    steps: [
      { title: "Get your script", text: "AI writes it for your market, or bring a document, a voice memo or your own words. Pick up to 3, 8 or 15 minutes." },
      { title: "Set up your take", text: "Choose what plays behind you: just you, your photos, your own footage or AI scenes. Vertical or horizontal, with your branding." },
      { title: "Record and share", text: "The words scroll at your pace, and you can speed up or slow down while you record. It's saved to My Sparks, ready to post." },
    ],
    getsTitle: "What's built in",
    gets: [
      "A teleprompter that keeps pace with your voice",
      "Full-screen reading mode and speed controls",
      "Your photos, your own footage or AI scenes behind you",
      "Record your screen with you in a corner, up to 10 minutes",
      "Captions, branding and a blog post for each recording",
      "Unlimited camera recordings, up to 15 minutes each",
    ],
    forTitle: "Great for…",
    forList: [
      "Market updates in your own voice and face",
      "Listing walkthroughs from your photos",
      "Showing a market report on screen while you explain it",
      "Agents who like being on camera but hate memorizing",
    ],
    faqs: [
      { q: "Do I need a special camera or app?", a: "No. It runs in your browser on a computer or phone, using the camera you already have." },
      { q: "Is the teleprompter really free?", a: "Camera and screen recordings don't use any of your monthly AI videos. They're unlimited on every paid plan, and the free plan includes one to try." },
      { q: "Can I post a video I already shot?", a: "Yes. On a computer, choose Post a video as is to add your branding and post a clip you already have." },
      { q: "How long can a recording be?", a: "Up to 15 minutes on camera and up to 10 minutes when recording your screen." },
    ],
  },
  {
    slug: "real-estate-blog-writer",
    navLabel: "AI blog writer",
    blurb: "Unlimited posts for your town",
    metaTitle: "AI Blog Writer for Real Estate Agents, Unlimited Posts",
    metaDescription:
      "Unlimited 1,000 to 1,500 word blog posts researched for your town, with FAQ answer blocks written to get quoted by Google and ChatGPT. Copy as HTML or send as an email.",
    eyebrow: "AI blog writer for real estate agents",
    h1: "A researched blog post",
    h1Accent: "for your town, in minutes.",
    lead:
      "Say a topic and SparkReels writes a 1,000 to 1,500 word article researched for your market, with headings written as the questions people actually ask. Paid plans write as many as you want, and every video comes with its own article too.",
    image: photo("photo-1608222351212-18fe0ec7b13b"),
    imageAlt: "A laptop with a real estate blog post open",
    paid: true,
    steps: [
      { title: "Pick a topic", text: "Speak or type it, or forward an email or article you want to write about." },
      { title: "Get the article", text: "Researched for your town, 1,000 to 1,500 words, with six FAQ answer blocks and a header image in one click." },
      { title: "Publish it", text: "Copy it as HTML into your website with the search tags included, send it as an email, or listen to it read aloud in your voice." },
    ],
    getsTitle: "What every article includes",
    gets: [
      "1,000 to 1,500 words, researched for your market",
      "Headings written as real questions, answered in the first line",
      "Six FAQ answer blocks, the format AI assistants quote",
      "Search tags included when you copy it as HTML",
      "A header image, a moving header or a social teaser",
      "An email version and a newsletter from several posts",
    ],
    forTitle: "Why it matters",
    forList: [
      "Buyers ask Google and ChatGPT before they ask an agent",
      "An article on your own site keeps working for months",
      "Assistants quote pages, not videos",
      "Fresh local posts tell Google you're the local expert",
    ],
    faqs: [
      { q: "Is blog writing really unlimited?", a: "Yes, on every paid plan. The free plan includes one blog post to try." },
      { q: "Will it sound like a robot wrote it?", a: "It's written for your town in a plain, friendly voice, and you can edit every word before you use it." },
      { q: "How do I put it on my website?", a: "Press Copy as HTML and paste it into your site's editor. The headings and FAQ search tags come with it." },
      { q: "Can I turn an article into a video?", a: "Yes. Paste or forward an article and SparkReels writes a video script from it, or make a video and get its article automatically." },
    ],
  },
  {
    slug: "real-estate-content-autopilot",
    navLabel: "AutoSparks",
    blurb: "Your week of posts, written Sunday",
    metaTitle: "AutoSparks: Weekly Real Estate Content, Written for You",
    metaDescription:
      "Every Sunday SparkReels writes 3 posts for your week: videos and blog posts about your market, ready Monday morning to approve, change or record yourself. Nothing posts without your OK.",
    eyebrow: "AutoSparks",
    h1: "Your week of content,",
    h1Accent: "written while you sleep.",
    lead:
      "Every Sunday, SparkReels writes 3 posts for your week about your market, the season and what buyers are asking AI. Monday morning they're waiting for you. Approve, change, or record one yourself. Nothing posts without your OK.",
    image: photo("photo-1551288049-bebda4e38f71"),
    imageAlt: "A weekly content plan on a laptop",
    paid: true,
    steps: [
      { title: "Choose your mix", text: "How many videos and how many blog posts each week, and which days and time you want to post." },
      { title: "Sunday, it writes", text: "Three drafts with scripts and articles, researched for your market. Ask for more ideas anytime." },
      { title: "Monday, you approve", text: "An email says your AutoSparks are ready. Approve, change, listen, or record one yourself." },
    ],
    getsTitle: "What you get each week",
    gets: [
      "3 drafts written for your market",
      "The mix of videos and blog posts you choose",
      "Your post days and time",
      "Listen to any draft read in your voice",
      "Record it myself, straight to the teleprompter",
      "A Monday email when they're ready",
    ],
    forTitle: "Perfect if…",
    forList: [
      "You never know what to post",
      "You start strong and then go quiet",
      "You want a plan without hiring a marketer",
    ],
    faqs: [
      { q: "Does AutoSparks post anything on its own?", a: "No. It writes drafts. Nothing is made or posted until you approve it." },
      { q: "Can I change the mix each week?", a: "Yes. Change how many videos and blog posts you get, and your post days, anytime." },
      { q: "Which plans include AutoSparks?", a: "All paid plans: Creator, Producer and Influencer." },
      { q: "Do the drafts use up my videos?", a: "Drafts don't. A video counts toward your plan only when you approve it and make it. Blog posts and camera recordings are unlimited." },
    ],
  },
  {
    slug: "listing-video-generator",
    navLabel: "Listing videos",
    blurb: "A listing link or photos into a reel",
    metaTitle: "Listing Video Generator for Real Estate Agents",
    metaDescription:
      "Paste a listing link or drop in your photos and get a branded property video: a tour with your AI avatar, or a photo reel with motion, captions and music or your voice.",
    eyebrow: "Listing video generator",
    h1: "Every listing,",
    h1Accent: "its own video.",
    lead:
      "Paste a listing link or speak the address, and SparkReels imports the details and builds a branded property tour with your AI avatar. Or drop in your listing photos for a reel with motion, captions and music, or your voice over the top.",
    image: photo("photo-1570129477492-45c003edd2be"),
    imageAlt: "A house listing turned into a video",
    steps: [
      { title: "Bring the listing", text: "Paste a listing link, speak the address, or upload up to 20 photos." },
      { title: "Pick the video", text: "A tour with your avatar, a photo reel set to music or your cloned voice, or a Scenes reel with your voice over." },
      { title: "Post it", text: "Just listed, open house, price reduced or just sold, branded and ready for every platform." },
    ],
    getsTitle: "What you can make",
    gets: [
      "Property tours with your AI avatar",
      "Photo reels with motion, captions and a closing card",
      "Music, your cloned voice, or your own voice over",
      "Just listed, open house, price reduced and just sold",
      "Graphics for the post with the price and address set in real type",
      "Seller update emails with a video for your sellers",
    ],
    forTitle: "Why listing videos",
    forList: [
      "Sellers expect video marketing",
      "Video posts get seen more than photo posts",
      "Every listing becomes content for your channel",
    ],
    faqs: [
      { q: "Do photo reels use my monthly videos?", a: "No. Photo reels are free and don't use anything from your monthly plan." },
      { q: "How many photos can I use?", a: "Up to 20 photos for a reel, and up to 12 in an Avatar video." },
      { q: "Can I send the video to my seller?", a: "Yes. Seller Updates writes the email with a video, and you send it through BoldTrail or your own email." },
    ],
  },
];

/** The pricing page's own questions. */
export const PRICING_FAQS: Faq[] = [
  { q: "Is there a contract?", a: "No. Plans are billed monthly and you can cancel anytime." },
  { q: "What's the difference between short and long videos?", a: "Short videos run up to 3 minutes, for reels and quick updates. Long videos run up to 8 minutes, for YouTube market updates and tours, and use your photos for visuals. They're counted separately." },
  { q: "What if I need more videos one month?", a: "Add them anytime: $25 for a short video or $29 for a long one. Add-on videos never expire, so they're non-refundable." },
  { q: "What's unlimited?", a: "Blog posts, camera recordings and screen recordings are unlimited on every paid plan, and photo reels don't use any of your monthly videos." },
  { q: "Can I try it free?", a: "Yes. Sign up free and make your first AI video, no credit card needed." },
];

export interface FaqGroup { title: string; items: Faq[] }

/** The full FAQ page. */
export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Getting started",
    items: [
      { q: "What is SparkReels?", a: "SparkReels is a video and content app for real estate agents. Talk for a minute and get a finished video with your AI avatar and cloned voice, plus a blog post, captions and posts for every platform." },
      { q: "Do I need to be on camera?", a: "No. Your AI avatar can deliver every video in your cloned voice. If you like being on camera, the built-in teleprompter lets you film yourself too." },
      { q: "How long does it take to make a video?", a: "About a minute of your time to say what it's about. Most short AI videos are ready within the hour." },
      { q: "What can I do for free?", a: "Make your first AI video free, with no credit card. Before that you can also write one blog post and make one camera recording. After your free video, you get 14 days of unlimited blogs, camera recordings and tools." },
      { q: "Is there help inside the app?", a: "Yes. Ask Sparklee, the voice helper at the top of every page, how to do anything on the page you're on, or read How It Works." },
    ],
  },
  {
    title: "Your avatar and voice",
    items: [
      { q: "How do I make my avatar?", a: "Upload a headshot in Settings and SparkReels makes your photo avatar. You can add more looks, or make a Digital Twin from a short video of you." },
      { q: "What is a Digital Twin?", a: "A video avatar made from a short clip of you talking, so it moves and looks like you. It's on every plan." },
      { q: "How is my voice cloned?", a: "Record a short sample of you talking in Settings. Your videos, and Listen read-alouds, then use your cloned voice." },
      { q: "Can anyone else use my avatar or voice?", a: "No. Your avatar, twin and voice belong to your account only." },
    ],
  },
  {
    title: "Plans and pricing",
    items: [
      { q: "How much does SparkReels cost?", a: "Creator is $99 a month, Producer $149 and Influencer $199. Each includes a set number of AI videos, plus unlimited blog posts, camera recordings and AutoSparks." },
      { q: "Can I cancel anytime?", a: "Yes. There's no contract; plans are billed monthly." },
      { q: "What are add-on videos?", a: "Extra videos you buy when you need them: $25 for a short video, $29 for a long one. They never expire." },
      { q: "Do you have an affiliate program?", a: "Yes. Apply on the Affiliates page and earn a commission when agents you refer subscribe." },
    ],
  },
  {
    title: "What you can make",
    items: [
      { q: "What can I make with SparkReels?", a: "AI avatar videos, camera and screen recordings, listing videos and photo reels, blog posts, newsletters, seller update emails, graphics, thumbnails and YouTube banners." },
      { q: "Is the content Fair Housing compliant?", a: "Every script is written with Fair Housing guardrails, and you review and approve everything before it's made or posted." },
      { q: "Can I edit the script?", a: "Yes. Every script and article can be edited before you make the video or publish the post." },
      { q: "What is AutoSparks?", a: "On paid plans, SparkReels writes 3 posts for your week every Sunday. You approve, change or record them on Monday. Nothing posts without your OK." },
    ],
  },
  {
    title: "Posting and tools",
    items: [
      { q: "Where can I post my videos?", a: "YouTube on every plan, with the title, description and tags filled in. Paid plans also post to Instagram, Facebook, LinkedIn, TikTok and more." },
      { q: "Can I schedule posts?", a: "Yes. Publish now or pick a date and time, and see everything on Spark Calendar." },
      { q: "Does it work with my CRM?", a: "SparkReels connects with BoldTrail to send videos, seller updates and newsletters to your contacts, and with GoHighLevel so new videos land in your CRM." },
    ],
  },
  {
    title: "Privacy",
    items: [
      { q: "Who owns my videos?", a: "You do. You keep ownership of your recordings and the content you make." },
      { q: "Do you use my voice or videos to train AI?", a: "No. Your content is used only to make what you ask for, and never to train AI models without your consent." },
      { q: "How do I delete my account?", a: "Email support@sparkreels.ai from your account's email address and we'll delete your account and videos." },
    ],
  },
];

/** The landing page's short FAQ: questions picked from the full page. */
export const LANDING_FAQS: Faq[] = [
  FAQ_GROUPS[0].items[0],
  FAQ_GROUPS[0].items[1],
  FAQ_GROUPS[0].items[2],
  FAQ_GROUPS[0].items[3],
  FAQ_GROUPS[2].items[0],
  FAQ_GROUPS[3].items[1],
  FAQ_GROUPS[4].items[0],
  FAQ_GROUPS[2].items[1],
];
