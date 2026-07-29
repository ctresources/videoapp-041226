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
    fix: "Two answers: AI hands you five trending local topics before you start, and AI Answer Blocks shows you the exact questions buyers in your market are typing into ChatGPT. Pick one, hit record — the script writes itself.",
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
    fix: "AI Answer Blocks finds the questions your buyers ask AI, then turns each one into a video you can record in a click — plus text for your site so you're the one AI quotes.",
  },
];

const segments = [
  {
    icon: Clock,
    segment: "Solo Agents",
    driver: "Time Scarcity",
    desire: "Stay top-of-mind without losing 15 hours a week to content production.",
    photo: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: Camera,
    segment: "Camera-Shy Agents",
    driver: "Performance Anxiety",
    desire: "Build a powerful personal brand without ever appearing on screen.",
    photo: "https://images.unsplash.com/photo-1611162616475-46b635cb6868?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: Users,
    segment: "Team Leaders",
    driver: "Scalability",
    desire: "Ensure team-wide content consistency and brand compliance — at scale.",
    photo: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: UserPlus,
    segment: "New Agents",
    driver: "Brand Building",
    desire: "Establish local authority quickly and compete with seasoned agents from day one.",
    photo: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80",
  },
];

const features = [
  {
    title: "AI Topic Radar",
    description: "Never stare at a blank screen. Before you record, AI scans your local market and hands you 5 trending, ready-to-record topics — tailored to your city this week. Click one. Hit the mic. Done.",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "One Video → Full Content Pack",
    description: "Every video you create automatically generates a LinkedIn post, Instagram caption, YouTube description, and email newsletter blurb — all copy-ready. One recording session fuels your entire week of content.",
    photo: "https://images.unsplash.com/photo-1611162616475-46b635cb6868?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Built-In Teleprompter",
    description: "Want to appear on camera? Write or speak your script, then hit record — the teleprompter scrolls automatically while you film. No external app, no sticky notes, no memorizing lines.",
    photo: "https://images.unsplash.com/photo-1598550476439-6847785fcea6?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "One-Button Video Creation",
    description: "Speak for 90 seconds about any market topic, listing, or local update. AI writes the script, builds visuals, adds captions, and renders broadcast-quality video — no filming or editing required.",
    photo: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "No Camera Required",
    description: "Your AI avatar appears on screen in your place, speaking in your cloned voice. Build a compelling personal brand without ever recording your face.",
    photo: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Hyperlocal Market Intelligence",
    description: "Generate hyper-local market update videos that rank on YouTube — positioning you as the digital expert in your town.",
    photo: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "\"Digital Go-To Agent\" Status",
    description: "Consistently publishing hyper-local expert content makes you the agent people think of first when buyers and sellers search for a local expert.",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "YouTube SEO Rankings",
    description: "Every video includes an SEO-optimized title, description, tags, and a full blog post — built to rank on YouTube search for your target neighborhood keywords.",
    photo: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "YouTube Publishing",
    description: "One click publishes your video to YouTube with SEO-optimized title, description, and tags already filled in — ready to rank. More platforms coming soon.",
    photo: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Listing Video Generator",
    description: "Paste a Zillow URL or speak the address. We import the details and auto-generate a branded property tour video with your AI avatar — ready to post.",
    photo: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "8 AI Tools, Included",
    description: "Channel name, banner, thumbnails, titles, descriptions, tags, scripts and AI Answer Blocks — all generated in-app, free on every plan. Everything you need to launch a channel and get found, without hiring a designer.",
    photo: "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=600&q=80",
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
  { label: "Market Update",        len: "3 min",  img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80" },
  { label: "Listing Video",        len: "90 sec", img: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=400&q=80" },
  { label: "Neighborhood Tour",    len: "8 min",  img: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=80" },
  { label: "Just Sold",            len: "60 sec", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80" },
  { label: "Buyer Tips",           len: "3 min",  img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80" },
  { label: "Interest Rate Update", len: "60 sec", img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80" },
  { label: "Open House Recap",     len: "90 sec", img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=400&q=80" },
  { label: "Local Market Deep Dive", len: "8 min", img: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=400&q=80" },
];

const marqueeRow2 = [
  { label: "Seller Tips",          len: "3 min",  img: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=400&q=80" },
  { label: "Price Reduction",      len: "60 sec", img: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=400&q=80" },
  { label: "New Construction Tour", len: "8 min", img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=400&q=80" },
  { label: "Investment Property",  len: "4 min",  img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80" },
  { label: "Luxury Listing",       len: "90 sec", img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80" },
  { label: "School District Tour", len: "8 min",  img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80" },
  { label: "Coming Soon",          len: "60 sec", img: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=400&q=80" },
  { label: "Condo Showcase",       len: "3 min",  img: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=400&q=80" },
];

// ── SAMPLE OUTPUT VIDEOS — DROP YOUR FILES HERE ──────────────────────────────
// To publish a sample: put the .mp4 in /public (e.g. /public/samples/reel.mp4)
// and set `src` to its path, like src: "/samples/reel.mp4". Optionally add a
// `poster` image the same way so the card shows a still before it plays.
//
// While `src` is empty the card is HIDDEN from real visitors — the section only
// appears once at least one sample is filled in. Running `npm run dev` shows a
// labeled placeholder in its place so you can see where each one lands.
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
  { icon: Palette, step: "Brand it", tool: "Channel Banner Generator", description: "A finished 2560×1440 banner with your headline, photo, QR codes and subscribe call-out. Correct dimensions, no designer." },
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
  { feature: "Hyperlocal market intelligence",        us: true,  a: false, b: true,  c: true  },
  { feature: "YouTube SEO optimized metadata",        us: true,  a: false, b: false, c: false },
  { feature: "One-button — no tech skills needed",    us: true,  a: false, b: false, c: false },
  { feature: "Listing Auto-Video (URL → Video)",      us: true,  a: false, b: true,  c: true  },
  { feature: "AI-generated social captions (LinkedIn, Instagram, email)", us: true, a: false, b: false, c: false },
  { feature: "Fair Housing Guardrails Built-in",      us: true,  a: false, b: false, c: false },
  { feature: "Purpose-built for Real Estate",         us: true,  a: false, b: true,  c: true  },
  // Rows we don't win. A table where one product sweeps every line reads as
  // marketing; these are real gaps and they make the wins above believable.
  { feature: "Publishes to Instagram, TikTok & Facebook", us: false, a: true, b: true, c: false },
  { feature: "Scheduled posting calendar",            us: false, a: true,  b: true,  c: true  },
  { feature: "Team seats & multi-agent brand controls", us: false, a: false, b: true,  c: false },
];

const steps = [
  {
    step: "01",
    title: "Hit the Mic. Speak, Spark, Share.",
    description: "Open the app — AI hands you 5 trending local topics before you type a word. Pick one, or speak your own. Talk for 60–90 seconds. No script, no prep, no camera. Just your expertise.",
  },
  {
    step: "02",
    title: "AI Builds Your Video Automatically.",
    description: "Our AI writes a Fair Housing-compliant script, generates your AI avatar speaking in your cloned voice, adds b-roll and captions, and produces a broadcast-quality video. Zero editing required.",
  },
  {
    step: "03",
    title: "Publish. Rank. Stay Top-of-Mind.",
    description: "One click publishes to YouTube with SEO-optimized metadata designed to rank in your town. Your LinkedIn post, Instagram caption, and email blurb are already written and waiting to copy.",
  },
];

const pricingTiers = [
  {
    name: "Starter",
    price: "$59",
    period: "/month",
    description: "Get in the game",
    badge: null,
    features: ["4 AI videos/month — up to 3 minutes each", "Automatic b-roll, captions & titles on every video", "MLS listing videos — paste a listing link, get a finished property tour", "Unlimited camera recordings (up to 15 mins each)", "Built-in teleprompter", "Voice recording + AI script", "AI content toolkit — title, script, description, tag & channel-name generators", "Thumbnail & YouTube channel banner generator", "AI Answer Blocks — turns what buyers ask ChatGPT into videos you can record", "YouTube (16:9) & Reel (9:16) formats", "1 social platform (YouTube)", "Other platforms coming soon"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=starter",
  },
  {
    name: "Agent",
    price: "$189",
    period: "/month",
    description: "Build your local brand",
    badge: "Most Popular",
    features: ["4 short AI videos/month — up to 4 minutes each, with automatic b-roll", "2 long AI videos/month — up to 8 minutes each, using your photos for visuals", "MLS listing videos — paste a listing link, get a finished property tour", "Unlimited camera recordings (up to 15 mins each)", "Built-in teleprompter", "Voice recording + AI script", "AI content toolkit — title, script, description, tag & channel-name generators", "Thumbnail & YouTube channel banner generator", "AI Answer Blocks — turns what buyers ask ChatGPT into videos you can record", "YouTube (16:9) & Reel (9:16) formats", "1 social platform (YouTube)", "Other platforms coming soon"],
    cta: "Get Started",
    highlighted: true,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Pro",
    price: "$299",
    period: "/month",
    description: "Dominate your market",
    badge: null,
    features: ["4 short AI videos/month — up to 4 minutes each, with automatic b-roll", "5 long AI videos/month — up to 8 minutes each, using your photos for visuals", "MLS listing videos — paste a listing link, get a finished property tour", "Priority rendering", "Unlimited camera recordings (up to 15 mins each)", "Built-in teleprompter", "Voice recording + AI script", "AI content toolkit — title, script, description, tag & channel-name generators", "Thumbnail & YouTube channel banner generator", "AI Answer Blocks — turns what buyers ask ChatGPT into videos you can record", "YouTube (16:9) & Reel (9:16) formats", "1 social platform (YouTube)", "Other platforms coming soon"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=pro",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex flex-col leading-none">
            <Image
              src="/logo_navbar_transparent.png"
              alt="SparkReels"
              width={180}
              height={52}
              unoptimized
              priority
            />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#who"          className="hover:text-slate-900 transition-colors">Who It&apos;s For</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#features"     className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#channel"      className="hover:text-slate-900 transition-colors">Start a Channel</a>
            <a href="#pricing"      className="hover:text-slate-900 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-3 py-2">
              Log In
            </Link>
            <Link href="/beta" className="text-sm font-semibold bg-blue-900 text-white px-5 py-2.5 hover:bg-blue-800 transition-colors flex items-center gap-1.5">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-14 pb-12 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto">

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="font-black text-blue-900 mb-3 tracking-wide">
                <span className="text-4xl">Speak, Spark, Share —</span><br />
                <span className="text-xl sm:whitespace-nowrap">no filming, no editing, no glam required.</span>
              </p>
              <p className="text-base text-slate-500 mb-4 leading-relaxed">
                Most real estate agents are invisible online. SparkReels.ai fixes that — turning one voice recording into a publish-ready video. A 60-second reel for social, or a full 8-minute market update built to rank on YouTube.
              </p>
              <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-5">
                Real Estate Agents who post video grow revenue 49% faster.<br />Yet ONLY 8% do it consistently. Why?
              </p>
              <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6 text-slate-900">
                <span className="block">Hit the Mic....Be Visible </span>
                <span className="block text-blue-900">and become the go-to-local expert of your town.</span>
              </h1>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <a href="/beta" className="inline-flex items-center gap-2 bg-blue-900 text-white text-sm font-semibold px-6 py-3 hover:bg-blue-800 transition-colors">
                  Sign up for free <ArrowRight size={15} />
                </a>
                <a href="#how-it-works" className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 text-sm font-semibold px-6 py-3 hover:border-slate-400 hover:bg-slate-50 transition-colors">
                  See How It Works <ChevronRight size={15} />
                </a>
              </div>
              <a href="/beta" className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full mt-4 hover:bg-emerald-100 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                First 100 agents get 1 free AI video — no credit card
              </a>
              <p className="mt-3 text-2xl font-semibold text-slate-400 tracking-wide">Visibility → Credibility → Trust → Business</p>
              <p className="mt-4 text-sm text-slate-400">No camera needed · Fair Housing compliant · Cancel anytime</p>
            </div>
            {/* Hero image */}
            <div className="relative hidden lg:block animate-float pt-4">
              <Image
                src="/hit-record.png"
                alt="Hit the Mic. Speak, Spark, Share."
                width={900}
                height={1125}
                className="w-full h-[520px] object-cover rounded-2xl shadow-2xl"
                priority
              />
              <div className="absolute bottom-6 left-6 bg-white border border-slate-200 shadow-lg px-5 py-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-0.5">Agents using video grow</p>
                <p className="text-2xl font-black text-blue-900">49% faster</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scrolling Video Strip ── */}
      <section className="py-12 bg-slate-900 border-y border-slate-800">
        <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          Video types agents are creating right now
        </p>
        <p className="text-center text-sm text-slate-500 mb-8">
          Quick reels for social. Full-length market updates for search. Same one-button process.
        </p>
        <div className="max-w-6xl mx-auto overflow-hidden">

        {/* Row 1 — scrolls left */}
        <div className="marquee-track mb-4 relative">
          <div className="flex gap-4 animate-marquee whitespace-nowrap">
            {/* duplicated for a seamless loop */}
            {[...marqueeRow1, ...marqueeRow1].map(({ label, len, img }, i) => (
              <div key={i} className="inline-flex flex-col rounded-xl overflow-hidden border border-slate-700 shrink-0 w-52">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={label} className="w-full h-32 object-cover" />
                <div className="bg-slate-800 px-3 py-2.5">
                  <p className="text-xs font-semibold text-white truncate">{label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">AI-generated · {len}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — scrolls right */}
        <div className="marquee-track relative">
          <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap">
            {[...marqueeRow2, ...marqueeRow2].map(({ label, len, img }, i) => (
              <div key={i} className="inline-flex flex-col rounded-xl overflow-hidden border border-slate-700 shrink-0 w-52">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={label} className="w-full h-32 object-cover" />
                <div className="bg-slate-800 px-3 py-2.5">
                  <p className="text-xs font-semibold text-white truncate">{label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">AI-generated · {len}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section id="pain" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Sound Familiar?</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3 max-w-2xl">
              You already know video works. That was never the problem.
            </h2>
            <p className="text-slate-500 max-w-2xl">
              Two-thirds of agents say video grows their business. Only 8% post consistently. The gap
              isn&apos;t motivation — it&apos;s these six things.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
            {painPoints.map(({ icon: Icon, pain, fix }) => (
              <div key={pain} className="bg-white p-5 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start gap-2.5 mb-3">
                  <Icon size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-slate-900 leading-snug">{pain}</p>
                </div>
                <div className="flex items-start gap-2 pl-[26px]">
                  <CheckCircle size={13} className="text-blue-900 shrink-0 mt-[3px]" />
                  <p className="text-xs text-slate-500 leading-relaxed">{fix}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Found on AI ── */}
      <section id="ai-search" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Get Found On AI</p>
              <h2 className="text-3xl font-black text-slate-900 mb-3">
                Your next client is asking ChatGPT, not Google.
              </h2>
              <p className="text-slate-500 mb-4 leading-relaxed">
                &ldquo;Which Charlotte neighborhood should I buy in with $450k?&rdquo; &ldquo;Is now a
                good time to sell in Mesa?&rdquo; Buyers ask an AI assistant these questions months
                before they ever call an agent — and the AI answers by quoting websites it trusts.
              </p>
              <p className="text-slate-500 mb-4 leading-relaxed">
                Right now it isn&apos;t quoting you. <span className="font-semibold text-slate-700">AI
                Answer Blocks</span> researches what buyers in your market are actually asking — then
                hands you <span className="font-semibold text-slate-700">three videos to record</span>,
                opening line included, one click to the recording screen.
              </p>
              <p className="text-slate-500 mb-6 leading-relaxed">
                No more guessing what to post. These aren&apos;t invented topics — they&apos;re the
                questions your buyers are typing into ChatGPT this month. Each one also comes with a
                text block for your website, written the way AI assistants extract and cite answers.
              </p>
              <a href="/beta" className="inline-flex items-center gap-2 bg-blue-900 text-white text-sm font-semibold px-6 py-3 hover:bg-blue-800 transition-colors">
                Show Me What My Buyers Are Asking <ArrowRight size={15} />
              </a>
            </div>

            {/* Illustrative example of the output */}
            <div className="border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={14} className="text-slate-400" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">What it produces</p>
              </div>
              <div className="bg-white border border-slate-200 p-4 mb-3">
                <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wide mb-1.5">The question they ask AI</p>
                <p className="text-sm font-semibold text-slate-800 leading-snug">
                  &ldquo;What neighborhoods should I look at in Charlotte as a first-time buyer with
                  around $450,000?&rdquo;
                </p>
              </div>
              <div className="bg-white border border-slate-200 p-4 mb-3">
                <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wide mb-1.5">① The video you record</p>
                <p className="text-sm font-semibold text-slate-800 leading-snug mb-1">
                  Charlotte neighborhoods for first-time buyers around $450k
                </p>
                <p className="text-xs text-slate-500 italic">
                  Open with: &ldquo;If you have about $450k, these are the Charlotte areas to check first.&rdquo;
                </p>
              </div>
              <div className="bg-white border border-slate-200 p-4">
                <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wide mb-1.5">② The block you paste on your site</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Start by comparing housing stock, commute, and HOA costs — not just list price. At
                  this budget, look at townhomes near the light-rail corridor and older single-family
                  stock further out…
                </p>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                Illustrative example. Your blocks are researched for your own market and named to you.
              </p>
            </div>
          </div>

          {/* The connective tissue: both discovery channels are fed by the same video. */}
          <div className="mt-8 border border-blue-900/20 border-l-4 border-l-blue-900 bg-blue-50/50 p-5">
            <p className="text-sm font-black text-slate-900 mb-2">
              One video. Two places to get found.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-2.5">
                <Search size={15} className="text-blue-900 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">YouTube search.</span> Every video
                  ships with an SEO title, description and tags built to rank for your neighborhood —
                  so it keeps bringing people in months after you post it.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Bot size={15} className="text-blue-900 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 leading-relaxed">
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
        <div className="max-w-5xl mx-auto">
          <div className="mb-2">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">See It For Yourself</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3 max-w-2xl">
              Watch it work. Then judge what it makes.
            </h2>
            <p className="text-slate-500 max-w-2xl">
              Wondering whether an AI avatar will look and sound like you — or look like a robot in
              front of your clients? Fair question. Watch before you decide.
            </p>
          </div>

          <DemoVideo />

          {(SAMPLE_VIDEOS.some((v) => v.src) || process.env.NODE_ENV === "development") && (
            <div className="mt-14">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">
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
                            <p className="text-xs font-bold text-slate-300">Sample video slot</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              Add the file to /public, then set <code>src</code> in SAMPLE_VIDEOS
                            </p>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-900 mt-3">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{meta}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-10 text-center">
            <a href="/beta" className="inline-flex items-center gap-2 bg-blue-900 text-white text-sm font-semibold px-6 py-3 hover:bg-blue-800 transition-colors">
              Make My First Video Free <ArrowRight size={15} />
            </a>
            <p className="text-xs text-slate-400 mt-3">No credit card · Takes about 5 minutes</p>
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section id="who" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Who It&apos;s For</p>
            <h2 className="text-3xl font-black text-slate-900 leading-tight mb-3 max-w-2xl">
              Two-thirds of agents know video grows their business. Most just don&apos;t have a system to do it.
            </h2>
            <p className="text-slate-500 max-w-2xl">
              Built for agents who are already successful — and want to future-proof their business and become the &ldquo;digital go-to agent&rdquo; in their town.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {segments.map(({ icon: Icon, segment, driver, desire, photo }) => (
              <div key={segment} className="bg-white border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={segment} className="w-full h-32 object-cover" />
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} className="text-blue-900 shrink-0" />
                    <p className="font-bold text-slate-900 text-sm">{segment}</p>
                    <span className="text-[10px] font-semibold text-blue-900 bg-blue-50 border border-blue-100 px-2 py-0.5 ml-auto">{driver}</span>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">{desire}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-white border border-blue-900/20 border-l-4 border-l-blue-900">
            <p className="text-sm text-slate-700">
              Agents who post consistent video content grow revenue{" "}
              <span className="font-bold text-blue-900">49% faster</span>{" "}
              — yet two-thirds of the market still isn&apos;t doing it consistently. SparkReels.ai removes every barrier that&apos;s stopping them.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">From Speak, To AI Script and Video Generated.</h2>
            <p className="text-slate-500">What used to take a full Saturday now takes one conversation.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line desktop */}
            <div className="hidden md:block absolute top-[88px] left-[calc(33%+16px)] right-[calc(33%+16px)] h-px bg-blue-100 z-0" />

            {[
              {
                num: "1",
                color: "bg-blue-900",
                title: "Speak your topic",
                description: "Hit the mic — or pick a trending local topic before you start. Choose your length: a 60-second reel, or a full-length market update up to 8 minutes.",
                photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
                alt: "Agent speaking into mic",
              },
              {
                num: "2",
                color: "bg-blue-700",
                title: "AI builds your video",
                description: "Script written. AI avatar rendered. Captions added. B-roll included. A broadcast-quality video — fully produced, zero editing.",
                photo: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=600&q=80",
                alt: "AI generating video",
              },
              {
                num: "3",
                color: "bg-blue-500",
                title: "Publish and share",
                description: "One click to YouTube with SEO-optimized title, description, and tags. Your LinkedIn post and Instagram caption are already written.",
                photo: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
                alt: "Published video on social",
              },
            ].map(({ num, color, title, description, photo, alt }) => (
              <div key={num} className="flex flex-col items-center text-center relative z-10">
                {/* Step image with number badge */}
                <div className="relative w-full mb-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={alt} className="w-full h-32 object-cover rounded-2xl" />
                  <div className={`absolute -top-3 -left-3 w-9 h-9 rounded-full ${color} text-white text-sm font-black flex items-center justify-center shadow-lg`}>
                    {num}
                  </div>
                </div>
                {/* Text */}
                <h3 className="text-base font-black text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed max-w-xs">{description}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 text-center">
            <p className="text-sm text-slate-400">Script generated instantly. Video ready — <span className="font-semibold text-blue-900">while you&apos;re creating another video or out to see a client.</span></p>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Everything Included</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Built to make you Visible and the digital local expert in your market.</h2>
            <p className="text-slate-500">Hyperlocal intelligence. SEO domination. Zero camera required.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
            {features.map(({ title, description, photo }) => (
              <div key={title} className="bg-white hover:bg-slate-50 transition-colors group overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={title} className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="p-5">
                  <h3 className="text-sm font-bold text-slate-900 mb-1.5 leading-snug">{title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Start a YouTube Channel ── */}
      <section id="channel" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-900 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-3">Channel In A Box</p>
            <h2 className="text-3xl font-black text-white mb-3 max-w-3xl">
              Don&apos;t have a YouTube channel yet? Start one today.
            </h2>
            <p className="text-slate-400 max-w-2xl">
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
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Step {i + 1}</p>
                    <p className="text-sm font-black text-white leading-tight">{step}</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-blue-300 mb-1.5">{tool}</p>
                <p className="text-slate-400 text-xs leading-relaxed">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-slate-800/60 border border-slate-700 border-l-4 border-l-blue-500">
            <p className="text-sm text-slate-300">
              Already have a channel? Skip to step 3 — the video, thumbnail and SEO tools work just
              as well on a channel you&apos;ve been running for years.
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start">
            <a href="/beta" className="inline-flex items-center gap-2 bg-white text-blue-900 text-sm font-semibold px-6 py-3 hover:bg-blue-50 transition-colors">
              Start My Channel Free <ArrowRight size={15} />
            </a>
            <a href="#pricing" className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 text-sm font-semibold px-6 py-3 hover:border-slate-500 hover:text-white transition-colors">
              See Plans <ChevronRight size={15} />
            </a>
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section id="compare" className="py-12 sm:py-14 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">How We Stack Up</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Where we win — and where we don&apos;t.</h2>
            <p className="text-slate-500">
              No camera. No tech skills. No manual editing. We&apos;re also honest about the three
              things other tools still do better — those are on our roadmap, not hidden from you.
            </p>
          </div>
          {/* overflow-x-auto, not hidden: the table is ~520px and would clip its
              last columns off the side of a phone with no way to reach them. */}
          <div className="border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-500 text-xs w-[40%]">Feature</th>
                  <th className="p-4 text-center font-bold text-blue-900 text-xs bg-blue-50">SparkReels.ai</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor A</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor B</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor C</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ feature, us, a, b, c }, idx) => (
                  <tr key={feature} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="p-3 pl-4 text-slate-700 font-medium text-xs">{feature}</td>
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
          <p className="text-xs text-slate-400 mt-3">Based on publicly available feature documentation. Last updated {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.</p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Two kinds of video. Pick the plan with the mix you need.</h2>
            <p className="text-slate-500">No contracts. Cancel anytime. Billed monthly.</p>
          </div>

          {/* Short vs long — the difference the plans are priced on */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
            <div className="bg-white border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                  <Zap size={15} className="text-primary-600" />
                </div>
                <p className="font-black text-slate-900">Short videos</p>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 ml-auto">Up to 4 min</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed mb-3">
                Reels, quick market updates, just-sold posts. Speak for a minute and the AI fills the
                screen with automatic b-roll — you don&apos;t supply anything.
              </p>
              <p className="text-xs text-slate-400">Best for staying visible week to week. On every plan.</p>
            </div>
            <div className="bg-white border border-purple-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                  <Film size={15} className="text-purple-600" />
                </div>
                <p className="font-black text-slate-900">Long videos</p>
                <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 ml-auto">Up to 8 min</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed mb-3">
                Full neighborhood tours, property walkthroughs, deep market breakdowns — the
                long-format videos that actually rank on YouTube search. Uses your own listing photos.
              </p>
              <p className="text-xs text-slate-400">Best for building a channel that gets found. On Agent and Pro.</p>
            </div>
          </div>

          <p className="text-sm text-slate-500 mb-6">
            Each plan gives you a set number of each, counted separately — using your long videos
            never eats into your short ones.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
            {pricingTiers.map(({ name, price, period, description, features: f, cta, highlighted, badge, href }) => (
              <div
                key={name}
                className={`bg-white border p-6 relative ${highlighted ? "border-blue-900 shadow-lg" : "border-slate-200"}`}
              >
                {badge && (
                  <div className="absolute -top-3 left-6 bg-blue-900 text-white text-xs font-bold px-3 py-1">
                    {badge}
                  </div>
                )}
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{name}</p>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-4xl font-black text-slate-900">{price}</span>
                  <span className="text-slate-400 text-sm">{period}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5 pb-5 border-b border-slate-100">{description}</p>
                <ul className="space-y-2.5 mb-6">
                  {f.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle size={13} className="text-blue-900 mt-0.5 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <a href={href} className={`block w-full py-2.5 text-center text-sm font-semibold transition-colors ${highlighted ? "bg-blue-900 text-white hover:bg-blue-800" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                  {cta}
                </a>
              </div>
            ))}
          </div>

          {/* Add-on credits — pay-as-you-go on any plan */}
          <div className="mt-8 bg-white border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-900 mb-1">Need more videos some months? Add them anytime.</p>
                <p className="text-xs text-slate-500">One-time purchases on any plan — no plan change needed, and your subscription is never interrupted.</p>
                <p className="text-xs text-slate-500 mt-1">Add-on videos you purchase never expire — unlike your monthly plan videos, they carry over until you use them. Because of that, add-on purchases are non-refundable.</p>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0 text-sm">
                <div className="border border-slate-200 px-4 py-2">
                  <span className="font-black text-slate-900">$15</span>
                  <span className="text-slate-500 text-xs"> · One short video, up to 4 minutes</span>
                </div>
                <div className="border border-slate-200 px-4 py-2">
                  <span className="font-black text-slate-900">$28</span>
                  <span className="text-slate-500 text-xs"> · Two short videos ($14 each)</span>
                </div>
                <div className="border border-blue-900 px-4 py-2 bg-blue-50">
                  <span className="font-black text-blue-900">$39</span>
                  <span className="text-slate-600 text-xs"> · One long video, up to 8 minutes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ── Final CTA ── */}
      <section className="py-14 sm:py-16 px-4 sm:px-6 bg-blue-900 text-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-4">Stop being invisible. Build Authority, Trust and Local Expert with SparkReels.ai</p>
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
            Hit the Mic. Speak, Spark, Share.
          </h2>
          <p className="text-blue-200 text-lg mb-3 max-w-xl leading-relaxed">
            The one-button video platform for real estate agents. No camera. No editing. Just Visibility.
          </p>
          <p className="text-blue-300 text-base mb-8 max-w-xl leading-relaxed">
            Visibility creates credibility.<br />
            Credibility creates trust.<br />
            Trust creates opportunities.<br />
            And opportunities create business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start mb-8">
            <a href="/beta" className="inline-flex items-center gap-2 bg-white text-blue-900 text-sm font-semibold px-6 py-3 hover:bg-blue-50 transition-colors">
              Claim Your Free Video <ArrowRight size={15} />
            </a>
            <a href="#pricing" className="inline-flex items-center gap-2 border border-blue-700 text-blue-200 text-sm font-semibold px-6 py-3 hover:border-blue-500 hover:text-white transition-colors">
              View Pricing <ChevronRight size={15} />
            </a>
          </div>
          <p className="text-blue-300 text-sm">First 100 agents · 1 free AI video · No credit card · Cancel anytime</p>
        </div>
      </section>

      {/* ── Fair Housing ── */}
      <section className="py-8 px-4 sm:px-6 bg-blue-50 border-y border-blue-100">
        <div className="max-w-5xl mx-auto flex items-start gap-4">
          <CheckCircle size={18} className="text-blue-900 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900 mb-0.5">Fair Housing Compliance Built In</p>
            <p className="text-sm text-blue-800 leading-relaxed">
              Every script, blog post, and video description is automatically reviewed by our Fair Housing guardrail — based on the Fair Housing Act (42 U.S.C. § 3604) and HUD advertising guidelines (24 CFR Part 109).
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 mb-8 pb-8 border-b border-slate-800">
            <div>
              <Image
                src="/logo_navbar_transparent.png"
                alt="SparkReels"
                width={160}
                height={48}
                unoptimized
              />
              <p className="text-sm mt-2 text-slate-400 max-w-xs">
                Stop being invisible and become the go-to expert in your market!
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-sm">
              <Link href="/beta"     className="hover:text-white transition-colors">Start Free</Link>
              <Link href="/login"    className="hover:text-white transition-colors">Log In</Link>
              <a href="#features"    className="hover:text-white transition-colors">Features</a>
              <a href="#channel"     className="hover:text-white transition-colors">Start a Channel</a>
              <a href="#pricing"     className="hover:text-white transition-colors">Pricing</a>
              <Link href="/affiliates/apply" className="hover:text-white transition-colors">Affiliates</Link>
              <Link href="/privacy"  className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms"    className="hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} SparkReels.ai. All rights reserved.</p>
            <p>All AI-generated content includes Fair Housing compliance guardrails per 42 U.S.C. § 3604.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
