import { Check, Minus } from "lucide-react";

/**
 * The pricing section, shared by the landing page (/#pricing) and /pricing.
 *
 * Redesigned 2026-10-22 at the owner's brief: black, charcoal and gold;
 * three short cards; one "every plan includes" strip; and a full comparison
 * table behind a disclosure, so nothing the old feature lists said is lost.
 * Prices, plan keys and checkout links are unchanged: each button is still
 * GET /api/stripe/checkout?plan=…, which sends a signed-out visitor to
 * register with the plan remembered.
 */
export const pricingTiers = [
  {
    name: "Creator",
    price: "$99",
    period: "/month",
    positioning: "Start Showing Up",
    description: "For agents ready to build a consistent online presence.",
    badge: null as string | null,
    highlights: [
      "4 short AI videos a month, up to 2 minutes each",
      "Unlimited blog posts",
      "AutoSparks: 3 drafts written for you every week",
      "Publish to YouTube + 3 more platforms per video",
    ],
    cta: "Get Started",
    highlighted: false,
    href: "/api/stripe/checkout?plan=starter",
  },
  {
    name: "Producer",
    price: "$149",
    period: "/month",
    positioning: "Build Your Local Brand",
    description: "For agents ready to pair weekly visibility with in-depth content.",
    badge: "Recommended for Growing Agents" as string | null,
    highlights: [
      "4 short AI videos a month, up to 2 minutes each",
      "2 long AI videos a month, up to 8 minutes each",
      "Publish to YouTube + every platform",
      "A free Agent Intro video every month",
      "Everything in Creator",
    ],
    cta: "Choose Producer",
    highlighted: true,
    href: "/api/stripe/checkout?plan=agent",
  },
  {
    name: "Influencer",
    price: "$199",
    period: "/month",
    positioning: "Expand Your Reach",
    description: "For agents committed to a fuller long-form content schedule.",
    badge: null as string | null,
    highlights: [
      "4 short AI videos a month, up to 2 minutes each",
      "4 long AI videos a month, up to 8 minutes each",
      "Publish to YouTube + every platform",
      "A free Agent Intro video every month",
      "Everything in Creator",
    ],
    cta: "Choose Influencer",
    highlighted: false,
    href: "/api/stripe/checkout?plan=pro",
  },
];

/** On every plan: the short strip under the cards. */
const SHARED = [
  { title: "Unlimited blog writing", text: "A researched article with every script, or on its own." },
  { title: "AI scripts", text: "Speak a topic and get a script written for your market." },
  { title: "Your avatar and voice", text: "Your AI avatar or Digital Twin, speaking in your cloned voice." },
  { title: "Built-in teleprompter", text: "Film yourself with a script that scrolls as you talk." },
  { title: "AutoSparks", text: "3 posts drafted for you every week, ready to approve." },
  { title: "Camera and screen recording", text: "Unlimited: up to 15 minutes on camera, 10 on screen." },
];

/**
 * Every line the old plan cards listed, plan by plan. `true` is included,
 * `false` is not, and a string is what that plan gets.
 */
const COMPARISON: { feature: string; values: [boolean | string, boolean | string, boolean | string] }[] = [
  { feature: "Short AI videos a month (up to 2 minutes, automatic b-roll)", values: ["4", "4", "4"] },
  { feature: "Long AI videos a month (up to 8 minutes, using your photos for visuals)", values: [false, "2", "4"] },
  { feature: "AutoSparks: 3 posts drafted for you every week, ready to approve", values: [true, true, true] },
  // The Agent Intro (2026-10-23, the owner's call).
  { feature: "Agent Intro video, 30 seconds, with a short and long bio", values: ["Uses 1 short video", "1 free a month", "1 free a month"] },
  { feature: "Automatic b-roll, captions and titles on every video", values: [true, true, true] },
  { feature: "MLS listing videos: paste a listing link, get a finished property tour", values: [true, true, true] },
  { feature: "Unlimited camera and screen recordings (up to 15 minutes on camera, 10 on screen)", values: [true, true, true] },
  { feature: "Unlimited blog posts: a full article with every script", values: [true, true, true] },
  { feature: "Built-in teleprompter", values: [true, true, true] },
  { feature: "Voice recording + AI script", values: [true, true, true] },
  { feature: "AI content toolkit: title, script, description, tag, channel-name and LinkedIn profile generators", values: [true, true, true] },
  { feature: "Thumbnail generator + banners for YouTube, Facebook and LinkedIn", values: [true, true, true] },
  { feature: "AI Answer Blocks: turns what buyers ask ChatGPT into videos you can record", values: [true, true, true] },
  { feature: "YouTube (16:9) and Reel (9:16) formats", values: [true, true, true] },
  { feature: "Publishing per video", values: ["YouTube + 3 more platforms", "YouTube + every platform", "YouTube + every platform"] },
  { feature: "Platforms: Instagram, Facebook, LinkedIn, TikTok, X, Threads and Google Business", values: [true, true, true] },
  { feature: "Seller updates, newsletters and video emails, sent through BoldTrail or your own email", values: [true, true, true] },
  { feature: "Ask Sparklee voice help", values: [true, true, true] },
  { feature: "Buy extra videos anytime (add-ons never expire)", values: [true, true, true] },
];

const GOLD = "#D4A24C";

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return (<><Check size={18} className="mx-auto text-[#D4A24C]" aria-hidden="true" /><span className="sr-only">Included</span></>);
  if (value === false) return (<><Minus size={18} className="mx-auto text-neutral-600" aria-hidden="true" /><span className="sr-only">Not included</span></>);
  return <span className="font-semibold text-white">{value}</span>;
}

export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-16 py-14 sm:py-16 px-4 sm:px-6 bg-[#0B0B0C] border-b border-neutral-800 text-white">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-10 max-w-4xl">
          <p className="text-lg font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Pricing</p>
          <h2 id="pricing-heading" className="text-3xl sm:text-5xl font-black leading-tight mb-4 text-white">
            Your Expertise Deserves to Be Seen.
          </h2>
          <p className="text-lg sm:text-xl leading-relaxed text-neutral-300">
            Choose how you want to show up. SparkReels turns your real estate knowledge into videos, blogs,
            and social content that help you stay visible and build trust.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2 text-sm sm:text-base font-semibold text-neutral-200" aria-label="Billing terms">
            {["Billed monthly", "No long-term contracts", "Cancel anytime"].map((t) => (
              <li key={t} className="flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1">
                <Check size={14} style={{ color: GOLD }} aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Three cards, the same height, buttons on one line. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {pricingTiers.map((t) => (
            <article
              key={t.name}
              aria-labelledby={`plan-${t.name}`}
              className={`relative flex flex-col rounded-2xl p-6 sm:p-7 ${
                t.highlighted
                  // Same 1px border as the others, so the buttons stay level;
                  // the extra gold line is a shadow, which takes no space.
                  ? "bg-[#17150F] border shadow-[0_0_0_1px_#D4A24C,0_20px_50px_-20px_rgba(212,162,76,0.35)]"
                  : "bg-[#151517] border border-neutral-800"
              }`}
              style={t.highlighted ? { borderColor: GOLD } : undefined}
            >
              {t.badge && (
                <p className="absolute -top-3.5 left-6 rounded-full px-3 py-1 text-sm font-bold text-black" style={{ background: GOLD }}>
                  {t.badge}
                </p>
              )}
              <p id={`plan-${t.name}`} className="text-base font-bold uppercase tracking-widest" style={{ color: GOLD }}>{t.name}</p>
              <h3 className="mt-1 text-2xl font-black text-white">{t.positioning}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-black text-white">{t.price}</span>
                <span className="text-xl text-neutral-400">{t.period}</span>
              </p>
              <p className="mt-3 text-lg leading-relaxed text-neutral-300">{t.description}</p>
              <ul className="mt-5 mb-7 space-y-3 border-t border-neutral-800 pt-5">
                {t.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-lg text-neutral-100">
                    <Check size={18} className="mt-1 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
                    {h}
                  </li>
                ))}
              </ul>
              <a
                href={t.href}
                className={`mt-auto block w-full rounded-lg py-3.5 text-center text-lg font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0C] focus-visible:ring-[#D4A24C] ${
                  t.highlighted ? "border text-black hover:brightness-110" : "border border-neutral-600 text-white hover:border-[#D4A24C] hover:text-[#D4A24C]"
                }`}
                style={t.highlighted ? { background: GOLD, borderColor: GOLD } : undefined}
              >
                {t.cta}
              </a>
            </article>
          ))}
        </div>

        <p className="mt-6 text-base sm:text-lg text-neutral-400">
          Short and long videos are counted separately — using your long videos never eats into your short ones.
        </p>

        {/* Every plan includes */}
        <div className="mt-12">
          <h3 className="text-2xl font-black text-white mb-5">Every plan includes</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHARED.map((s) => (
              <li key={s.title} className="rounded-xl border border-neutral-800 bg-[#151517] p-5">
                <p className="flex items-center gap-2 text-lg font-bold text-white">
                  <Check size={18} style={{ color: GOLD }} aria-hidden="true" /> {s.title}
                </p>
                <p className="mt-1 text-base text-neutral-400">{s.text}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* The full list, plan by plan. <details> opens with Enter or Space. */}
        <details className="group mt-8 rounded-xl border border-neutral-800 bg-[#151517]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-lg font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A24C]">
            Compare every feature
            <span className="text-2xl font-normal transition-transform group-open:rotate-45" style={{ color: GOLD }} aria-hidden="true">+</span>
          </summary>
          <div className="overflow-x-auto px-2 pb-4 sm:px-5">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Features by plan: Creator, Producer and Influencer</caption>
              <thead>
                <tr className="border-b border-neutral-700">
                  <th scope="col" className="py-3 pr-4 text-base font-semibold text-neutral-400">Feature</th>
                  {pricingTiers.map((t) => (
                    <th key={t.name} scope="col" className="w-[18%] py-3 px-2 text-center text-base font-bold text-white">
                      {t.name}
                      <span className="block text-sm font-normal text-neutral-400">{t.price}{t.period}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-neutral-800 last:border-0">
                    <th scope="row" className="py-3 pr-4 text-base font-normal text-neutral-200">{row.feature}</th>
                    {row.values.map((v, i) => (
                      <td key={i} className="py-3 px-2 text-center text-base"><Cell value={v} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* Add-on credits — pay-as-you-go on any plan. Wording kept as it was. */}
        <div className="mt-8 rounded-xl border border-neutral-800 bg-[#151517] p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Need more videos some months? Add them anytime.</h3>
              <p className="text-lg text-neutral-300">One-time purchases on any plan — no plan change needed, and your subscription is never interrupted.</p>
              <p className="text-lg text-neutral-400 mt-1">Add-on videos you purchase never expire — unlike your monthly plan videos, they carry over until you use them. Because of that, add-on purchases are non-refundable.</p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0 text-xl">
              <div className="rounded-lg border border-neutral-700 px-4 py-2">
                <span className="font-black text-white">$25</span>
                <span className="text-neutral-400 text-lg"> · One short video, up to 2 minutes</span>
              </div>
              <div className="rounded-lg border px-4 py-2" style={{ borderColor: GOLD }}>
                <span className="font-black" style={{ color: GOLD }}>$29</span>
                <span className="text-neutral-300 text-lg"> · One long video, up to 8 minutes</span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-base text-neutral-500">
          No contracts. Cancel anytime. Billed monthly.
        </p>
      </div>
    </section>
  );
}
