import Image from "next/image";
import Link from "next/link";
import { DemoVideo } from "@/components/landing/demo-video";
import { Button } from "@/components/ui/button";
import {
  Mic, Video, Share2, CheckCircle, Star, ArrowRight, Zap,
  Clock, TrendingUp, MapPin, Home, CalendarDays, Globe,
  PlayCircle, X, Camera, Users, UserPlus, Trophy,
} from "lucide-react";

// ─── Segments ─────────────────────────────────────────────────────────────────
const segments = [
  {
    icon: Clock,
    color: "text-primary-500",
    bg: "bg-primary-50",
    segment: "Solo Agents",
    driver: "Time Scarcity",
    desire: "Stay top-of-mind without losing 15 hours a week to content production.",
  },
  {
    icon: Camera,
    color: "text-pink-500",
    bg: "bg-pink-50",
    segment: "Camera-Shy Agents",
    driver: "Performance Anxiety",
    desire: "Build a powerful personal brand without ever appearing on screen.",
  },
  {
    icon: Users,
    color: "text-orange-500",
    bg: "bg-orange-50",
    segment: "Team Leaders",
    driver: "Scalability",
    desire: "Ensure team-wide content consistency and brand compliance — at scale.",
  },
  {
    icon: UserPlus,
    color: "text-green-500",
    bg: "bg-green-50",
    segment: "New Agents",
    driver: "Brand Building",
    desire: "Establish local authority quickly and compete with seasoned agents from day one.",
  },
];

// ─── Features ─────────────────────────────────────────────────────────────────
const features = [
  {
    icon: Mic,
    color: "text-primary-500",
    bg: "bg-primary-50",
    title: "One-Button Video Creation",
    description: "Speak for 90 seconds about any market topic, listing, or local update. Our AI writes the script, builds the visuals, adds captions, and renders a broadcast-quality video — no filming, no editing, no technical skills needed.",
    badge: "Core Feature",
  },
  {
    icon: Camera,
    color: "text-pink-500",
    bg: "bg-pink-50",
    title: "No Camera. No Problem.",
    description: "Your AI avatar appears on screen in your place — speaking in your cloned voice. Build a compelling personal brand and stay top-of-mind without ever recording your face or worrying about how you look.",
    badge: "Camera-Free",
  },
  {
    icon: MapPin,
    color: "text-orange-500",
    bg: "bg-orange-50",
    title: "Hyperlocal Market Intelligence",
    description: "Dominate search in your city or neighborhood. Generate hyper-local market update videos that rank on YouTube and appear in Google AI Overviews — positioning you as the undisputed digital expert in your ZIP code.",
    badge: "SEO Domination",
  },
  {
    icon: Trophy,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    title: "\"Digital Mayor\" Status",
    description: "Consistently publishing hyper-local, expert content makes you the agent people think of first. Buyers and sellers Google local agents before they call — VoiceToVideos.AI makes sure you're what they find.",
    badge: "Top-of-Mind",
  },
  {
    icon: Globe,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "YouTube & Google AI Rankings",
    description: "Every video comes with an SEO-optimized title, description, tags, and a full blog post — built to rank on YouTube search and surface in Google AI Overviews for your target neighborhood keywords.",
    badge: "Rank #1",
  },
  {
    icon: CalendarDays,
    color: "text-teal-500",
    bg: "bg-teal-50",
    title: "Auto-Schedule to 10 Platforms",
    description: "One approval publishes to YouTube, Instagram, TikTok, LinkedIn, Facebook, Threads, and more — with platform-optimized captions and hashtags. Your content calendar runs on autopilot.",
    badge: "10 Platforms",
  },
  {
    icon: Home,
    color: "text-blue-500",
    bg: "bg-blue-50",
    title: "Listing Video Generator",
    description: "Paste a Zillow URL or speak the address. We import the details and auto-generate a branded property tour video with your AI avatar — ready to post before you leave the driveway.",
    badge: "Live Now",
  },
  {
    icon: TrendingUp,
    color: "text-purple-500",
    bg: "bg-purple-50",
    title: "Proven ROI — 49% Faster Growth",
    description: "Agents who post consistent video content grow revenue 49% faster than those who don't. VoiceToVideos.AI gives you the output of a full content team — without the cost, time, or technical headache.",
    badge: "49% Growth",
  },
];

// ─── Comparison table ──────────────────────────────────────────────────────────
const comparison = [
  { feature: "No filming or on-camera requirement",  us: true,  syllaby: false, rejig: false, roomvu: false },
  { feature: "AI Avatar + Voice Cloning",             us: true,  syllaby: true,  rejig: true,  roomvu: false },
  { feature: "Hyperlocal market intelligence",        us: true,  syllaby: false, rejig: true,  roomvu: true  },
  { feature: "YouTube + Google AI Overview SEO",      us: true,  syllaby: false, rejig: false, roomvu: false },
  { feature: "One-button — no tech skills needed",    us: true,  syllaby: false, rejig: false, roomvu: false },
  { feature: "Listing Auto-Video (URL → Video)",      us: true,  syllaby: false, rejig: true,  roomvu: true  },
  { feature: "10+ Platform Auto-Publishing",          us: true,  syllaby: true,  rejig: true,  roomvu: true  },
  { feature: "Team / brokerage multi-seat plans",     us: true,  syllaby: true,  rejig: true,  roomvu: true  },
  { feature: "Fair Housing Guardrails Built-in",      us: true,  syllaby: false, rejig: false, roomvu: false },
  { feature: "Purpose-built for Real Estate",         us: true,  syllaby: false, rejig: true,  roomvu: true  },
];

// ─── Steps ─────────────────────────────────────────────────────────────────────
const steps = [
  {
    step: "01",
    emoji: "🎤",
    title: "Hit Record. Say What You Know.",
    description: "Open the app, pick a topic — market update, listing, local trend — and talk for 60–90 seconds about your area. No script, no prep, no camera. Just your expertise.",
  },
  {
    step: "02",
    emoji: "🤖",
    title: "AI Builds Your Video Automatically.",
    description: "Our AI writes a Fair Housing-compliant script, generates your AI avatar speaking in your cloned voice, adds b-roll and captions, and produces a broadcast-quality video. Zero editing required.",
  },
  {
    step: "03",
    emoji: "📲",
    title: "Publish. Rank. Stay Top-of-Mind.",
    description: "One click posts to YouTube, Instagram, TikTok, LinkedIn, and 6 more platforms — with SEO-optimized metadata designed to rank in your ZIP code and appear in Google AI Overviews.",
  },
];

// ─── Pricing ───────────────────────────────────────────────────────────────────
const pricingTiers = [
  {
    name: "Starter",
    price: "$27",
    period: "/month",
    description: "Get in the game",
    badge: null,
    features: [
      "4 videos/month",
      "Voice recording + AI script",
      "Blog & landscape formats",
      "Content templates",
      "Trending topic discovery",
      "1 social platform",
    ],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=starter",
  },
  {
    name: "Agent",
    price: "$47",
    period: "/month",
    description: "Build your local brand",
    badge: null,
    features: [
      "12 videos/month",
      "All video formats (16:9, 9:16, 1:1)",
      "AI avatar + voice clone",
      "AI script + SEO optimization",
      "MLS listing auto-video",
      "Content templates (24 topics)",
      "3 social platforms",
    ],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Pro",
    price: "$97",
    period: "/month",
    description: "Dominate your ZIP code",
    badge: "Most Popular",
    features: [
      "30 videos/month",
      "Everything in Agent",
      "All 10 social platforms",
      "Hyperlocal SEO + Google AI Rankings",
      "Content calendar + scheduling",
      "CRM webhooks (GoHighLevel, HubSpot)",
      "Priority rendering",
    ],
    cta: "Get Started",
    highlighted: true,
    href: "/api/stripe/checkout?plan=pro",
  },
  {
    name: "Agency",
    price: "$197",
    period: "/month",
    description: "For teams and brokerages",
    badge: null,
    features: [
      "100 videos/month",
      "Everything in Pro",
      "Up to 5 agent seats",
      "White-label branding",
      "Custom AI avatar per agent",
      "Team analytics dashboard",
      "API access",
    ],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=agency",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Image
              src="https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif"
              alt="VoiceToVideos.AI"
              width={160}
              height={48}
              unoptimized
              priority
            />
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#who"         className="hover:text-primary-500 transition-colors">Who It&apos;s For</a>
            <a href="#how-it-works" className="hover:text-primary-500 transition-colors">How It Works</a>
            <a href="#features"    className="hover:text-primary-500 transition-colors">Features</a>
            <a href="#pricing"     className="hover:text-primary-500 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="gap-1.5">
                <Zap size={13} /> Start Free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-28 pb-16 px-4 sm:px-6 bg-gradient-to-b from-slate-900 via-primary-950/90 to-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.3),transparent)] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">

          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/80 text-xs font-bold px-4 py-2 rounded-full mb-8 backdrop-blur-sm">
            <Mic size={12} className="text-primary-400" /> The One-Button Video Platform for Real Estate Agents
          </div>

          {/* H1 */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight mb-5">
            Grow Revenue{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">
              49% Faster
            </span>{" "}
            Without Ever Going on Camera.
          </h1>

          {/* Sub */}
          <p className="text-xl sm:text-2xl text-slate-200 font-semibold mb-5">
            Busy, stretched-thin agents achieve dominant top-of-mind presence<br className="hidden sm:block" /> — without the technical headache or the pressure of being on camera.
          </p>

          {/* Body */}
          <p className="text-base sm:text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            VoiceToVideos.AI turns a simple 90-second voice recording into a professional video,
            SEO blog, and social posts published to 10 platforms — automatically.
            No filming. No editing. No technical skills required.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2 w-full sm:w-auto text-base px-8 bg-primary-500 hover:bg-primary-600">
                <Mic size={18} /> Start Creating Free
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto text-base border-white/30 text-white hover:bg-white/10">
                See How It Works <ArrowRight size={16} />
              </Button>
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> 5 free videos included</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> No camera needed</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> Fair Housing compliant AI</span>
          </div>

          {/* Demo video */}
          <DemoVideo />
        </div>

        {/* Stats strip */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
          {[
            { stat: "49%",    label: "Faster revenue growth",  icon: TrendingUp },
            { stat: "< 2 min", label: "Voice to finished video", icon: Clock },
            { stat: "10",     label: "Platforms at once",       icon: Share2 },
            { stat: "0",      label: "Filming or editing",      icon: Video },
          ].map(({ stat, label, icon: Icon }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center backdrop-blur-sm">
              <Icon size={18} className="text-primary-400 mx-auto mb-1.5" />
              <p className="text-2xl font-black text-white">{stat}</p>
              <p className="text-slate-400 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonial Story ── */}
      <section className="py-16 px-4 sm:px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-1 justify-center mb-5">
            {[1,2,3,4,5].map(i => <Star key={i} size={18} className="text-yellow-400 fill-yellow-400" />)}
          </div>
          <blockquote className="text-center text-lg sm:text-xl text-slate-700 leading-relaxed italic mb-6">
            &ldquo;I used to feel that sinking pit in my stomach every Sunday night, knowing I&apos;d wasted another
            week buried in technical headaches and awkward retakes while my community slowly forgot I was
            the local expert they needed. That changed when I stopped trying to be a film editor and started
            leaning into my actual expertise — simply narrating updates on neighborhood inventory and school
            trends directly into a one-button AI system that builds the visuals and captions for me. Now
            I&apos;m finally that steady, professional presence my sphere trusts because I&apos;ve traded the
            exhausting grind of video production for a digital megaphone that keeps me top-of-mind while
            I&apos;m out actually showing homes and closing deals.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
              JR
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-brand-text">James Rodriguez</p>
              <p className="text-xs text-slate-400">Broker · Miami, FL · Closed 2 deals from Instagram</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section id="who" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">Who It&apos;s For</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text leading-tight mb-4">
              Two-thirds of agents know video grows their business.<br className="hidden sm:block" />
              <span className="text-primary-500">Most just don&apos;t have a system to do it.</span>
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              VoiceToVideos.AI was built for the agents who are already successful — and want to
              future-proof their business and achieve &ldquo;digital mayor&rdquo; status in their local area.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {segments.map(({ icon: Icon, color, bg, segment, driver, desire }) => (
              <div key={segment} className="flex gap-4 p-5 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md hover:border-primary-200 transition-all">
                <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                  <Icon size={20} className={color} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-brand-text text-sm">{segment}</p>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{driver}</span>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">{desire}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-5 bg-primary-50 border border-primary-100 rounded-2xl text-center">
            <p className="text-sm font-semibold text-primary-800">
              Agents who post consistent video content grow revenue{" "}
              <span className="text-primary-600 font-black">49% faster</span>{" "}
              than those who don&apos;t — yet two-thirds of the market still isn&apos;t doing it consistently.
              VoiceToVideos.AI removes every barrier that&apos;s stopping them.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text mb-3">
              No technical skill. No camera. No editing.
            </h2>
            <p className="text-slate-500 text-lg">Just your voice — and your local expertise.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-[calc(33.33%+1rem)] right-[calc(33.33%+1rem)] h-px bg-gradient-to-r from-primary-200 to-primary-200 via-primary-400" />
            {steps.map(({ step, emoji, title, description }) => (
              <div key={step} className="relative text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-500 text-white text-sm font-black flex items-center justify-center shadow-md">
                    {step}
                  </div>
                  <span className="text-2xl">{emoji}</span>
                </div>
                <h3 className="text-lg font-bold text-brand-text mb-2 leading-snug">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">Everything Included</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text mb-3">
              Built to make you the digital expert<br className="hidden sm:block" /> in your market.
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Hyperlocal intelligence. SEO domination. Zero camera required.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ icon: Icon, color, bg, title, description, badge }) => (
              <div key={title} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary-200 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                    <Icon size={18} className={color} />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    badge === "Core Feature"    ? "bg-primary-100 text-primary-700" :
                    badge === "Camera-Free"     ? "bg-pink-100 text-pink-700" :
                    badge === "SEO Domination"  ? "bg-orange-100 text-orange-700" :
                    badge === "49% Growth"      ? "bg-purple-100 text-purple-700" :
                    badge === "Rank #1"         ? "bg-green-100 text-green-700" :
                    badge === "Top-of-Mind"     ? "bg-yellow-100 text-yellow-700" :
                    badge === "Live Now"        ? "bg-green-100 text-green-700" :
                                                 "bg-teal-100 text-teal-700"
                  }`}>
                    {badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-brand-text mb-1.5 leading-snug">{title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Competitor Comparison ── */}
      <section id="compare" className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">How We Stack Up</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text mb-3">
              The only platform that removes every barrier.
            </h2>
            <p className="text-slate-500">No camera. No tech skills. No manual editing. No excuses.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left p-4 font-semibold text-slate-500 text-xs w-[40%]">Feature</th>
                  <th className="p-4 text-center font-black text-primary-600 text-xs">VoiceToVideos.AI</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor A</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor B</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor C</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ feature, us, syllaby, rejig, roomvu }, idx) => (
                  <tr key={feature} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="p-3 pl-4 text-brand-text font-medium text-xs">{feature}</td>
                    {[us, syllaby, rejig, roomvu].map((val, i) => (
                      <td key={i} className="p-3 text-center">
                        {val
                          ? <CheckCircle size={16} className={`mx-auto ${i === 0 ? "text-primary-500" : "text-green-500"}`} />
                          : <X size={16} className="mx-auto text-slate-200" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">Based on publicly available feature documentation. Last updated {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.</p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text mb-3">
              Less than one lost commission covers a year.
            </h2>
            <p className="text-slate-500 text-lg">No contracts. Cancel anytime. Billed monthly.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
            {pricingTiers.map(({ name, price, period, description, features: f, cta, highlighted, badge, href }) => (
              <div
                key={name}
                className={`rounded-2xl p-6 border relative ${
                  highlighted
                    ? "border-primary-500 shadow-xl bg-white ring-2 ring-primary-500/20"
                    : "border-slate-200 bg-white shadow-sm"
                }`}
              >
                {badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary-500 to-secondary-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md whitespace-nowrap">
                    {badge}
                  </div>
                )}
                <p className="text-sm font-bold text-slate-500 mb-1">{name}</p>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-4xl font-black text-brand-text">{price}</span>
                  <span className="text-slate-400 text-sm">{period}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5 pb-5 border-b border-slate-100">{description}</p>
                <ul className="space-y-2.5 mb-6">
                  {f.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle size={14} className="text-accent-500 mt-0.5 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <a href={href}>
                  <Button
                    variant={highlighted ? "primary" : "outline"}
                    className={`w-full ${highlighted ? "shadow-md" : ""}`}
                  >
                    {cta}
                  </Button>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fair Housing note ── */}
      <section className="py-8 px-4 sm:px-6 bg-blue-50 border-y border-blue-100">
        <div className="max-w-4xl mx-auto flex items-start gap-4">
          <CheckCircle size={20} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800 mb-0.5">Fair Housing Compliance Built In</p>
            <p className="text-sm text-blue-700 leading-relaxed">
              Every script, blog post, and video description is automatically reviewed by our Fair Housing
              guardrail — based on the Fair Housing Act (42 U.S.C. § 3604) and HUD advertising guidelines
              (24 CFR Part 109). Non-compliant language is silently rewritten before it reaches you.
              You&apos;re always protected.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-slate-900 via-primary-950 to-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(99,102,241,0.25),transparent)] pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-4">Stop waiting. Start dominating.</p>
          <h2 className="text-3xl sm:text-4xl font-black mb-4">
            Become the &ldquo;digital mayor&rdquo;<br className="hidden sm:block" /> of your ZIP code.
          </h2>
          <p className="text-slate-300 text-lg mb-10 max-w-xl mx-auto">
            The two-thirds of agents who know video works but aren&apos;t doing it consistently —
            this is your system. No camera. No editing. No excuses.
          </p>
          <Link href="/register">
            <Button className="bg-white text-primary-700 hover:bg-primary-50 text-base px-12 py-4 gap-2 font-bold shadow-xl" size="lg">
              <PlayCircle size={18} /> Start Free — 5 Videos on Us
            </Button>
          </Link>
          <p className="text-slate-500 text-sm mt-5">No credit card · No camera needed · Fair Housing compliant</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-950 text-slate-400 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 mb-8">
            <div>
              <Image
                src="https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif"
                alt="VoiceToVideos.AI"
                width={140}
                height={42}
                unoptimized
              />
              <p className="text-xs mt-3 text-slate-500 max-w-xs leading-relaxed">
                The one-button video platform for real estate agents. No camera. No editing. Just results.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-sm">
              <Link href="/register"  className="hover:text-white transition-colors">Get Started</Link>
              <Link href="/login"     className="hover:text-white transition-colors">Log In</Link>
              <a href="#features"     className="hover:text-white transition-colors">Features</a>
              <a href="#pricing"      className="hover:text-white transition-colors">Pricing</a>
              <Link href="/privacy"   className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms"     className="hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} VoiceToVideos.AI. All rights reserved.</p>
            <p>All AI-generated content includes Fair Housing compliance guardrails per 42 U.S.C. § 3604.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
