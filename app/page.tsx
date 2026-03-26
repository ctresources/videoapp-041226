import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Mic, Video, Share2, CheckCircle, Star, ArrowRight, Zap, Clock, TrendingUp } from "lucide-react";

const features = [
  {
    icon: Mic,
    title: "Voice to Video Blog",
    description: "Speak your ideas for 2 minutes. Our AI generates a fully-produced video blog with SEO optimization, script, and captions — no editing required.",
    color: "text-primary-500",
    bg: "bg-primary-50",
  },
  {
    icon: Video,
    title: "AI Avatar & Voice Clone",
    description: "Create your digital twin once. Generate short-form reels and TikToks with your AI avatar speaking your script in your cloned voice.",
    color: "text-secondary-500",
    bg: "bg-purple-50",
  },
  {
    icon: Share2,
    title: "Autopost to All Channels",
    description: "One click to distribute your content across YouTube, Instagram, TikTok, Facebook, LinkedIn and more. Schedule or post instantly.",
    color: "text-accent-500",
    bg: "bg-teal-50",
  },
];

const steps = [
  {
    step: "01",
    title: "Speak Your Idea",
    description: "Hit record and speak for 1-3 minutes about any real estate topic — a listing, market update, neighborhood guide, or tip for buyers.",
  },
  {
    step: "02",
    title: "AI Creates Your Content",
    description: "Our AI writes your script, generates SEO-optimized blog content, creates a thumbnail, and produces a professional video with your voice.",
  },
  {
    step: "03",
    title: "Post to Every Platform",
    description: "Review, approve, and distribute your video across all your social channels simultaneously — or let us schedule it automatically.",
  },
];

const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "Realtor, Austin TX",
    quote: "I went from posting once a week to posting daily across 4 platforms. My leads doubled in 60 days. VoiceToVideos.AI is a game changer.",
    avatar: "SM",
  },
  {
    name: "James Rodriguez",
    role: "Broker, Miami FL",
    quote: "I used to spend 15 hours a week on content. Now I speak for 10 minutes and my entire week of content is done. This tool is incredible.",
    avatar: "JR",
  },
  {
    name: "Lisa Chen",
    role: "Agent, San Francisco CA",
    quote: "Clients find me on Google now. The SEO blog content that gets generated from my voice recordings brings in 3-4 leads every month organically.",
    avatar: "LC",
  },
];

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Try it out",
    features: ["5 video credits", "1 social channel", "Basic AI script", "720p video quality"],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For active agents",
    features: ["50 video credits/month", "All social channels", "Advanced AI script + SEO", "1080p video quality", "AI avatar + voice clone", "Priority rendering"],
    cta: "Start Pro Trial",
    highlighted: true,
  },
  {
    name: "Agency",
    price: "$149",
    period: "/month",
    description: "For teams & brokerages",
    features: ["Unlimited video credits", "Up to 5 agents", "White-label options", "4K video quality", "Custom AI avatar", "Dedicated support"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
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
            <a href="#features" className="hover:text-primary-500 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-primary-500 transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-primary-500 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started Free</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-20 px-4 sm:px-6 bg-gradient-to-b from-primary-50/60 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Zap size={12} /> Built for Real Estate Agents
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-brand-text leading-tight mb-6">
            Speak. Stream. Share.{" "}
            <span className="text-primary-500">Reclaim 15 Hours</span>{" "}
            Every Week.
          </h1>
          <p className="text-lg sm:text-xl text-slate-500 mb-8 max-w-2xl mx-auto leading-relaxed">
            Real estate agents use VoiceToVideos.AI to transform a 2-minute voice recording into professional video content — then autopost to every social channel automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2 w-full sm:w-auto text-base px-8">
                <Mic size={18} /> Start Creating Free
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto text-base">
                See How It Works <ArrowRight size={16} />
              </Button>
            </a>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-500" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-500" /> 5 free videos</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-accent-500" /> Setup in 2 minutes</span>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-10 bg-brand-text">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-white">
          {[
            { stat: "15 hrs/week", label: "Saved per agent on average", icon: Clock },
            { stat: "3-5x", label: "More content published", icon: TrendingUp },
            { stat: "60 days", label: "Average to double leads", icon: Zap },
          ].map(({ stat, label, icon: Icon }) => (
            <div key={stat} className="flex flex-col items-center gap-1">
              <Icon size={22} className="text-accent-500 mb-1" />
              <p className="text-3xl font-bold">{stat}</p>
              <p className="text-slate-400 text-sm">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-brand-text mb-3">Everything you need to dominate local social media</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">One platform to create, distribute, and grow your real estate brand online.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-brand hover:shadow-brand-lg transition-shadow">
                <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <h3 className="text-lg font-semibold text-brand-text mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-brand-bg">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-brand-text mb-3">From voice to viral in 3 steps</h2>
            <p className="text-slate-500 text-lg">No filming. No editing. No guessing what to say.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map(({ step, title, description }) => (
              <div key={step} className="relative">
                <div className="text-6xl font-black text-primary-100 mb-3 leading-none">{step}</div>
                <h3 className="text-xl font-bold text-brand-text mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-brand-text mb-3">Agents love VoiceToVideos.AI</h2>
            <div className="flex justify-center gap-1 mt-2">
              {[1,2,3,4,5].map(i => <Star key={i} size={18} className="text-yellow-400 fill-yellow-400" />)}
              <span className="text-slate-500 text-sm ml-2">4.9 from 200+ agents</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map(({ name, role, quote, avatar }) => (
              <div key={name} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-brand">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(i => <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand-text">{name}</p>
                    <p className="text-xs text-slate-400">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-brand-bg">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-brand-text mb-3">Simple, transparent pricing</h2>
            <p className="text-slate-500 text-lg">Start free. Upgrade when you&apos;re ready.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingTiers.map(({ name, price, period, description, features: f, cta, highlighted }) => (
              <div
                key={name}
                className={`rounded-2xl p-6 border ${highlighted ? "border-primary-500 shadow-brand-lg bg-white relative" : "border-slate-200 bg-white"}`}
              >
                {highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <p className="text-sm font-medium text-slate-500 mb-1">{name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-brand-text">{price}</span>
                  <span className="text-slate-400 text-sm">{period}</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">{description}</p>
                <ul className="space-y-2 mb-6">
                  {f.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle size={14} className="text-accent-500 mt-0.5 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link href="/register">
                  <Button variant={highlighted ? "primary" : "outline"} className="w-full">
                    {cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-r from-primary-500 to-secondary-500">
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to become the go-to agent in your city?</h2>
          <p className="text-primary-100 text-lg mb-8">
            Join 200+ real estate agents who are already creating viral content with their voice.
          </p>
          <Link href="/register">
            <Button className="bg-white text-primary-600 hover:bg-primary-50 text-base px-10 py-4 gap-2" size="lg">
              <Mic size={18} /> Start Creating Free Today
            </Button>
          </Link>
          <p className="text-primary-200 text-sm mt-4">No credit card required · 5 free videos · Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-text text-slate-400 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <Image
              src="https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif"
              alt="VoiceToVideos.AI"
              width={140}
              height={42}
              unoptimized
            />
            <p className="text-xs mt-2 text-slate-500">© 2025 VoiceToVideos.AI. All rights reserved.</p>
          </div>
          <div className="flex gap-6 text-sm">
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
