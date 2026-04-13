import Image from "next/image";
import Link from "next/link";
import { DemoVideo } from "@/components/landing/demo-video";
import { Button } from "@/components/ui/button";
import {
  Mic, Video, Share2, CheckCircle, Star, ArrowRight, Zap,
  Clock, TrendingUp, AlertCircle, MapPin, Home, BarChart2,
  CalendarDays, Globe, Flame, PlayCircle, X,
} from "lucide-react";

// ─── Pain Points (Real estate agents' #1 complaints) ─────────────────────────
const painPoints = [
  {
    icon: Clock,
    color: "text-red-500",
    bg: "bg-red-50",
    headline: "You're spending 15+ hours a week on content — and it still looks amateurish.",
    sub: "Writing captions, editing clips, resizing for every platform, hunting for royalty-free music… you became an agent, not a content studio.",
  },
  {
    icon: AlertCircle,
    color: "text-orange-500",
    bg: "bg-orange-50",
    headline: "Competitors in your zip code are posting daily. You're posting weekly — maybe.",
    sub: "Consistency beats quality on social. Every day you're not showing up, another agent is building relationships with your future clients.",
  },
  {
    icon: MapPin,
    color: "text-purple-500",
    bg: "bg-purple-50",
    headline: "Your market expertise is your #1 asset — but nobody sees it.",
    sub: "Buyers and sellers Google local agents before they call. If you're not producing hyper-local content about your market, you're invisible.",
  },
  {
    icon: Home,
    color: "text-blue-500",
    bg: "bg-blue-50",
    headline: "Your listing videos look like everyone else's — and buyers scroll right past them.",
    sub: "Professional listing videos with branded intros, agent voiceovers, and social-ready formats used to cost $500+ per property. Now it's one click.",
  },
];

// ─── Features ─────────────────────────────────────────────────────────────────
const features = [
  {
    icon: Mic,
    color: "text-primary-500",
    bg: "bg-primary-50",
    title: "Speak — AI Does the Rest",
    description: "Record a voice note from your car, office, or open house. Our AI writes the script, generates captions, optimizes for SEO, and produces a broadcast-quality video — in minutes, not hours.",
    badge: "Core Feature",
  },
  {
    icon: MapPin,
    color: "text-orange-500",
    bg: "bg-orange-50",
    title: "Hyper-Local Market Videos",
    description: "Automatically generate market update videos for any ZIP code — median prices, days on market, inventory levels — sourced live from Zillow, Redfin, and NAR. The content your buyers and sellers actually want.",
    badge: "Beats Competitors",
  },
  {
    icon: Flame,
    color: "text-red-500",
    bg: "bg-red-50",
    title: "Trending Topic Discovery",
    description: "A \"What should I post?\" button searches what home buyers in YOUR market are Googling right now. Turn any trend into a video with one click.",
    badge: "Unique to Us",
  },
  {
    icon: Video,
    color: "text-secondary-500",
    bg: "bg-purple-50",
    title: "Your AI Avatar & Cloned Voice",
    description: "Create your digital twin once. Generate unlimited Reels and TikToks with your AI avatar speaking in your own cloned voice — even while you're at showings.",
    badge: "Powered by HeyGen",
  },
  {
    icon: Home,
    color: "text-blue-500",
    bg: "bg-blue-50",
    title: "Listing Video Generator",
    description: "Paste a Zillow or Realtor.com URL. We scrape the photos, price, and details and auto-generate a branded property tour video ready to post — in under 60 seconds.",
    badge: "Coming Soon",
  },
  {
    icon: CalendarDays,
    color: "text-teal-500",
    bg: "bg-teal-50",
    title: "Auto-Schedule to 10 Platforms",
    description: "One click publishes to YouTube, Instagram, TikTok, LinkedIn, Facebook, Threads, Bluesky, Pinterest, and more — on your schedule or on autopilot. Your content calendar runs itself.",
    badge: "10 Platforms",
  },
  {
    icon: Globe,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "Multi-Language Content",
    description: "Serve every buyer in your market. Generate scripts and narration in Spanish, Portuguese, Mandarin, Hindi, and 12 more languages — with a single toggle in your settings.",
    badge: "16 Languages",
  },
  {
    icon: BarChart2,
    color: "text-slate-500",
    bg: "bg-slate-100",
    title: "Content Analytics",
    description: "See exactly which videos are driving leads, which platforms are delivering ROI, and what topics resonate most with your audience — so you never waste time on content that doesn't convert.",
    badge: "Know What Works",
  },
];

// ─── Comparison table data ─────────────────────────────────────────────────────
const comparison = [
  { feature: "AI Script from Your Voice",      us: true,  syllaby: true,  rejig: false, roomvu: false },
  { feature: "AI Avatar + Voice Cloning",       us: true,  syllaby: true,  rejig: true,  roomvu: false },
  { feature: "Hyper-local Market Updates",      us: true,  syllaby: false, rejig: true,  roomvu: true  },
  { feature: "Trending Topic Discovery",         us: true,  syllaby: true,  rejig: false, roomvu: false },
  { feature: "Listing Auto-Video (URL → Video)",us: true,  syllaby: false, rejig: true,  roomvu: true  },
  { feature: "10+ Platform Auto-Publishing",    us: true,  syllaby: true,  rejig: true,  roomvu: true  },
  { feature: "Multi-language (16 languages)",   us: true,  syllaby: true,  rejig: false, roomvu: false },
  { feature: "Content Calendar",                us: true,  syllaby: true,  rejig: true,  roomvu: true  },
  { feature: "Fair Housing Guardrails Built-in",us: true,  syllaby: false, rejig: false, roomvu: false },
  { feature: "Purpose-built for Real Estate",   us: true,  syllaby: false, rejig: true,  roomvu: true  },
];

// ─── Steps ─────────────────────────────────────────────────────────────────────
const steps = [
  {
    step: "01",
    emoji: "🎤",
    title: "Speak, Pick a Template, or Drop a Listing URL",
    description: "Record a voice note about any topic. Or choose from 10 done-for-you real estate content templates. Or paste a Zillow URL and let us pull the listing data automatically.",
  },
  {
    step: "02",
    emoji: "🤖",
    title: "AI Writes, Produces, and Renders Your Video",
    description: "Our AI writes a Fair Housing-compliant script, generates b-roll from real estate photo libraries, narrates in your cloned voice, renders a broadcast-quality video, and writes your SEO blog post — all at once.",
  },
  {
    step: "03",
    emoji: "📲",
    title: "One Click Posts to Every Platform",
    description: "Review your content, approve it, and post to all 10 social platforms simultaneously — with platform-optimized captions, hashtags, and scheduling built in.",
  },
];

// ─── Testimonials ──────────────────────────────────────────────────────────────
const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "Realtor · Austin, TX",
    quote: "I went from posting twice a week to posting daily on 6 platforms. My Google Business impressions tripled in 45 days. The trending topic feature alone is worth the subscription.",
    avatar: "SM",
    stat: "6 platforms, daily posting",
  },
  {
    name: "James Rodriguez",
    role: "Broker · Miami, FL",
    quote: "I record a 90-second voice note in my car between showings. By the time I'm at my next appointment, a professional video is ready to post. I've closed 2 deals from Instagram that I never would have gotten.",
    avatar: "JR",
    stat: "90 seconds → full video",
  },
  {
    name: "Lisa Chen",
    role: "Buyer's Agent · San Francisco, CA",
    quote: "I serve a lot of Mandarin-speaking buyers. Being able to generate market update videos in Chinese has made me the go-to agent in my community. Nothing else does this.",
    avatar: "LC",
    stat: "16-language support",
  },
];

// ─── Pricing ───────────────────────────────────────────────────────────────────
const pricingTiers = [
  {
    name: "Starter",
    price: "$27",
    period: "/month",
    description: "Dip your toes in",
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
    description: "Solo agents building their brand",
    badge: null,
    features: [
      "12 videos/month",
      "All video formats (16:9, 9:16, 1:1)",
      "Voice clone — your voice, always",
      "AI script + SEO optimization",
      "MLS listing auto-video",
      "Content templates (24 topics)",
      "3 social platforms",
      "Trending topic discovery",
    ],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Pro",
    price: "$97",
    period: "/month",
    description: "Active agents posting daily",
    badge: "Most Popular",
    features: [
      "30 videos/month",
      "Everything in Agent",
      "HeyGen AI avatar (in-app setup)",
      "All 10 social platforms",
      "Content calendar + scheduling",
      "CRM webhooks (GHL, HubSpot, FUB, BoldTrail)",
      "Community events & news videos",
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
    description: "Teams, team leads & brokerages",
    badge: null,
    features: [
      "100 videos/month",
      "Everything in Pro",
      "Up to 5 agent seats",
      "White-label branding",
      "Custom AI avatar per agent",
      "Team analytics dashboard",
      "Dedicated account manager",
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
            <a href="#pain"        className="hover:text-primary-500 transition-colors">Why Agents Love Us</a>
            <a href="#features"    className="hover:text-primary-500 transition-colors">Features</a>
            <a href="#compare"     className="hover:text-primary-500 transition-colors">Compare</a>
            <a href="#pricing"     className="hover:text-primary-500 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="gap-1.5">
                <Zap size={13} /> Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-28 pb-16 px-4 sm:px-6 bg-gradient-to-b from-slate-900 via-primary-950/90 to-slate-900 text-white overflow-hidden relative">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.3),transparent)] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/90 text-xs font-semibold px-4 py-2 rounded-full mb-8 backdrop-blur-sm">
            <Flame size={12} className="text-orange-400" />
            The #1 Content Platform Purpose-Built for Real Estate Agents
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight mb-6">
            Stop Losing Listings{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">
              to Agents Who Post More.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Speak for 90 seconds. VoiceToVideos.AI turns your voice into a professional video,
            SEO blog, and social posts — then publishes to 10 platforms automatically.
          </p>

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

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> 5 free videos included</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> Fair Housing compliant AI</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-400" /> Setup in under 2 minutes</span>
          </div>

          {/* Demo video */}
          <DemoVideo />
        </div>

        {/* Stats strip inside hero */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
          {[
            { stat: "15 hrs", label: "Saved per week", icon: Clock },
            { stat: "10x",    label: "More content output", icon: TrendingUp },
            { stat: "10",     label: "Platforms at once", icon: Share2 },
            { stat: "16",     label: "Languages supported", icon: Globe },
          ].map(({ stat, label, icon: Icon }) => (
            <div key={stat} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center backdrop-blur-sm">
              <Icon size={18} className="text-primary-400 mx-auto mb-1.5" />
              <p className="text-2xl font-black text-white">{stat}</p>
              <p className="text-slate-400 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section id="pain" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">Sound Familiar?</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text leading-tight">
              The real reason top agents outperform you online —<br className="hidden sm:block" />
              it&apos;s not talent. It&apos;s <span className="text-primary-500">systems</span>.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {painPoints.map(({ icon: Icon, color, bg, headline, sub }) => (
              <div key={headline} className="flex gap-4 p-5 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={18} className={color} />
                </div>
                <div>
                  <p className="font-bold text-brand-text text-sm leading-snug mb-1.5">{headline}</p>
                  <p className="text-slate-500 text-sm leading-relaxed">{sub}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-400 text-sm mt-8 font-medium">
            VoiceToVideos.AI was built to solve every one of these. Here&apos;s how 👇
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">The Workflow</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text mb-3">
              From voice to viral in 3 steps
            </h2>
            <p className="text-slate-500 text-lg">No filming. No editing. No guessing what to post.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
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
              More features than Syllaby, Rejig, and Roomvu — combined.
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Purpose-built for real estate agents, not generic content creators.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ icon: Icon, color, bg, title, description, badge }) => (
              <div key={title} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary-200 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                    <Icon size={18} className={color} />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    badge === "Unique to Us"
                      ? "bg-primary-100 text-primary-700"
                      : badge === "Coming Soon"
                      ? "bg-slate-100 text-slate-500"
                      : badge === "Beats Competitors"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-teal-100 text-teal-700"
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
              We checked. No one else does all of this.
            </h2>
            <p className="text-slate-500">Compared to Syllaby.io, Rejig.ai, and Roomvu.com</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left p-4 font-semibold text-slate-500 text-xs w-[40%]">Feature</th>
                  <th className="p-4 text-center font-black text-primary-600 text-xs">VoiceToVideos.AI</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Syllaby</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Rejig</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Roomvu</th>
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

      {/* ── Testimonials ── */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-3">Real Results</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-text mb-3">Agents are closing more deals.</h2>
            <div className="flex justify-center gap-1 mt-2">
              {[1,2,3,4,5].map(i => <Star key={i} size={18} className="text-yellow-400 fill-yellow-400" />)}
              <span className="text-slate-500 text-sm ml-2 font-medium">4.9 · 200+ agent reviews</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map(({ name, role, quote, avatar, stat }) => (
              <div key={name} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col">
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(i => <Star key={i} size={13} className="text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed flex-1 mb-4">&ldquo;{quote}&rdquo;</p>
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {avatar}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-text">{name}</p>
                      <p className="text-xs text-slate-400">{role}</p>
                    </div>
                  </div>
                  <div className="bg-primary-50 rounded-lg px-3 py-1.5">
                    <p className="text-xs font-semibold text-primary-700">✨ {stat}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary-500 to-secondary-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md">
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
              Every script, blog post, and video description generated by VoiceToVideos.AI is automatically
              reviewed by our Fair Housing guardrail — based on the Fair Housing Act (42 U.S.C. § 3604) and
              HUD advertising guidelines (24 CFR Part 109). Non-compliant content is silently rewritten before
              it reaches you. You&apos;re always protected.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-slate-900 via-primary-950 to-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(99,102,241,0.25),transparent)] pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-4">Ready?</p>
          <h2 className="text-3xl sm:text-4xl font-black mb-4">
            Become the most visible agent in your ZIP code.
          </h2>
          <p className="text-slate-300 text-lg mb-10 max-w-xl mx-auto">
            Your competitors are either using tools like this — or they&apos;re about to. Join 200+ agents who aren&apos;t waiting.
          </p>
          <Link href="/register">
            <Button className="bg-white text-primary-700 hover:bg-primary-50 text-base px-12 py-4 gap-2 font-bold shadow-xl" size="lg">
              <PlayCircle size={18} /> Start Free — 5 Videos on Us
            </Button>
          </Link>
          <p className="text-slate-500 text-sm mt-5">No credit card · Fair Housing compliant · Cancel anytime</p>
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
                The AI content platform purpose-built for real estate agents. Speak. Stream. Share.
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
