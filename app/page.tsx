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
    photo: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: Camera,
    segment: "Camera-Shy Agents",
    driver: "Performance Anxiety",
    desire: "Build a powerful personal brand without ever appearing on screen.",
    photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: Users,
    segment: "Team Leaders",
    driver: "Scalability",
    desire: "Ensure team-wide content consistency and brand compliance — at scale.",
    photo: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80",
  },
  {
    icon: UserPlus,
    segment: "New Agents",
    driver: "Brand Building",
    desire: "Establish local authority quickly and compete with seasoned agents from day one.",
    photo: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=600&q=80",
  },
];

const features = [
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
    photo: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "YouTube SEO Rankings",
    description: "Every video includes an SEO-optimized title, description, tags, and a full blog post — built to rank on YouTube search for your target neighborhood keywords.",
    photo: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Social Platform Publishing",
    description: "One approval publishes to YouTube, Instagram, TikTok, LinkedIn, Facebook, Threads, and more — with platform-optimized captions and hashtags built in.",
    photo: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Listing Video Generator",
    description: "Paste a Zillow URL or speak the address. We import the details and auto-generate a branded property tour video with your AI avatar — ready to post in minutes.",
    photo: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "49% Faster Revenue Growth",
    description: "Agents who post consistent video content grow revenue 49% faster. VoiceToVideos.AI gives you the output of a full content team without the cost or headache.",
    photo: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
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
    description: "Open the app, pick a topic — market update, listing, local trend — and talk for 60–90 seconds. No script, no prep, no camera. Just your expertise.",
  },
  {
    step: "02",
    title: "AI Builds Your Video Automatically.",
    description: "Our AI writes a Fair Housing-compliant script, generates your AI avatar speaking in your cloned voice, adds b-roll and captions, and produces a broadcast-quality video. Zero editing required.",
  },
  {
    step: "03",
    title: "Publish. Rank. Stay Top-of-Mind.",
    description: "One click posts to social platforms with SEO-optimized metadata designed to rank in your town and keep you visible to buyers and sellers.",
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
    description: "Dominate your market",
    badge: "Most Popular",
    features: ["16 videos/month", "Everything in Agent", "All social platforms", "Hyperlocal SEO rankings", "Content calendar + scheduling", "CRM webhooks (GoHighLevel, HubSpot)", "Priority rendering"],
    cta: "Get Started",
    highlighted: true,
    href: "/api/stripe/checkout?plan=pro",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
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
      <section className="pt-32 pb-20 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-5">
                Stop waiting. Start dominating your local market.
              </p>
              <h1 className="text-5xl sm:text-6xl font-black leading-tight mb-6 text-slate-900">
                Become the &ldquo;digital go-to-real estate agent&rdquo;<br />
                <span className="text-blue-900">of your TOWN.</span>
              </h1>
              <p className="text-base text-slate-500 mb-10 leading-relaxed">
                The agents posting daily aren&apos;t working harder — they&apos;re using VoiceToVideos.AI. Join agents already ahead of their competition.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <a href="#how-it-works" className="inline-flex items-center gap-2 bg-blue-900 text-white text-sm font-semibold px-6 py-3 hover:bg-blue-800 transition-colors">
                  See How It Works <ArrowRight size={15} />
                </a>
                <a href="#pricing" className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 text-sm font-semibold px-6 py-3 hover:border-slate-400 hover:bg-slate-50 transition-colors">
                  View Pricing <ChevronRight size={15} />
                </a>
              </div>
              <p className="mt-8 text-sm text-slate-400">No camera needed · Fair Housing compliant · Cancel anytime</p>
            </div>
            {/* Hero image */}
            <div className="relative hidden lg:block animate-float">
              <Image
                src="/hit-record.png"
                alt="Hit Record. Say What You Know."
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

        {/* Stats bar */}
        <div className="max-w-5xl mx-auto mt-16 border-t border-slate-200 pt-10 grid grid-cols-3 gap-6">
          {[
            {
              stat: "49%",
              label: "Faster revenue growth",
              photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
            },
            {
              stat: "< 2 min",
              label: "Voice to finished video",
              photo: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=600&q=80",
            },
            {
              stat: "0",
              label: "Filming or editing needed",
              photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
            },
          ].map(({ stat, label, photo }) => (
            <div key={label} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={label} className="w-full h-36 object-cover" />
              <div className="p-4">
                <p className="text-3xl font-black text-blue-900">{stat}</p>
                <p className="text-slate-500 text-sm mt-0.5">{label}</p>
              </div>
            </div>
          ))}
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
              Built for agents who are already successful — and want to future-proof their business and become the &ldquo;digital go-to-real estate agent&rdquo; in their town.
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
              — yet two-thirds of the market still isn&apos;t doing it consistently. VoiceToVideos.AI removes every barrier that&apos;s stopping them.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl font-black text-slate-900 mb-3">No technical skill. No camera. No editing.</h2>
            <p className="text-slate-500">Just your voice — and your local expertise.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { ...steps[0], photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
              { ...steps[1], photo: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=600&q=80" },
              { ...steps[2], photo: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80" },
            ].map(({ step, title, description, photo }) => (
              <div key={step} className="bg-white border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={title} className="w-full h-40 object-cover" />
                <div className="p-5 border-t-2 border-blue-900">
                  <p className="text-3xl font-black text-slate-200 mb-2">{step}</p>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
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
                  <th className="p-4 text-center font-bold text-blue-900 text-xs bg-blue-50">VoiceToVideos.AI</th>
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
          <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-4">Stop waiting. Start dominating your local market.</p>
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight max-w-2xl">
            Become the &ldquo;digital go-to-real estate agent&rdquo; of your TOWN.
          </h2>
          <p className="text-blue-200 text-lg mb-10 max-w-xl leading-relaxed">
            The agents posting daily aren&apos;t working harder — they&apos;re using VoiceToVideos.AI. Join agents already ahead of their competition.
          </p>
          <p className="text-blue-300 text-sm">No camera needed · Fair Housing compliant · Cancel anytime</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 mb-8 pb-8 border-b border-slate-800">
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
              <Link href="/register" className="hover:text-white transition-colors">Get Started</Link>
              <Link href="/login"    className="hover:text-white transition-colors">Log In</Link>
              <a href="#features"    className="hover:text-white transition-colors">Features</a>
              <a href="#pricing"     className="hover:text-white transition-colors">Pricing</a>
              <Link href="/privacy"  className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms"    className="hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} VoiceToVideos.AI. All rights reserved.</p>
            <p>All AI-generated content includes Fair Housing compliance guardrails per 42 U.S.C. § 3604.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
