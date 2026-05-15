import Image from "next/image";
import Link from "next/link";
import { DemoVideo } from "@/components/landing/demo-video";
import { Button } from "@/components/ui/button";
import {
  Mic, Video, Share2, CheckCircle, Star, ArrowRight, Zap,
  Clock, TrendingUp, MapPin, Home, CalendarDays,
  PlayCircle, X, Camera, Users, UserPlus, Trophy,
} from "lucide-react";

const segments = [
  {
    icon: Clock,
    color: "text-blue-600",
    bg: "bg-blue-50",
    segment: "Solo Agents",
    driver: "Time Scarcity",
    desire: "Stay top-of-mind without losing 15 hours a week to content production.",
  },
  {
    icon: Camera,
    color: "text-pink-600",
    bg: "bg-pink-50",
    segment: "Camera-Shy Agents",
    driver: "Performance Anxiety",
    desire: "Build a powerful personal brand without ever appearing on screen.",
  },
  {
    icon: Users,
    color: "text-orange-600",
    bg: "bg-orange-50",
    segment: "Team Leaders",
    driver: "Scalability",
    desire: "Ensure team-wide content consistency and brand compliance — at scale.",
  },
  {
    icon: UserPlus,
    color: "text-green-600",
    bg: "bg-green-50",
    segment: "New Agents",
    driver: "Brand Building",
    desire: "Establish local authority quickly and compete with seasoned agents from day one.",
  },
];

const features = [
  {
    icon: Mic,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    title: "One-Button Video Creation",
    description: "Speak for 90 seconds about any market topic, listing, or local update. AI writes the script, builds visuals, adds captions, and renders broadcast-quality video — no filming, no editing required.",
    badge: "Core Feature",
    badgeColor: "bg-indigo-50 text-indigo-700",
  },
  {
    icon: Camera,
    color: "text-pink-600",
    bg: "bg-pink-50",
    title: "No Camera. No Problem.",
    description: "Your AI avatar appears on screen in your place — speaking in your cloned voice. Build a compelling personal brand and stay top-of-mind without ever recording your face.",
    badge: "Camera-Free",
    badgeColor: "bg-pink-50 text-pink-700",
  },
  {
    icon: MapPin,
    color: "text-orange-600",
    bg: "bg-orange-50",
    title: "Hyperlocal Market Intelligence",
    description: "Generate hyper-local market update videos that rank on YouTube — positioning you as the undisputed digital expert in your town.",
    badge: "SEO Domination",
    badgeColor: "bg-orange-50 text-orange-700",
  },
  {
    icon: Trophy,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    title: "\"Digital Mayor\" Status",
    description: "Consistently publishing hyper-local expert content makes you the agent people think of first. VoiceToVideos.AI makes sure you're what buyers and sellers find.",
    badge: "Top-of-Mind",
    badgeColor: "bg-yellow-50 text-yellow-700",
  },
  {
    icon: TrendingUp,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "YouTube SEO Rankings",
    description: "Every video comes with an SEO-optimized title, description, tags, and a full blog post — built to rank on YouTube search for your target neighborhood keywords.",
    badge: "Rank #1",
    badgeColor: "bg-green-50 text-green-700",
  },
  {
    icon: CalendarDays,
    color: "text-teal-600",
    bg: "bg-teal-50",
    title: "Auto-Schedule to Social Platforms",
    description: "One approval publishes to YouTube, Instagram, TikTok, LinkedIn, Facebook, Threads, and more — with platform-optimized captions and hashtags built in.",
    badge: "Autopilot",
    badgeColor: "bg-teal-50 text-teal-700",
  },
  {
    icon: Home,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Listing Video Generator",
    description: "Paste a Zillow URL or speak the address. We import the details and auto-generate a branded property tour video with your AI avatar — ready to post before you leave the driveway.",
    badge: "Live Now",
    badgeColor: "bg-blue-50 text-blue-700",
  },
  {
    icon: Share2,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "Proven ROI — 49% Faster Growth",
    description: "Agents who post consistent video content grow revenue 49% faster than those who don't. VoiceToVideos.AI gives you the output of a full content team — without the cost or headache.",
    badge: "49% Growth",
    badgeColor: "bg-purple-50 text-purple-700",
  },
];

const comparison = [
  { feature: "No filming or on-camera requirement",  us: true,  a: false, b: false, c: false },
  { feature: "AI Avatar + Voice Cloning",             us: true,  a: true,  b: true,  c: false },
  { feature: "Hyperlocal market intelligence",        us: true,  a: false, b: true,  c: true  },
  { feature: "YouTube SEO optimized metadata",        us: true,  a: false, b: false, c: false },
  { feature: "One-button — no tech skills needed",    us: true,  a: false, b: false, c: false },
  { feature: "Listing Auto-Video (URL → Video)",      us: true,  a: false, b: true,  c: true  },
  { feature: "Social platform auto-publishing",       us: true,  a: true,  b: true,  c: true  },
  { feature: "Fair Housing Guardrails Built-in",      us: true,  a: false, b: false, c: false },
  { feature: "Purpose-built for Real Estate",         us: true,  a: false, b: true,  c: true  },
];

const steps = [
  {
    step: "01",
    title: "Hit Record. Say What You Know.",
    description: "Open the app, pick a topic — market update, listing, local trend — and talk for 60–90 seconds about your area. No script, no prep, no camera. Just your expertise.",
  },
  {
    step: "02",
    title: "AI Builds Your Video Automatically.",
    description: "Our AI writes a Fair Housing-compliant script, generates your AI avatar speaking in your cloned voice, adds b-roll and captions, and produces a broadcast-quality video. Zero editing required.",
  },
  {
    step: "03",
    title: "Publish. Rank. Stay Top-of-Mind.",
    description: "One click posts to social platforms with SEO-optimized metadata designed to rank in your town and keep you visible to buyers and sellers searching for a local expert.",
  },
];

const pricingTiers = [
  {
    name: "Starter",
    price: "$39",
    period: "/month",
    description: "Get in the game",
    badge: null,
    features: ["4 videos/month", "Voice recording + AI script", "Blog & landscape formats", "Content templates", "Trending topic discovery", "1 social platform"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=starter",
  },
  {
    name: "Agent",
    price: "$69",
    period: "/month",
    description: "Build your local brand",
    badge: null,
    features: ["12 videos/month", "All video formats (16:9, 9:16, 1:1)", "AI avatar + voice clone", "AI script + SEO optimization", "MLS listing auto-video", "Content templates (24 topics)", "3 social platforms"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "Dominate your ZIP code",
    badge: "Most Popular",
    features: ["16 videos/month", "Everything in Agent", "All social platforms", "Hyperlocal SEO rankings", "Content calendar + scheduling", "CRM webhooks (GoHighLevel, HubSpot)", "Priority rendering"],
    cta: "Get Started",
    highlighted: true,
    href: "/api/stripe/checkout?plan=pro",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
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
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
            <a href="#who"          className="hover:text-slate-900 transition-colors">Who It&apos;s For</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#features"     className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#pricing"      className="hover:text-slate-900 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors px-3 py-2">
              Log In
            </Link>
            <Link href="/register">
              <button className="text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-700 transition-colors flex items-center gap-1.5">
                <Zap size={13} /> Start Free
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">

          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-4 py-2 rounded-full mb-8 border border-indigo-100">
            <Mic size={11} /> The One-Button Video Platform for Real Estate Agents
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6 text-slate-900">
            Grow Revenue{" "}
            <span className="text-indigo-600">49% Faster</span>{" "}
            Without Ever Going on Camera.
          </h1>

          <p className="text-xl text-slate-500 mb-4 max-w-2xl mx-auto leading-relaxed font-medium">
            Busy, stretched-thin agents achieve dominant top-of-mind presence — without the technical headache or the pressure of being on camera.
          </p>

          <p className="text-base text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
            VoiceToVideos.AI turns a simple 90-second voice recording into a professional video, SEO blog, and social posts — automatically. No filming. No editing. No technical skills required.
          </p>

          <a href="#how-it-works">
            <button className="inline-flex items-center gap-2 bg-indigo-600 text-white text-base font-semibold px-8 py-4 rounded-full hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200">
              See How It Works <ArrowRight size={16} />
            </button>
          </a>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-indigo-500" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-indigo-500" /> No camera needed</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-indigo-500" /> Fair Housing compliant AI</span>
          </div>

          <DemoVideo />
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-3 gap-4">
          {[
            { stat: "49%",     label: "Faster revenue growth",  icon: TrendingUp },
            { stat: "< 2 min", label: "Voice to finished video", icon: Clock },
            { stat: "0",       label: "Filming or editing",      icon: Video },
          ].map(({ stat, label, icon: Icon }) => (
            <div key={label} className="group bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-100 rounded-2xl p-5 text-center transition-all duration-200 cursor-default">
              <Icon size={18} className="text-slate-400 group-hover:text-indigo-500 mx-auto mb-2 transition-colors" />
              <p className="text-2xl font-black text-slate-900">{stat}</p>
              <p className="text-slate-500 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className="py-16 px-4 sm:px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex gap-1 justify-center mb-6">
            {[1,2,3,4,5].map(i => <Star key={i} size={16} className="text-yellow-400 fill-yellow-400" />)}
          </div>
          <blockquote className="text-lg sm:text-xl text-slate-600 leading-relaxed italic mb-8">
            &ldquo;I used to feel that sinking pit in my stomach every Sunday night, knowing I&apos;d wasted another week buried in technical headaches and awkward retakes while my community slowly forgot I was the local expert they needed. That changed when I stopped trying to be a film editor and started leaning into my actual expertise — simply narrating updates on neighborhood inventory and school trends directly into a one-button AI system that builds the visuals and captions for me. Now I&apos;m finally that steady, professional presence my sphere trusts because I&apos;ve traded the exhausting grind of video production for a digital megaphone that keeps me top-of-mind while I&apos;m out actually showing homes and closing deals.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">CT</div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">C. Thompson</p>
              <p className="text-xs text-slate-400">Real Estate Broker</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section id="who" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Who It&apos;s For</p>
            <h2 className="text-4xl font-black text-slate-900 leading-tight mb-4">
              Two-thirds of agents know video grows their business.<br className="hidden sm:block" />
              <span className="text-indigo-600">Most just don&apos;t have a system to do it.</span>
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Built for agents who are already successful — and want to future-proof their business and achieve &ldquo;digital mayor&rdquo; status in their local area.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {segments.map(({ icon: Icon, color, bg, segment, driver, desire }) => (
              <div key={segment} className="group flex gap-4 p-6 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default">
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                  <Icon size={20} className={color} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900 text-sm">{segment}</p>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{driver}</span>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">{desire}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-5 bg-indigo-50 border border-indigo-100 rounded-2xl text-center">
            <p className="text-sm font-medium text-indigo-900">
              Agents who post consistent video content grow revenue{" "}
              <span className="font-black text-indigo-600">49% faster</span>{" "}
              — yet two-thirds of the market still isn&apos;t doing it consistently. VoiceToVideos.AI removes every barrier that&apos;s stopping them.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3">
              No technical skill. No camera. No editing.
            </h2>
            <p className="text-slate-500 text-lg">Just your voice — and your local expertise.</p>
          </div>

          <div className="flex flex-col gap-4">
            {steps.map(({ step, title, description }, i) => (
              <div key={step} className="group flex gap-6 p-6 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all duration-200">
                <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white text-lg font-black flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="pt-1">
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Everything Included</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3">
              Built to make you the digital expert<br className="hidden sm:block" /> in your market.
            </h2>
            <p className="text-slate-500 text-lg">Hyperlocal intelligence. SEO domination. Zero camera required.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map(({ icon: Icon, color, bg, title, description, badge, badgeColor }) => (
              <div key={title} className="group bg-white border border-slate-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-default flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <Icon size={18} className={color} />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1.5 leading-snug">{title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed flex-1">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section id="compare" className="py-24 px-4 sm:px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">How We Stack Up</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3">The only platform that removes every barrier.</h2>
            <p className="text-slate-500">No camera. No tech skills. No manual editing. No excuses.</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-400 text-xs w-[40%]">Feature</th>
                  <th className="p-4 text-center font-black text-indigo-600 text-xs">VoiceToVideos.AI</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor A</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor B</th>
                  <th className="p-4 text-center font-semibold text-slate-400 text-xs">Competitor C</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ feature, us, a, b, c }, idx) => (
                  <tr key={feature} className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                    <td className="p-3 pl-4 text-slate-700 font-medium text-xs">{feature}</td>
                    {[us, a, b, c].map((val, i) => (
                      <td key={i} className="p-3 text-center">
                        {val
                          ? <CheckCircle size={15} className={`mx-auto ${i === 0 ? "text-indigo-500" : "text-green-400"}`} />
                          : <X size={15} className="mx-auto text-slate-200" />}
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
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-black text-slate-900 mb-3">Less than one lost commission covers a year.</h2>
            <p className="text-slate-500 text-lg">No contracts. Cancel anytime. Billed monthly.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
            {pricingTiers.map(({ name, price, period, description, features: f, cta, highlighted, badge, href }) => (
              <div
                key={name}
                className={`rounded-2xl p-6 border relative transition-all duration-200 ${
                  highlighted
                    ? "border-indigo-500 shadow-xl ring-2 ring-indigo-500/20 bg-white"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                }`}
              >
                {badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow whitespace-nowrap">
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
                      <CheckCircle size={13} className="text-indigo-500 mt-0.5 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <a href={href}>
                  <button className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    highlighted
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
                      : "border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}>
                    {cta}
                  </button>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fair Housing ── */}
      <section className="py-8 px-4 sm:px-6 bg-blue-50 border-y border-blue-100">
        <div className="max-w-4xl mx-auto flex items-start gap-4">
          <CheckCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900 mb-0.5">Fair Housing Compliance Built In</p>
            <p className="text-sm text-blue-700 leading-relaxed">
              Every script, blog post, and video description is automatically reviewed by our Fair Housing guardrail — based on the Fair Housing Act (42 U.S.C. § 3604) and HUD advertising guidelines (24 CFR Part 109).
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-28 px-4 sm:px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(99,102,241,0.2),transparent)] pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Stop waiting. Start dominating.</p>
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
            Become the &ldquo;digital mayor&rdquo;<br className="hidden sm:block" /> of your ZIP code.
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-lg mx-auto">
            The agents posting daily aren&apos;t working harder — they&apos;re using VoiceToVideos.AI. Join agents already ahead of their competition.
          </p>
          <Link href="/register">
            <button className="inline-flex items-center gap-2 bg-white text-slate-900 text-base font-bold px-10 py-4 rounded-full hover:bg-slate-100 active:scale-95 transition-all shadow-xl">
              <PlayCircle size={18} /> Start Free — No Credit Card
            </button>
          </Link>
          <p className="text-slate-600 text-sm mt-5">No camera needed · Fair Housing compliant · Cancel anytime</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-950 text-slate-500 py-12 px-4 sm:px-6">
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
              <p className="text-xs mt-3 text-slate-600 max-w-xs leading-relaxed">
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
          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-700">
            <p>© {new Date().getFullYear()} VoiceToVideos.AI. All rights reserved.</p>
            <p>All AI-generated content includes Fair Housing compliance guardrails per 42 U.S.C. § 3604.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
