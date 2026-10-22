import { CheckCircle, Film, Zap } from "lucide-react";

/**
 * The pricing section, moved out of the landing page (2026-10-22) so the
 * landing page and /pricing show the same plans from one place.
 */
export const pricingTiers = [
  {
    name: "Creator",
    price: "$99",
    period: "/month",
    description: "Get in the game",
    badge: null,
    features: ["4 AI videos/month — up to 3 minutes each", "AutoSparks — 3 posts drafted for you every week, ready to approve", "Automatic b-roll, captions & titles on every video", "MLS listing videos — paste a listing link, get a finished property tour", "Unlimited camera and screen recordings (up to 15 mins on camera, 10 on screen)", "Unlimited blog posts — a full article with every script", "Built-in teleprompter", "Voice recording + AI script", "AI content toolkit — title, script, description, tag, channel-name & LinkedIn profile generators", "Thumbnail generator + banners for YouTube, Facebook & LinkedIn", "AI Answer Blocks — turns what buyers ask ChatGPT into videos you can record", "YouTube (16:9) & Reel (9:16) formats", "Publish to YouTube + 3 more platforms per video", "Instagram, Facebook, LinkedIn, TikTok, X, Threads & Google Business", "Seller updates, newsletters and video emails, sent through BoldTrail or your own email", "Ask Sparklee voice help", "Buy extra videos anytime — add-ons never expire"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=starter",
  },
  {
    name: "Producer",
    price: "$149",
    period: "/month",
    description: "Build your local brand",
    badge: "Most Popular",
    features: ["4 short AI videos/month — up to 3 minutes each, with automatic b-roll", "AutoSparks — 3 posts drafted for you every week, ready to approve", "2 long AI videos/month — up to 8 minutes each, using your photos for visuals", "MLS listing videos — paste a listing link, get a finished property tour", "Unlimited camera and screen recordings (up to 15 mins on camera, 10 on screen)", "Unlimited blog posts — a full article with every script", "Built-in teleprompter", "Voice recording + AI script", "AI content toolkit — title, script, description, tag, channel-name & LinkedIn profile generators", "Thumbnail generator + banners for YouTube, Facebook & LinkedIn", "AI Answer Blocks — turns what buyers ask ChatGPT into videos you can record", "YouTube (16:9) & Reel (9:16) formats", "Publish to YouTube + every platform", "Instagram, Facebook, LinkedIn, TikTok, X, Threads & Google Business", "Seller updates, newsletters and video emails, sent through BoldTrail or your own email", "Ask Sparklee voice help", "Buy extra videos anytime — add-ons never expire"],
    cta: "Get Started",
    highlighted: true,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Influencer",
    price: "$199",
    period: "/month",
    description: "Dominate your market",
    badge: null,
    features: ["4 short AI videos/month — up to 3 minutes each, with automatic b-roll", "AutoSparks — 3 posts drafted for you every week, ready to approve", "4 long AI videos/month — up to 8 minutes each, using your photos for visuals", "MLS listing videos — paste a listing link, get a finished property tour", "Unlimited camera and screen recordings (up to 15 mins on camera, 10 on screen)", "Unlimited blog posts — a full article with every script", "Built-in teleprompter", "Voice recording + AI script", "AI content toolkit — title, script, description, tag, channel-name & LinkedIn profile generators", "Thumbnail generator + banners for YouTube, Facebook & LinkedIn", "AI Answer Blocks — turns what buyers ask ChatGPT into videos you can record", "YouTube (16:9) & Reel (9:16) formats", "Publish to YouTube + every platform", "Instagram, Facebook, LinkedIn, TikTok, X, Threads & Google Business", "Seller updates, newsletters and video emails, sent through BoldTrail or your own email", "Ask Sparklee voice help", "Buy extra videos anytime — add-ons never expire"],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=pro",
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-12 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-8">
          <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-4xl font-black text-slate-900 mb-3">Two kinds of video. Pick the plan with the mix you need.</h2>
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
              <span className="text-base font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 ml-auto">Up to 3 min</span>
            </div>
            <p className="text-xl text-slate-500 leading-relaxed mb-3">
              Reels, quick market updates, just-sold posts. Speak for a minute and the AI fills the
              screen with automatic b-roll — you don&apos;t supply anything.
            </p>
            <p className="text-lg text-slate-400">Best for staying visible week to week. On every plan.</p>
          </div>
          <div className="bg-white border border-purple-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                <Film size={15} className="text-purple-600" />
              </div>
              <p className="font-black text-slate-900">Long videos</p>
              <span className="text-base font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 ml-auto">Up to 8 min</span>
            </div>
            <p className="text-xl text-slate-500 leading-relaxed mb-3">
              Full neighborhood tours, property walkthroughs, deep market breakdowns — the
              long-format videos that actually rank on YouTube search. Uses your own listing photos.
            </p>
            <p className="text-lg text-slate-400">Best for building a channel that gets found. On Producer and Influencer.</p>
          </div>
        </div>

        <p className="text-xl text-slate-500 mb-6">
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
                <div className="absolute -top-3 left-6 bg-blue-900 text-white text-lg font-bold px-3 py-1">
                  {badge}
                </div>
              )}
              <p className="text-lg font-bold text-slate-400 uppercase tracking-wide mb-1">{name}</p>
              <div className="flex items-baseline gap-1 mb-0.5">
                <span className="text-5xl font-black text-slate-900">{price}</span>
                <span className="text-slate-400 text-xl">{period}</span>
              </div>
              <p className="text-lg text-slate-400 mb-5 pb-5 border-b border-slate-100">{description}</p>
              <ul className="space-y-2.5 mb-6">
                {f.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-xl text-slate-600">
                    <CheckCircle size={13} className="text-blue-900 mt-0.5 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              <a href={href} className={`block w-full py-2.5 text-center text-xl font-semibold transition-colors ${highlighted ? "bg-blue-900 text-white hover:bg-blue-800" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                {cta}
              </a>
            </div>
          ))}
        </div>

        {/* Add-on credits — pay-as-you-go on any plan */}
        <div className="mt-8 bg-white border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xl font-bold text-slate-900 mb-1">Need more videos some months? Add them anytime.</p>
              <p className="text-lg text-slate-500">One-time purchases on any plan — no plan change needed, and your subscription is never interrupted.</p>
              <p className="text-lg text-slate-500 mt-1">Add-on videos you purchase never expire — unlike your monthly plan videos, they carry over until you use them. Because of that, add-on purchases are non-refundable.</p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0 text-xl">
              <div className="border border-slate-200 px-4 py-2">
                <span className="font-black text-slate-900">$25</span>
                <span className="text-slate-500 text-lg"> · One short video, up to 3 minutes</span>
              </div>
              <div className="border border-blue-900 px-4 py-2 bg-blue-50">
                <span className="font-black text-blue-900">$29</span>
                <span className="text-slate-600 text-lg"> · One long video, up to 8 minutes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
