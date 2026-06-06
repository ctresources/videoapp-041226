import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, Star, ArrowRight,
  Clock,
  X, Camera, Users, UserPlus, ChevronRight,
} from "lucide-react";

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
    description: "Paste a Zillow URL or speak the address. We import the details and auto-generate a branded property tour video with your AI avatar — ready to post in minutes.",
    photo: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "49% Faster Revenue Growth",
    description: "Agents who post consistent video content grow revenue 49% faster. XpressReel.com gives you the output of a full content team without the cost or headache.",
    photo: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
  },
];

const comparison = [
  { feature: "Unlimited camera recordings (no monthly cap)", us: true, a: false, b: false, c: false },
  { feature: "Built-in teleprompter + camera recorder", us: true, a: false, b: false, c: false },
  { feature: "No filming or on-camera requirement",  us: true,  a: false, b: false, c: false },
  { feature: "AI Avatar + Voice Cloning",             us: true,  a: true,  b: true,  c: false },
  { feature: "Hyperlocal market intelligence",        us: true,  a: false, b: true,  c: true  },
  { feature: "YouTube SEO optimized metadata",        us: true,  a: false, b: false, c: false },
  { feature: "One-button — no tech skills needed",    us: true,  a: false, b: false, c: false },
  { feature: "Listing Auto-Video (URL → Video)",      us: true,  a: false, b: true,  c: true  },
  { feature: "AI-generated social captions (LinkedIn, Instagram, email)", us: true, a: false, b: false, c: false },
  { feature: "Fair Housing Guardrails Built-in",      us: true,  a: false, b: false, c: false },
  { feature: "Purpose-built for Real Estate",         us: true,  a: false, b: true,  c: true  },
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
    features: ["4 AI videos/month", "Unlimited camera recordings (up to 30 mins each)", "Built-in teleprompter", "Up to 2 min per AI video/reel", "Voice recording + AI script", "YouTube (16:9) & Reel (9:16) formats", "1 social platform (YouTube)", "Other platforms coming soon"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=starter",
  },
  {
    name: "Agent",
    price: "$89",
    period: "/month",
    description: "Build your local brand",
    badge: "Most Popular",
    features: ["8 AI videos/month", "Unlimited camera recordings (up to 30 mins each)", "Built-in teleprompter", "Up to 2 min per AI video/reel", "Voice recording + AI script", "YouTube (16:9) & Reel (9:16) formats", "MLS listing auto-video", "1 social platform (YouTube)", "Other platforms coming soon"],
    cta: "Get Started",
    highlighted: true,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Pro",
    price: "$119",
    period: "/month",
    description: "Dominate your market",
    badge: null,
    features: ["12 AI videos/month", "Unlimited camera recordings (up to 30 mins each)", "Built-in teleprompter", "Up to 2 min per AI video/reel", "Voice recording + AI script", "YouTube (16:9) & Reel (9:16) formats", "MLS listing auto-video", "Priority rendering", "1 social platform (YouTube)", "Other platforms coming soon"],
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
              src="https://fifryrqhrfnzbwpvvvkz.supabase.co/storage/v1/object/public/assets/xpressreel-logo_with_new_tagline.svg"
              alt="XpressReel"
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
            <a href="#pricing"      className="hover:text-slate-900 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-3 py-2">
              Log In
            </Link>
            <Link href="/register" className="text-sm font-semibold bg-blue-900 text-white px-5 py-2.5 hover:bg-blue-800 transition-colors flex items-center gap-1.5">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-16 pb-20 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto">

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="font-black text-blue-900 mb-3 tracking-wide">
                <span className="text-4xl">Speak, Spark, Share —</span><br />
                <span className="text-xl whitespace-nowrap">no filming, no editing, no glam required.</span>
              </p>
              <p className="text-base text-slate-500 mb-4 leading-relaxed">
                Most real estate agents are invisible online. XpressReel.com fixes that — turning your voice recording into a publish-ready short-form video.
              </p>
              <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-5">
                Real Estate Agents who post video grow revenue 49% faster.<br />Yet ONLY 8% do it consistently. Why?
              </p>
              <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6 text-slate-900">
                <span className="block">Hit the Mic....Be Visible</span>
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
        <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">
          Video types agents are creating right now
        </p>
        <div className="max-w-6xl mx-auto overflow-hidden">

        {/* Row 1 — scrolls left */}
        <div className="marquee-track mb-4 relative">
          <div className="flex gap-4 animate-marquee whitespace-nowrap">
            {[
              { label: "Market Update",       img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80" },
              { label: "Listing Video",        img: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=400&q=80" },
              { label: "Neighborhood Tour",    img: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=80" },
              { label: "Just Sold",            img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80" },
              { label: "Buyer Tips",           img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80" },
              { label: "Interest Rate Update", img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80" },
              { label: "Open House Recap",     img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=400&q=80" },
              { label: "Local Market Stats",   img: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=400&q=80" },
              // duplicated for seamless loop
              { label: "Market Update",       img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80" },
              { label: "Listing Video",        img: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=400&q=80" },
              { label: "Neighborhood Tour",    img: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=80" },
              { label: "Just Sold",            img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80" },
              { label: "Buyer Tips",           img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80" },
              { label: "Interest Rate Update", img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80" },
              { label: "Open House Recap",     img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=400&q=80" },
              { label: "Local Market Stats",   img: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=400&q=80" },
            ].map(({ label, img }, i) => (
              <div key={i} className="inline-flex flex-col rounded-xl overflow-hidden border border-slate-700 shrink-0 w-52">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={label} className="w-full h-32 object-cover" />
                <div className="bg-slate-800 px-3 py-2.5">
                  <p className="text-xs font-semibold text-white truncate">{label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">AI-generated · 60 sec</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — scrolls right */}
        <div className="marquee-track relative">
          <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap">
            {[
              { label: "Seller Tips",          img: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=400&q=80" },
              { label: "Price Reduction",      img: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=400&q=80" },
              { label: "New Construction",     img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=400&q=80" },
              { label: "Investment Property",  img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80" },
              { label: "Luxury Listing",       img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80" },
              { label: "School District Tour", img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80" },
              { label: "Coming Soon",          img: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=400&q=80" },
              { label: "Condo Showcase",       img: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=400&q=80" },
              // duplicated
              { label: "Seller Tips",          img: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=400&q=80" },
              { label: "Price Reduction",      img: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=400&q=80" },
              { label: "New Construction",     img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=400&q=80" },
              { label: "Investment Property",  img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80" },
              { label: "Luxury Listing",       img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80" },
              { label: "School District Tour", img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80" },
              { label: "Coming Soon",          img: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=400&q=80" },
              { label: "Condo Showcase",       img: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=400&q=80" },
            ].map(({ label, img }, i) => (
              <div key={i} className="inline-flex flex-col rounded-xl overflow-hidden border border-slate-700 shrink-0 w-52">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={label} className="w-full h-32 object-cover" />
                <div className="bg-slate-800 px-3 py-2.5">
                  <p className="text-xs font-semibold text-white truncate">{label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">AI-generated · 60 sec</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section id="who" className="py-20 px-4 sm:px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
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
                <img src={photo} alt={segment} className="w-full h-44 object-cover" />
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
              — yet two-thirds of the market still isn&apos;t doing it consistently. XpressReel.com removes every barrier that&apos;s stopping them.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">From Speak Or Topic, To AI Script And Video Generated In 5–8 Minutes.</h2>
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
                description: "Hit the mic — or type a topic. AI hands you trending local ideas before you start. 60–90 seconds is all you need.",
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
                  <img src={photo} alt={alt} className="w-full h-44 object-cover rounded-2xl" />
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
            <p className="text-sm text-slate-400">Script generated instantly. Video ready in less than 10 minutes — <span className="font-semibold text-blue-900">while you&apos;re creating another video or out to see a client.</span></p>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Everything Included</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Built to make you the digital expert in your market.</h2>
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

      {/* ── Comparison ── */}
      <section id="compare" className="py-20 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">How We Stack Up</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">The only platform that removes every barrier.</h2>
            <p className="text-slate-500">No camera. No tech skills. No manual editing. No excuses.</p>
          </div>
          <div className="border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-500 text-xs w-[40%]">Feature</th>
                  <th className="p-4 text-center font-bold text-blue-900 text-xs bg-blue-50">XpressReel.com</th>
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
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Less than one lost commission covers a year.</h2>
            <p className="text-slate-500">No contracts. Cancel anytime. Billed monthly.</p>
          </div>
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
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className="py-14 px-4 sm:px-6 bg-blue-900 text-white">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-1 mb-6">
            {[1,2,3,4,5].map(i => <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />)}
          </div>
          <blockquote className="text-lg sm:text-xl leading-relaxed text-blue-100 mb-8">
            &ldquo;I used to feel that sinking pit in my stomach every Sunday night, knowing I&apos;d wasted another week buried in technical headaches and awkward retakes while my community slowly forgot I was the local expert they needed. That changed when I stopped trying to be a film editor and started leaning into my actual expertise — simply narrating updates on neighborhood inventory and school trends directly into a one-button AI system that builds the visuals and captions for me. Now I&apos;m finally that steady, professional presence my sphere trusts because I&apos;ve traded the exhausting grind of video production for a digital megaphone that keeps me top-of-mind while I&apos;m out actually showing homes and closing deals.&rdquo;
          </blockquote>
          <div className="flex items-center gap-3 border-t border-blue-800 pt-6">
            <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center text-sm font-bold">CT</div>
            <div>
              <p className="text-sm font-semibold text-white">C. Thompson</p>
              <p className="text-xs text-blue-300">Real Estate Broker</p>
            </div>
          </div>
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

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 bg-blue-900 text-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-4">Stop being invisible. Build Authority, Trust and Local Expert with xpressreel.com</p>
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight whitespace-nowrap">
            Hit the Mic. Speak, Spark, Share.
          </h2>
          <p className="text-blue-200 text-lg mb-8 max-w-xl leading-relaxed">
            Your voice. Your expertise. Your market. XpressReel.com turns 90 seconds of talking into a week of content — no camera, no editing, no glam required.
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

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 mb-8 pb-8 border-b border-slate-800">
            <div>
              <Image
                src="https://fifryrqhrfnzbwpvvvkz.supabase.co/storage/v1/object/public/assets/xpressreel-logo_with_new_tagline.svg"
                alt="XpressReel"
                width={160}
                height={48}
                unoptimized
              />
              <p className="text-xs mt-2 text-slate-500 max-w-xs leading-relaxed">
                The one-button video platform for real estate agents. No camera. No editing. Just results.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-sm">
              <Link href="/register" className="hover:text-white transition-colors">Get Started</Link>
              <Link href="/login"    className="hover:text-white transition-colors">Log In</Link>
              <a href="#features"    className="hover:text-white transition-colors">Features</a>
              <a href="#pricing"     className="hover:text-white transition-colors">Pricing</a>
              <Link href="/privacy"  className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms"    className="hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} XpressReel.com. All rights reserved.</p>
            <p>All AI-generated content includes Fair Housing compliance guardrails per 42 U.S.C. § 3604.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
