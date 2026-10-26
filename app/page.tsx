import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DemoVideo } from "@/components/landing/demo-video";
import {
  CheckCircle, ArrowRight,
  Clock,
  X, Camera, Users, UserPlus, ChevronRight,
  Tv2, Palette, Film, MousePointerClick, Search, Upload, Zap,
  Bot, EyeOff, TrendingDown, PenLine, MessageSquare,
} from "lucide-react";
import type { Metadata } from "next";
import { canonicalUrl } from "@/lib/seo/public-pages";
import { PricingSection } from "@/components/marketing/pricing-section";
import { AiQuestionsBox } from "@/components/marketing/ai-questions-box";
import { Hero } from "@/components/marketing/hero";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FaqList } from "@/components/marketing/faq-list";
import { LANDING_FAQS, FEATURE_PAGES } from "@/lib/marketing/content";

// Title and description come from the root layout.
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/") },
};

// The objections agents actually voice — in their words, then what changes.
const painPoints = [
  {
    icon: Clock,
    pain: "“I know I should be posting video. I've known for two years.”",
    fix: "One recording session replaces a full Saturday of filming and editing. Speak for 60 seconds, get a finished video.",
  },
  {
    icon: Camera,
    pain: "“I hate how I look and sound on camera.”",
    fix: "You never have to appear. Your AI avatar delivers the video in your cloned voice — or use the teleprompter on the days you do want to film.",
  },
  {
    icon: PenLine,
    pain: "“I sit down to record and have no idea what to say.”",
    fix: "Two answers: twenty-five ready-to-record topics sit on the Create screen with your city filled in, and AI Answer Blocks shows you the exact questions buyers in your market are typing into ChatGPT. Tap one, hit record — the script writes itself.",
  },
  {
    icon: TrendingDown,
    pain: "“I posted for a month, got nothing, and quit.”",
    fix: "Random posts don't compound — searchable ones do. Every video ships with SEO metadata built to rank for your neighborhood, so it keeps working months later.",
  },
  {
    icon: EyeOff,
    pain: "“The agent down the street is everywhere and I'm invisible.”",
    fix: "They're not better on camera. They're just consistent. This makes consistency take minutes a week instead of a weekend.",
  },
  {
    icon: Bot,
    pain: "“Buyers ask ChatGPT now — and it's never heard of me.”",
    fix: "AI Answer Blocks finds the questions your buyers ask AI and turns each one into a video you can record in a click. Every script then comes with a full blog post for your own site, written so an assistant can quote it — which is how you become the answer instead of a name nobody has heard.",
  },
];

const segments = [
  {
    icon: Clock,
    segment: "Solo Agents",
    driver: "Time Scarcity",
    desire: "Stay top-of-mind without losing 15 hours a week to content production.",
    photo: "https://images.unsplash.com/photo-1656399910089-b7ead999bf23?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: Camera,
    segment: "Camera-Shy Agents",
    driver: "Performance Anxiety",
    desire: "Build a powerful personal brand without ever appearing on screen.",
    photo: "https://images.unsplash.com/photo-1625123628039-6053583b86cc?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: Users,
    segment: "Team Leaders",
    driver: "Scalability",
    desire: "Ensure team-wide content consistency and brand compliance — at scale.",
    photo: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: UserPlus,
    segment: "New Agents",
    driver: "Brand Building",
    desire: "Establish local authority quickly and compete with seasoned agents from day one.",
    photo: "https://images.unsplash.com/photo-1758518732130-4b51da74b0b6?auto=format&fit=crop&w=600&q=80",
  },
];

const features: { title: string; description: string; photo: string; paid?: boolean }[] = [
  // The two paid-plan features, first (2026-10-21, the owner's wording).
  {
    title: "AutoSparks: Your Week, Written For You",
    description: "Every Sunday, SparkReels writes 3 posts for your week, about your market, the season, and what buyers are asking AI: videos and blog posts in the mix you choose, set for the days you pick. Monday morning they're ready. Approve, change, or record one yourself. Nothing posts without your OK.",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
    paid: true,
  },
  {
    title: "Unlimited Blog Writing",
    description: "Write as many blog posts as you want, 1,000 to 1,500 words each, researched for your town, with 6 AI answer blocks that help you get quoted by ChatGPT and Google. Every video comes with its own article too. Copy it to your website or send it as an email.",
    photo: "https://images.unsplash.com/photo-1611926653458-09294b3142bf?auto=format&fit=crop&w=600&q=80",
    paid: true,
  },
  {
    title: "Never Stare At A Blank Screen",
    description: "Twenty-five ready-to-record topics sit on the Create screen with your city already filled in — tips, formats, and local events. Open the camera and AI Topic Radar goes further, scanning your market for what is trending there this week. Tap one. Hit the mic. Done.",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "One Video → Your Share Kit",
    description: "Every video you create automatically generates a LinkedIn post, Instagram caption, YouTube description, email newsletter blurb — and a full blog post for your own site. All copy-ready. One recording session fuels your entire week of content.",
    photo: "https://images.unsplash.com/photo-1611926653458-09294b3142bf?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Built-In Teleprompter",
    description: "Want to appear on camera? Write or speak your script, then hit record — the teleprompter scrolls automatically while you film. No external app, no sticky notes, no memorizing lines.",
    photo: "https://images.unsplash.com/photo-1781606989379-5c62ed674c41?auto=format&fit=crop&w=600&q=80",
  },
  // Added 2026-10-16 at the owner's ask; the feature was live but unlisted.
  {
    title: "Record Your Screen",
    description: "On a computer, record a listing, a market report or anything on your screen while you talk, with you in a corner circle or not. Up to 10 minutes, ready to post like any recording, and free.",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "One-Button Video Creation",
    description: "Speak for 90 seconds about any market topic, listing, or local update. AI writes the script, builds visuals, adds captions, and renders broadcast-quality video — no filming or editing required.",
    photo: "https://images.unsplash.com/photo-1576299090369-9067e4adca28?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "No Camera Required",
    description: "Your AI avatar appears on screen in your place, speaking in your cloned voice. Build a compelling personal brand without ever recording your face.",
    photo: "https://images.unsplash.com/photo-1484863137850-59afcfe05386?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Hyperlocal Market Intelligence",
    description: "Generate hyper-local market update videos that rank on YouTube — positioning you as the digital expert in your town.",
    photo: "https://images.unsplash.com/photo-1758304480344-f8d0de5f4f25?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "\"Digital Go-To Agent\" Status",
    description: "Consistently publishing hyper-local expert content makes you the agent people think of first when buyers and sellers search for a local expert.",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "A Blog Post With Every Script",
    // Was buried at the end of a list about YouTube metadata, as "and a full
    // blog post" — the one deliverable here that lives on the agent's own
    // site, described as a footnote about someone else's platform.
    description: "Usually 1,000 to 1,500 words, with the headings written as the questions people actually ask and answered in the first line — the shape an AI assistant quotes. That's AEO and GEO, alongside ordinary SEO. Make a header image for it in one click, then copy it as HTML into your site. Turn its header into a moving header or a short social teaser in about a minute. Included on every paid plan, and you can write one without making a video at all — or paste an article you've already written and get a script back from it.",
    photo: "https://images.unsplash.com/photo-1608222351212-18fe0ec7b13b?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Publish Everywhere",
    description: "One click publishes your video to YouTube with SEO-optimized title, description, and tags already filled in — ready to rank. Paid plans post it to Instagram, Facebook, LinkedIn, TikTok and more from the same window.",
    photo: "https://images.unsplash.com/photo-1502209877429-d7c6df9eb3f9?auto=format&fit=crop&w=600&q=80",
  },
  // The owner's line (2026-10-25): for agents who already film on camera.
  {
    title: "Already Have Videos? Upload Them Once",
    description: "Already have a YouTube channel? Upload your existing videos once, and SparkReels optimizes each one, turns it into a blog for your website, adapts it for LinkedIn and Facebook, and auto-posts it to all your social platforms.",
    photo: "https://images.unsplash.com/photo-1502209877429-d7c6df9eb3f9?auto=format&fit=crop&w=600&q=80",
    paid: true,
  },
  // Added 2026-10-15 with the features they describe.
  {
    title: "Seller Updates With Video",
    description: "Save each listing, fill in the views, showings and buyer feedback, and SparkReels writes the update email. Record a quick video update with a script written for you. Send it whenever you like, through BoldTrail or your own email.",
    photo: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Email Any Video",
    description: "Send a finished video to up to 10 clients with a personal note and their first name. They see a picture with a play button and tap to watch. Through BoldTrail or your own email.",
    photo: "https://images.unsplash.com/photo-1611926653458-09294b3142bf?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "A Newsletter From Your Blog Posts",
    description: "Tick a few posts and get a ready-to-send newsletter: subject lines, your note, and a teaser with a Read more button for each.",
    photo: "https://images.unsplash.com/photo-1608222351212-18fe0ec7b13b?auto=format&fit=crop&w=600&q=80",
  },
  // The owner's wording (2026-10-19).
  {
    title: "Works With BoldTrail And GoHighLevel",
    description: "Connect BoldTrail and send seller updates, videos, blog posts and newsletters straight to your contacts, logged on each one. On GoHighLevel, every video you publish lands in your CRM automatically, so your workflow can text it, email it or post it for you. Ask us for the ready-made workflow.",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Listing Video Generator",
    description: "Paste a Zillow URL or speak the address. We import the details and auto-generate a branded property tour video with your AI avatar — ready to post.",
    photo: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "12 Spark Tools, Included",
    description: "Channel name, LinkedIn profile, banner, thumbnails, post graphics from the Image Generator, titles, descriptions, tags, scripts, AI Answer Blocks, Google Reviews replies and Seller Update — all in-app, included on every paid plan. Everything you need to launch a channel and get found, without hiring a designer.",
    photo: "https://images.unsplash.com/photo-1497048679117-1a29644559e3?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Graphics Without A Designer",
    description: "Describe the picture and type the words: a just-listed post, an open house, a market stat, a header for your article. The picture is generated; the price, the address and your logo are set in real type on top, so nothing is ever misspelled. Or skip the AI and use your own listing photos, which costs nothing.",
    photo: "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Photos Into A Reel, Free",
    description: "Drop in up to twelve listing photos and get a finished reel with Ken Burns motion, captions and a closing card — set to music, your cloned voice reading a script you write, or your own voice over the top. It uses nothing from your monthly plan.",
    photo: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Voice Over Only, The Scenes Reel",
    description: "No camera, no photos. Say a topic and get up to 3 minutes of realistic local scenes with your voice over them.",
    photo: "https://images.unsplash.com/photo-1555192881-efc55b7550f5?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "See What's Actually Working",
    description: "Spark Insights counts what you've made and, for anything published to your connected YouTube channel, pulls back real views, likes and comments — every video ranked, refreshed daily. The same numbers sit on each Spark, so you can see which topic earned the attention rather than guessing.",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "One Calendar For Everything",
    description: "Every video and article on a month, week or list view — published, scheduled, or still a draft. Open any Spark to find its script, its article, its captions, its schedule and how it's performing in one place, instead of hunting through folders for what you made in August.",
    photo: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Ask Sparklee",
    description: "Stuck? Just ask out loud. Sparklee, your AI visibility voice companion, tells you how to do anything on the page you're on.",
    photo: "/sparklee.webp",
  },
  {
    title: "49% Faster Revenue Growth",
    description: "Agents who post consistent video content grow revenue 49% faster. SparkReels.ai gives you the output of a full content team without the cost or headache.",
    photo: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
  },
];

// Video-type strip. `len` is the real finished length for that kind of video —
// the mix of 60 sec / 3 min / 8 min is how a visitor learns short and long form
// both exist before they reach pricing.
const marqueeRow1 = [
  { label: "Market Update",        len: "3 min",  img: "https://images.unsplash.com/photo-1542744095-291d1f67b221?auto=format&fit=crop&w=400&q=80" },
  { label: "Listing Video",        len: "90 sec", img: "https://images.unsplash.com/photo-1762811054947-605b20298615?auto=format&fit=crop&w=400&q=80" },
  { label: "Neighborhood Tour",    len: "8 min",  img: "https://images.unsplash.com/photo-1555192881-efc55b7550f5?auto=format&fit=crop&w=400&q=80" },
  { label: "Just Sold",            len: "60 sec", img: "https://images.unsplash.com/photo-1741156386380-0236c72eb6f9?auto=format&fit=crop&w=400&q=80" },
  { label: "Buyer Tips",           len: "3 min",  img: "https://images.unsplash.com/photo-1733244766159-f58f4184fd38?auto=format&fit=crop&w=400&q=80" },
  { label: "Interest Rate Update", len: "60 sec", img: "https://images.unsplash.com/photo-1648201637025-1c77b9be3013?auto=format&fit=crop&w=400&q=80" },
  { label: "Open House Recap",     len: "90 sec", img: "https://images.unsplash.com/photo-1781797221329-c3d083ab6d99?auto=format&fit=crop&w=400&q=80" },
  { label: "Local Market Deep Dive", len: "8 min", img: "https://images.unsplash.com/photo-1780584447740-687fb6ff14eb?auto=format&fit=crop&w=400&q=80" },
];

const marqueeRow2 = [
  { label: "Seller Tips",          len: "3 min",  img: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=400&q=80" },
  { label: "Price Reduction",      len: "60 sec", img: "https://images.unsplash.com/photo-1709880945165-d2208c6ad2ec?auto=format&fit=crop&w=400&q=80" },
  { label: "New Construction Tour", len: "8 min", img: "https://images.unsplash.com/photo-1587582423116-ec07293f0395?auto=format&fit=crop&w=400&q=80" },
  { label: "Investment Property",  len: "3 min",  img: "https://images.unsplash.com/photo-1543071293-d91175a68672?auto=format&fit=crop&w=400&q=80" },
  { label: "Luxury Listing",       len: "90 sec", img: "https://images.unsplash.com/photo-1682184805271-11671b7ecf4c?auto=format&fit=crop&w=400&q=80" },
  { label: "School District Tour", len: "8 min",  img: "https://images.unsplash.com/photo-1767589565213-1daee51888b2?auto=format&fit=crop&w=400&q=80" },
  { label: "Coming Soon",          len: "60 sec", img: "https://images.unsplash.com/photo-1777106322601-578dc9213ace?auto=format&fit=crop&w=400&q=80" },
  { label: "Condo Showcase",       len: "3 min",  img: "https://images.unsplash.com/photo-1515263487990-61b07816b324?auto=format&fit=crop&w=400&q=80" },
];

// ── SAMPLE OUTPUT VIDEOS — DROP YOUR FILES HERE ──────────────────────────────
// To publish a sample: put the .mp4 in /public (e.g. /public/samples/reel.mp4)
// and set `src` to its path, like src: "/samples/reel.mp4". Optionally add a
// `poster` image the same way so the card shows a still before it plays.
//
// While `src` is empty the card is HIDDEN from real visitors — the section only
// appears once at least one sample is filled in. Running `npm run dev` shows a
// labeled placeholder in its place so you can see where each one lands.
//
// Use a video rendered AFTER 2026-08-30, and check it on an actual iPhone.
// Renders stored before that date have their MP4 index (the `moov` atom) at
// the END of the file, and iOS will not begin playback on those — it shows a
// frame and the play button does nothing, which looks exactly like a broken
// product to a visitor deciding whether to sign up. lib/utils/faststart.ts now
// fixes this on the way into storage, but only for videos stored since; the
// older ones in the bucket were never backfilled. If you must use an older
// render, remux it first:
//   ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4
const SAMPLE_VIDEOS = [
  {
    label: "Short reel",
    meta: "60 sec · 9:16 · AI avatar + automatic b-roll",
    aspect: "aspect-[9/16]",
    src: "",
    poster: "",
  },
  {
    label: "Full market update",
    meta: "8 min · 16:9 · built from your listing photos",
    aspect: "aspect-video",
    src: "",
    poster: "",
  },
];

// Everything an agent needs to launch a channel, in the order they hit it.
const channelSteps = [
  { icon: Tv2, step: "Name it", tool: "Channel Name Generator", description: "Don't have a channel yet? Get name ideas built around your market and niche — not \"John Smith Realty 2\"." },
  { icon: Palette, step: "Brand it", tool: "Banner & Image Generator", description: "Finished banners for your YouTube channel, Facebook cover and LinkedIn profile — your headline, photos, QR codes and call to action, each at the right size. Plus post graphics for a just-listed, an open house or a market stat, with your words set in real type. No designer." },
  { icon: Film, step: "Fill it", tool: "AI Video Generator", description: "Short reels for social and full 8-minute market updates for search — both from one voice recording." },
  { icon: MousePointerClick, step: "Get the click", tool: "Thumbnail Generator", description: "Bold, readable thumbnails that hold up at phone size — the difference between 40 views and 4,000." },
  { icon: Search, step: "Get found", tool: "SEO Metadata + AI Answer Blocks", description: "SEO titles, descriptions and tags for the neighborhood keywords buyers search — plus answer blocks so AI assistants cite you too." },
  { icon: Upload, step: "Publish it", tool: "One-Click YouTube Publishing", description: "Connect your channel once. Every video after that publishes in one click — title, description and tags already filled in." },
];

const comparison = [
  { feature: "Unlimited camera recordings (no monthly cap)", us: true, a: false, b: false, c: false },
  { feature: "Built-in teleprompter + camera recorder", us: true, a: false, b: false, c: false },
  { feature: "No filming or on-camera requirement",  us: true,  a: false, b: false, c: false },
  { feature: "AI Avatar + Voice Cloning",             us: true,  a: true,  b: true,  c: false },
  { feature: "Long-form video (up to 8 minutes)",     us: true,  a: false, b: true,  c: false },
  { feature: "Channel branding kit (name, banner, thumbnails)", us: true, a: false, b: false, c: false },
  { feature: "AI answer-engine content (get cited by ChatGPT)", us: true, a: false, b: false, c: false },
  // The video tools compete on video. None of them hand you a page, which is
  // the only thing on this list an AI assistant can actually quote.
  { feature: "Blog post written with every script", us: true, a: false, b: false, c: false },
  { feature: "Hyperlocal market intelligence",        us: true,  a: false, b: true,  c: true  },
  { feature: "YouTube SEO optimized metadata",        us: true,  a: false, b: false, c: false },
  { feature: "One-button — no tech skills needed",    us: true,  a: false, b: false, c: false },
  { feature: "Listing Auto-Video (URL → Video)",      us: true,  a: false, b: true,  c: true  },
  { feature: "AI-generated social captions (LinkedIn, Instagram, email)", us: true, a: false, b: false, c: false },
  { feature: "Fair Housing Guardrails Built-in",      us: true,  a: false, b: false, c: false },
  { feature: "Purpose-built for Real Estate",         us: true,  a: false, b: true,  c: true  },
  // Posting to the other platforms went live 2026-10-11, so this row is a
  // win now; it was listed below as one we didn't win.
  { feature: "Publishes to Instagram, TikTok & Facebook", us: true, a: true, b: true, c: false },
  // Rows we don't win. A table where one product sweeps every line reads as
  // marketing; this is a real gap and it makes the wins above believable.
  { feature: "Scheduled posting calendar",            us: true,  a: true,  b: true,  c: true  },
  { feature: "Team seats & multi-agent brand controls", us: false, a: false, b: true,  c: false },
];

const steps = [
  {
    step: "01",
    title: "Hit the Mic. Speak, Spark, Share.",
    // Was "AI hands you 5 trending local topics". Every topic is on screen
    // now — twenty-five chips in three groups — rather than five picked for
    // you behind a tab.
    description: "Open the app and pick what you're making: your avatar, your own camera, or a blog post on its own. Twenty-five topics sit right there with your city already filled in — tap one, or speak your own for 60–90 seconds. No script, no prep, no camera.",
  },
  {
    step: "02",
    title: "AI Builds It Automatically.",
    description: "Our AI writes your script to Fair Housing guidelines, generates your avatar speaking in your cloned voice, adds b-roll and captions, and produces a broadcast-quality video — vertical for Reels and Shorts, or horizontal for YouTube. Zero editing required. Prefer to be on camera? The teleprompter is free and unlimited.",
  },
  {
    step: "03",
    title: "Publish. Rank. Stay Top-of-Mind.",
    // The Share Kit, named. It was described as scattered assets — "your
    // LinkedIn post, Instagram caption and email blurb" — which is a list of
    // parts rather than the thing you are handed.
    description: "One click publishes to YouTube with SEO metadata built to rank in your town. Your Share Kit is already written: titles, description, hashtags, LinkedIn post, Instagram caption, email blurb — and a full blog post for your own site, which is the thing an AI assistant can actually quote.",
  },
];

// Everything included, one line each (2026-10-25, the owner's ask): every
// feature named, and the 12 Spark Tools listed one by one.
const SPARK_TOOLS = [
  "Channel name", "LinkedIn profile", "Banner", "Thumbnails", "Post graphics from the Image Generator",
  "Titles", "Descriptions", "Tags", "Scripts", "AI Answer Blocks", "Google Reviews replies", "Seller Update",
];
const everythingIncluded: string[] = [
  ...features.filter((f) => !f.title.startsWith("12 Spark Tools")).map((f) => f.title.replace(/^"|"$/g, "")),
  ...SPARK_TOOLS.map((t) => `Spark Tool: ${t}`),
];

// Feature cards that have a page of their own (2026-10-22).
const LEARN_MORE: Record<string, string> = {
  "AutoSparks: Your Week, Written For You": "/real-estate-content-autopilot",
  "Unlimited Blog Writing": "/real-estate-blog-writer",
  "Built-In Teleprompter": "/real-estate-teleprompter",
  "One-Button Video Creation": "/ai-video-for-real-estate-agents",
  "No Camera Required": "/digital-twin",
  "Listing Video Generator": "/listing-video-generator",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ── shared with the feature pages, pricing, FAQ and blog
          since 2026-10-22, with a Features menu. */}
      <SiteNav />

      {/* ── Hero ── moving Speak → Spark → Share demo with the real video
          (2026-10-26, the owner's approved mockup). */}
      <Hero />

      {/* "What buyers in your area ask AI", moved from the hero to just under
          it (2026-10-26) so the hero has room to move. */}
      <section className="px-4 sm:px-6 py-10 bg-[#f7f3ea] border-b border-slate-200">
        <div className="max-w-3xl mx-auto">
          <AiQuestionsBox />
        </div>
      </section>

      {/* ── Scrolling Video Strip ── */}
      <section className="py-12 bg-slate-900 border-y border-slate-800">
        <p className="text-center text-lg font-bold text-slate-400 uppercase tracking-widest mb-2">
          Video types agents are creating right now
        </p>
        <p className="text-center text-xl text-slate-500 mb-8">
          Quick reels for social. Full-length market updates for search. Same one-button process.
        </p>
        <div className="max-w-[1600px] mx-auto overflow-hidden">

        {/* Row 1 — scrolls left */}
        <div className="marquee-track mb-4 relative">
          <div className="flex gap-4 animate-marquee whitespace-nowrap">
            {/* duplicated for a seamless loop */}
            {[...marqueeRow1, ...marqueeRow1].map(({ label, len, img }, i) => (
              <div key={i} className="inline-flex flex-col rounded-xl overflow-hidden border border-slate-700 shrink-0 w-72">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={label} className="w-full h-44 object-cover" />
                <div className="bg-slate-800 px-3 py-2.5">
                  <p className="text-lg font-semibold text-white truncate">{label}</p>
                  <p className="text-base text-slate-400 mt-0.5">AI-generated · {len}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — scrolls right */}
        <div className="marquee-track relative">
          <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap">
            {[...marqueeRow2, ...marqueeRow2].map(({ label, len, img }, i) => (
              <div key={i} className="inline-flex flex-col rounded-xl overflow-hidden border border-slate-700 shrink-0 w-72">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={label} className="w-full h-44 object-cover" />
                <div className="bg-slate-800 px-3 py-2.5">
                  <p className="text-lg font-semibold text-white truncate">{label}</p>
                  <p className="text-base text-slate-400 mt-0.5">AI-generated · {len}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section id="pain" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-8">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">Sound Familiar?</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3 max-w-4xl">
              You already know video works. That was never the problem.
            </h2>
            <p className="text-slate-500 max-w-4xl">
              Two-thirds of agents say video grows their business. Only 8% post consistently. The gap
              isn&apos;t motivation — it&apos;s these six things.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
            {painPoints.map(({ icon: Icon, pain, fix }) => (
              <div key={pain} className="bg-white p-5 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start gap-2.5 mb-3">
                  <Icon size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-xl font-bold text-slate-900 leading-snug">{pain}</p>
                </div>
                <div className="flex items-start gap-2 pl-[26px]">
                  <CheckCircle size={13} className="text-blue-900 shrink-0 mt-[3px]" />
                  <p className="text-lg text-slate-500 leading-relaxed">{fix}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Found on AI ── */}
      <section id="ai-search" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">Get Found On AI</p>
              {/* Was "asking ChatGPT, not Google" — which dismissed a channel
                  this product also serves. Every video ships with SEO title
                  and description copy written to rank on Google and YouTube;
                  a headline saying that surface no longer matters argues
                  against half of what the plan buys. The urgency is in "before
                  they ever call you", not in writing Google off. */}
              <h2 className="text-4xl font-black text-slate-900 mb-3">
                Your next client asks ChatGPT before they ever call you.
              </h2>
              <p className="text-slate-500 mb-4 leading-relaxed">
                &ldquo;Which Charlotte neighborhood should I buy in with $450k?&rdquo; &ldquo;Is now a
                good time to sell in Mesa?&rdquo; Buyers ask an AI assistant these questions months
                before they ever call an agent — and the AI answers by quoting websites it trusts.
              </p>
              {/* Two features, told apart.
                  This section described both in nearly the same words — Answer
                  Blocks handing you "a text block for your website", the blog
                  being "a full blog post" — which read as one thing described
                  twice, or two things doing the same job. They are a pair:
                  one decides what to write about, the other is what gets
                  published. Saying so is worth more than the acronyms.

                  "Never uses one of your videos" is the claim that stays true
                  on every plan — the article is not metered against your
                  allowance. It sits inside the same 14-day free window as
                  camera recording, which is why this does not say free. */}
              <p className="text-slate-500 mb-4 leading-relaxed">
                Right now it isn&apos;t quoting you. Fixing that takes two things, and you get both.
              </p>
              <p className="text-slate-500 mb-4 leading-relaxed">
                <span className="font-semibold text-slate-700">First, what to say.</span> AI Answer
                Blocks researches what buyers in your market are actually asking this month — not
                invented topics, the questions being typed into ChatGPT — and hands you three videos
                to record, opening line included, one click to the recording screen.
              </p>
              {/* Was "An AI cannot quote your video; it can quote your page."
                  A sharp line that argued against the product: it told a
                  shopper the free deliverable wins the battle the paid one
                  cannot, and it contradicted this app's own YouTube prompt,
                  which writes descriptions specifically so an assistant can
                  quote them — FAQ block included. Assistants do cite video.
                  The bundle is the stronger claim and the true one. */}
              <p className="text-slate-500 mb-6 leading-relaxed">
                <span className="font-semibold text-slate-700">Then, two places to be quoted.</span>{" "}
                Your video goes out with a description built around a real FAQ block — the format
                voice search and AI Overviews pull their answers from. And every script also comes
                with a full blog post for your own site: usually 1,000 to 1,500 words, headings written as
                the questions people actually ask and answered in the first line, which is the shape
                an assistant lifts and cites. That is{" "}
                <span className="font-semibold text-slate-700">AEO and GEO</span>, alongside ordinary
                SEO. Copy it as HTML and paste it in. One recording, two surfaces — and most agents
                have neither. Blog posts{" "}
                <span className="font-semibold text-slate-700">never use one of your videos</span> —
                you can write one without making a video at all.
              </p>
              <a href="/beta" className="inline-flex items-center gap-2 bg-blue-900 text-white text-xl font-semibold px-6 py-3 hover:bg-blue-800 transition-colors">
                Show Me What My Buyers Are Asking <ArrowRight size={15} />
              </a>
            </div>

            {/* Illustrative example of the output */}
            <div className="border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={14} className="text-slate-400" />
                <p className="text-lg font-bold text-slate-400 uppercase tracking-wide">What it produces</p>
              </div>
              <div className="bg-white border border-slate-200 p-4 mb-3">
                <p className="text-base font-bold text-blue-900 uppercase tracking-wide mb-1.5">The question they ask AI</p>
                <p className="text-xl font-semibold text-slate-800 leading-snug">
                  &ldquo;What neighborhoods should I look at in Charlotte as a first-time buyer with
                  around $450,000?&rdquo;
                </p>
              </div>
              <div className="bg-white border border-slate-200 p-4 mb-3">
                <p className="text-base font-bold text-blue-900 uppercase tracking-wide mb-1.5">① The video you record</p>
                <p className="text-xl font-semibold text-slate-800 leading-snug mb-1">
                  Charlotte neighborhoods for first-time buyers around $450k
                </p>
                <p className="text-lg text-slate-500 italic">
                  Open with: &ldquo;If you have about $450k, these are the Charlotte areas to check first.&rdquo;
                </p>
              </div>
              {/* Was "② The block you paste on your site", which is what the
                  blog post is also for — two panels claiming the same job. The
                  article gets its own numbered slot, so the example shows the
                  pair the copy beside it describes: a question, the video that
                  answers it, and the page an assistant can quote. */}
              <div className="bg-white border border-slate-200 p-4 mb-3">
                <p className="text-base font-bold text-blue-900 uppercase tracking-wide mb-1.5">② The blog post that goes with it</p>
                <p className="text-lg text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-700">H2: What can $450,000 buy in Charlotte right now?</span>{" "}
                  At this budget you are mostly looking at townhomes near the light-rail corridor and
                  older single-family stock further out. Compare housing stock, commute and HOA costs
                  — not just list price…
                </p>
              </div>
              <div className="bg-white border border-slate-200 p-4">
                <p className="text-base font-bold text-blue-900 uppercase tracking-wide mb-1.5">③ The rest of your Share Kit</p>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Title, description and hashtags for YouTube. An Instagram caption, a LinkedIn post
                  and an email blurb, already written.
                </p>
              </div>
              <p className="text-base text-slate-400 mt-3 leading-relaxed">
                Illustrative example. The questions are researched for your own market, and everything
                below them is written in your name.
              </p>
            </div>
          </div>

          {/* The connective tissue: both discovery channels are fed by the same video. */}
          <div className="mt-8 border border-blue-900/20 border-l-4 border-l-blue-900 bg-blue-50/50 p-5">
            <p className="text-xl font-black text-slate-900 mb-2">
              One video. Two places to get found.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-2.5">
                <Search size={15} className="text-blue-900 shrink-0 mt-0.5" />
                <p className="text-xl text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">YouTube search.</span> Every video
                  ships with an SEO title, description and tags built to rank for your neighborhood —
                  so it keeps bringing people in months after you post it.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Bot size={15} className="text-blue-900 shrink-0 mt-0.5" />
                <p className="text-xl text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">AI assistants.</span> ChatGPT and
                  Google&apos;s AI read YouTube titles, descriptions and transcripts when they answer.
                  The same video that ranks is also what they quote.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── See It For Yourself ── */}
      <section id="demo" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-2">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">See It For Yourself</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3 max-w-4xl">
              Watch it work. Then judge what it makes.
            </h2>
            <p className="text-slate-500 max-w-4xl">
              Wondering whether an AI avatar will look and sound like you — or look like a robot in
              front of your clients? Fair question. Watch before you decide.
            </p>
          </div>

          <DemoVideo />

          {(SAMPLE_VIDEOS.some((v) => v.src) || process.env.NODE_ENV === "development") && (
            <div className="mt-14">
              <p className="text-lg font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">
                Videos made with SparkReels
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center items-start">
                {SAMPLE_VIDEOS.map(({ label, meta, aspect, src, poster }) => {
                  if (!src && process.env.NODE_ENV !== "development") return null;
                  return (
                    <div key={label} className={`w-full ${aspect === "aspect-video" ? "sm:max-w-md" : "sm:max-w-[240px]"}`}>
                      <div className={`${aspect} bg-slate-900 rounded-xl overflow-hidden border border-slate-200 relative`}>
                        {src ? (
                          <video
                            src={src}
                            poster={poster || undefined}
                            controls
                            preload="metadata"
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          // Dev-only placeholder — see SAMPLE_VIDEOS at the top of this file.
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-600 rounded-xl p-4 text-center">
                            <Film size={28} className="text-slate-500" />
                            <p className="text-lg font-bold text-slate-300">Sample video slot</p>
                            <p className="text-base text-slate-500 leading-relaxed">
                              Add the file to /public, then set <code>src</code> in SAMPLE_VIDEOS
                            </p>
                          </div>
                        )}
                      </div>
                      <p className="text-xl font-bold text-slate-900 mt-3">{label}</p>
                      <p className="text-lg text-slate-500 mt-0.5">{meta}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-10 text-center">
            <a href="/beta" className="inline-flex items-center gap-2 bg-blue-900 text-white text-xl font-semibold px-6 py-3 hover:bg-blue-800 transition-colors">
              Make My First Video Free <ArrowRight size={15} />
            </a>
            <p className="text-lg text-slate-400 mt-3">No credit card · Takes about 5 minutes</p>
            {/* What the free video includes, said before signup rather than
                found out after it. It read "are coming to paid plans" until
                posting to the other platforms went live (2026-10-11). */}
            <p className="text-base text-slate-400 mt-1.5">
              Your free video publishes to YouTube. Instagram, Facebook, LinkedIn and more come with a paid plan.
            </p>
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section id="who" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-8">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">Who It&apos;s For</p>
            <h2 className="text-4xl font-black text-slate-900 leading-tight mb-3 max-w-4xl">
              Two-thirds of agents know video grows their business. Most just don&apos;t have a system to do it.
            </h2>
            <p className="text-slate-500 max-w-4xl">
              Built for agents who are already successful — and want to future-proof their business and become the &ldquo;digital go-to agent&rdquo; in their town.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {segments.map(({ icon: Icon, segment, driver, desire, photo }) => (
              <div key={segment} className="bg-white border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={segment} className="w-full h-44 object-cover" />
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} className="text-blue-900 shrink-0" />
                    <p className="font-bold text-slate-900 text-xl">{segment}</p>
                    <span className="text-base font-semibold text-blue-900 bg-blue-50 border border-blue-100 px-2 py-0.5 ml-auto">{driver}</span>
                  </div>
                  <p className="text-slate-500 text-xl leading-relaxed">{desire}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-white border border-blue-900/20 border-l-4 border-l-blue-900">
            <p className="text-xl text-slate-700">
              Agents who post consistent video content grow revenue{" "}
              <span className="font-bold text-blue-900">49% faster</span>{" "}
              — yet two-thirds of the market still isn&apos;t doing it consistently. SparkReels.ai removes every barrier that&apos;s stopping them.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">How It Works</p>
            {/* "and Video Generated" named one of the three outputs. A blog
                post is a first-class one now, and the teleprompter route makes
                a video without generating anything. */}
            <h2 className="text-4xl font-black text-slate-900 mb-3">From one conversation to a video, a script and a blog post.</h2>
            <p className="text-slate-500">What used to take a full Saturday now takes one conversation.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line desktop */}
            <div className="hidden md:block absolute top-[88px] left-[calc(33%+16px)] right-[calc(33%+16px)] h-px bg-blue-100 z-0" />

            {[
              {
                num: "1",
                color: "bg-blue-900",
                title: "Pick what you're making",
                description: "Your avatar, your own camera, or a blog post on its own. Then hit the mic — or tap one of twenty-five topics with your city already filled in. Choose your length: a 60-second reel, or a full market update up to 8 minutes.",
                photo: "https://images.unsplash.com/photo-1598978996253-dcfb7f324f89?auto=format&fit=crop&w=600&q=80",
                alt: "Agent speaking into mic",
              },
              {
                num: "2",
                color: "bg-blue-700",
                title: "AI builds it",
                description: "Script written. Avatar rendered in your cloned voice. Captions added. B-roll included. Vertical for Reels and Shorts, horizontal for YouTube. Fully produced, zero editing — or film it yourself on the free teleprompter.",
                photo: "https://images.unsplash.com/photo-1614963326505-843868e1d83a?auto=format&fit=crop&w=600&q=80",
                alt: "AI generating video",
              },
              {
                num: "3",
                color: "bg-blue-500",
                title: "Publish and share",
                // Updated 2026-10-15: every platform, and email through
                // BoldTrail or the agent's own email tool.
                description: "One click posts to YouTube, Instagram, Facebook, LinkedIn, TikTok, X, Threads and Google Business, with titles and captions written for each. Your Share Kit includes a full blog post for your own site, and you can email a video, a blog post or a newsletter to your clients through BoldTrail or your own email. Then watch the views, likes and comments come back in Spark Insights.",
                photo: "https://images.unsplash.com/photo-1726066012749-f81bf4422d4e?auto=format&fit=crop&w=600&q=80",
                alt: "Published video on social",
              },
            ].map(({ num, color, title, description, photo, alt }) => (
              <div key={num} className="flex flex-col items-center text-center relative z-10">
                {/* Step image with number badge */}
                <div className="relative w-full mb-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={alt} className="w-full h-32 object-cover rounded-2xl" />
                  <div className={`absolute -top-3 -left-3 w-9 h-9 rounded-full ${color} text-white text-xl font-black flex items-center justify-center shadow-lg`}>
                    {num}
                  </div>
                </div>
                {/* Text */}
                <h3 className="text-2xl font-black text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-xl leading-relaxed max-w-sm">{description}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 text-center">
            <p className="text-xl text-slate-400">Script generated instantly. Video ready — <span className="font-semibold text-blue-900">while you&apos;re creating another video or out to see a client.</span></p>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-8">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">Everything Included</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3">Built to make you Visible and the digital local expert in your market.</h2>
            <p className="text-slate-500">Hyperlocal intelligence. SEO domination. Zero camera required.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
            {features.map(({ title, description, photo, paid }) => (
              <div key={title} className="bg-white hover:bg-slate-50 transition-colors group overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={title} className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="p-5">
                  {paid && (
                    <span className="mb-2 inline-block rounded-full bg-[#BA7517] px-2.5 py-0.5 text-sm font-semibold text-white">
                      Paid plans
                    </span>
                  )}
                  <h3 className="text-xl font-bold text-slate-900 mb-1.5 leading-snug">{title}</h3>
                  <p className="text-slate-500 text-lg leading-relaxed">{description}</p>
                  {LEARN_MORE[title] && (
                    <Link href={LEARN_MORE[title]} className="mt-2 inline-block text-lg font-semibold text-blue-900 hover:underline">
                      Learn more →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* The top bar's Features menu, listed here too (2026-10-25, the owner's
              ask): the same feature pages, with the same names and descriptions. */}
          <div className="mt-8">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-4">Features, page by page</p>
            <div className="grid grid-cols-1 gap-px bg-slate-200 border border-slate-200 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_PAGES.map((f) => (
                <Link key={f.slug} href={`/${f.slug}`} className="block bg-white p-5 hover:bg-slate-50 transition-colors">
                  <span className="block text-xl font-bold text-slate-900 mb-1">{f.navLabel}</span>
                  <span className="block text-lg text-slate-500 leading-relaxed">{f.blurb}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Everything included, one line each (2026-10-25). */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-4">Everything included, one line each</p>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-2 text-lg text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              {everythingIncluded.map((item) => (
                <li key={item} className="flex gap-2 leading-snug">
                  <span className="text-[#BA7517] font-bold" aria-hidden="true">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Start a YouTube Channel ── */}
      <section id="channel" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-900 border-b border-slate-800">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-8">
            <p className="text-lg font-bold text-blue-300 uppercase tracking-widest mb-3">Channel In A Box</p>
            <h2 className="text-4xl font-black text-white mb-3 max-w-5xl">
              Don&apos;t have a YouTube channel yet? Start one today.
            </h2>
            <p className="text-slate-400 max-w-4xl">
              You don&apos;t need a designer, a videographer, or an editor. Every piece of a real
              channel — the name, the banner, the videos, the thumbnails, the SEO — is generated
              inside SparkReels.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-800 border border-slate-800">
            {channelSteps.map(({ icon: Icon, step, tool, description }, i) => (
              <div key={step} className="bg-slate-900 p-6 hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 bg-blue-900/40 border border-blue-800 flex items-center justify-center shrink-0">
                    <Icon size={17} className="text-blue-300" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-500 uppercase tracking-wide">Step {i + 1}</p>
                    <p className="text-xl font-black text-white leading-tight">{step}</p>
                  </div>
                </div>
                <p className="text-lg font-semibold text-blue-300 mb-1.5">{tool}</p>
                <p className="text-slate-400 text-lg leading-relaxed">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-slate-800/60 border border-slate-700 border-l-4 border-l-blue-500">
            <p className="text-xl text-slate-300">
              Already have a channel? Skip to step 3 — the video, thumbnail and SEO tools work just
              as well on a channel you&apos;ve been running for years.
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start">
            <a href="/beta" className="inline-flex items-center gap-2 bg-white text-blue-900 text-xl font-semibold px-6 py-3 hover:bg-blue-50 transition-colors">
              Start My Channel Free <ArrowRight size={15} />
            </a>
            <a href="#pricing" className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 text-xl font-semibold px-6 py-3 hover:border-slate-500 hover:text-white transition-colors">
              See Plans <ChevronRight size={15} />
            </a>
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section id="compare" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-10">
            <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">How We Stack Up</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3">Where we win — and where we don&apos;t.</h2>
            <p className="text-slate-500">
              No camera. No tech skills. No manual editing. We&apos;re also honest about the three
              things other tools still do better — those are on our roadmap, not hidden from you.
            </p>
          </div>
          {/* overflow-x-auto, not hidden: the table is ~520px and would clip its
              last columns off the side of a phone with no way to reach them. */}
          <div className="border border-slate-200 overflow-x-auto">
            <table className="w-full text-xl min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-500 text-lg w-[40%]">Feature</th>
                  <th className="p-4 text-center font-bold text-blue-900 text-lg bg-blue-50">SparkReels.ai</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-lg">Competitor A</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-lg">Competitor B</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-lg">Competitor C</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ feature, us, a, b, c }, idx) => (
                  <tr key={feature} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="p-3 pl-4 text-slate-700 font-medium text-lg">{feature}</td>
                    {[us, a, b, c].map((val, i) => (
                      <td key={i} className={`p-3 text-center ${i === 0 ? "bg-blue-50/50" : ""}`}>
                        {val
                          ? <CheckCircle size={15} className={`mx-auto ${i === 0 ? "text-blue-900" : "text-green-500"}`} />
                          : <X size={15} className="mx-auto text-slate-200" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-lg text-slate-400 mt-3">Based on publicly available feature documentation. Last updated {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.</p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <PricingSection />


      {/* ── FAQ ── the most-asked questions (2026-10-22). The full list, with
          the FAQ search tags, is on /faq; these repeat some of it, so no tags here. */}
      <section id="faq" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-[1000px] mx-auto">
          <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="text-4xl font-black text-slate-900 mb-6">Questions agents ask</h2>
          <FaqList items={LANDING_FAQS} schema={false} />
          <p className="mt-5 text-lg">
            <Link href="/faq" className="font-semibold text-blue-900 hover:underline">All questions →</Link>
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-14 sm:py-16 px-4 sm:px-6 bg-blue-900 text-white">
        <div className="max-w-[1600px] mx-auto">
          <p className="text-lg font-bold text-white uppercase tracking-widest mb-4">Stop being invisible. Build Authority, Trust and Local Expert with SparkReels.ai</p>
          <h2 className="text-4xl sm:text-6xl font-black mb-5 leading-tight text-white">
            Hit the Mic. Speak, Spark, Share.
          </h2>
          <p className="text-blue-200 text-2xl mb-3 max-w-3xl leading-relaxed">
            The one-button video platform for real estate agents. No camera. No editing. Just Visibility.
          </p>
          <p className="text-blue-300 text-2xl mb-8 max-w-3xl leading-relaxed">
            Visibility creates credibility.<br />
            Credibility creates trust.<br />
            Trust creates opportunities.<br />
            And opportunities create business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start mb-8">
            <a href="/beta" className="inline-flex items-center gap-2 bg-white text-blue-900 text-xl font-semibold px-6 py-3 hover:bg-blue-50 transition-colors">
              Claim Your Free Video <ArrowRight size={15} />
            </a>
            <a href="#pricing" className="inline-flex items-center gap-2 border border-blue-700 text-blue-200 text-xl font-semibold px-6 py-3 hover:border-blue-500 hover:text-white transition-colors">
              View Pricing <ChevronRight size={15} />
            </a>
          </div>
          <p className="text-base text-blue-200 -mt-4 mb-8">
            Your free video publishes to YouTube. Instagram, Facebook, LinkedIn and more come with a paid plan.
          </p>
          <p className="text-blue-300 text-xl">First 100 agents · 1 free AI video · No credit card · Cancel anytime</p>
        </div>
      </section>

      {/* Fair Housing compliance is stated in the footer — no separate band. */}

      {/* ── Footer ── shared with the new public pages (2026-10-22). */}
      <SiteFooter />
    </div>
  );
}
