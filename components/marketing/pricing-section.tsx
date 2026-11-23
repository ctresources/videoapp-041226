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
 *
 * Two plans since 2026-11-22 (the owner's approved mockup,
 * docs/mockups/pricing-two-plans.html). The numbers live in lib/plan-limits.ts.
 */
export const pricingTiers = [
  {
    name: "Creator",
    price: "$99",
    period: "/month",
    positioning: "Start Showing Up",
    description: "For agents ready to build a consistent online presence.",
    badge: null as string | null,
    main: { title: "4 AI videos a month", sub: "Any style, up to 2 minutes each" },
    highlights: [
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
    positioning: "Post Every Day",
    description: "For agents ready to be everywhere in their market.",
    badge: "Recommended for Growing Agents" as string | null,
    main: { title: "Unlimited AI Avatar in Circle videos", sub: "Up to 1 a day, up to 2 minutes each" },
    highlights: [
      "4 Full AI Avatar videos a month",
      "Publish to YouTube + every platform",
      "A free Agent Intro video every month",
    ],
    cta: "Choose Producer",
    highlighted: true,
    href: "/api/stripe/checkout?plan=agent",
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
const COMPARISON: { feature: string; values: [boolean | string, boolean | string] }[] = [
  { feature: "AI Avatar in Circle videos (up to 2 minutes)", values: ["Counts in your 4", "Unlimited, up to 1 a day"] },
  { feature: "Full AI Avatar videos a month (up to 2 minutes, automatic b-roll)", values: ["4", "4"] },
  { feature: "AutoSparks: 3 posts drafted for you every week, ready to approve", values: [true, true] },
  // The Agent Intro (2026-10-23, the owner's call).
  { feature: "Agent Intro video, 30 seconds, with a short and long bio", values: ["Uses 1 video", "1 free a month"] },
  { feature: "Automatic b-roll, captions and titles on every video", values: [true, true] },
  { feature: "MLS listing videos: paste a listing link, get a finished property tour", values: [true, true] },
  { feature: "Unlimited camera and screen recordings (up to 15 minutes on camera, 10 on screen)", values: [true, true] },
  { feature: "Unlimited blog posts: a full article with every script", values: [true, true] },
  { feature: "Built-in teleprompter", values: [true, true] },
  { feature: "Voice recording + AI script", values: [true, true] },
  { feature: "AI content toolkit: title, script, description, tag, channel-name and LinkedIn profile generators", values: [true, true] },
  { feature: "Thumbnail generator + banners for YouTube, Facebook and LinkedIn", values: [true, true] },
  { feature: "AI Answer Blocks: turns what buyers ask ChatGPT into videos you can record", values: [true, true] },
  { feature: "YouTube (16:9) and Reel (9:16) formats", values: [true, true] },
  { feature: "Publishing per video", values: ["YouTube + 3 more platforms", "YouTube + every platform"] },
  { feature: "Platforms: Instagram, Facebook, LinkedIn, TikTok, X, Threads and Google Business", values: [true, true] },
  { feature: "Seller updates, newsletters and video emails, sent through BoldTrail or your own email", values: [true, true] },
  // Paid-plan features added to the table 2026-10-28, at the owner's ask.
  { feature: "Digital Twin outfits: describe a new outfit and your twin wears it", values: [true, true] },
  { feature: "Spark Insights and Spark Calendar", values: [true, true] },
  { feature: "Affiliate Program: earn 20% of what each customer you refer pays, for their first 12 months", values: [true, true] },
  { feature: "Ask Sparklee voice help", values: [true, true] },
  { feature: "Buy extra videos anytime (add-ons never expire)", values: [true, true] },
];

const GOLD = "#D4A24C";

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return (<><Check size={18} className="mx-auto text-[#D4A24C]" aria-hidden="true" /><span className="sr-only">Included</span></>);
  if (value === false) return (<><Minus size={18} className="mx-auto text-neutral-600" aria-hidden="true" /><span className="sr-only">Not included</span></>);
  return <span className="font-semibold text-white">{value}</span>;
}

/** A simple drawing of each video style. */
function StyleCard({ kind, title, text }: { kind: "full" | "circle"; title: string; text: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-neutral-800 bg-[#151517] p-4">
      <div className="relative aspect-video overflow-hidden rounded-lg" style={{ background: "linear-gradient(135deg,#3a3226,#1d2024 60%,#35291a)" }} aria-hidden="true">
        <div className="absolute inset-x-0 bottom-0 h-[38%]" style={{ background: "linear-gradient(180deg,#2c2a24,#1b1a17)", clipPath: "polygon(0 45%,18% 25%,34% 42%,52% 12%,72% 40%,100% 18%,100% 100%,0 100%)" }} />
        {kind === "full" ? (
          <div className="absolute bottom-0 left-1/2 h-[82%] w-[32%] -translate-x-1/2" style={{ borderRadius: "48% 48% 8px 8px / 30% 30% 4px 4px", background: "linear-gradient(180deg,#8a7b66,#5b5143)" }} />
        ) : (
          <div className="absolute bottom-[7%] right-[5%] aspect-square w-[21%] rounded-full border-[3px]" style={{ borderColor: GOLD, background: "radial-gradient(circle at 50% 36%, #a18f76 0 22%, #5b5143 23% 100%)" }} />
        )}
      </div>
      <p className="mt-3 text-lg font-bold text-white">{title}</p>
      <p className="mt-0.5 text-base text-neutral-400">{text}</p>
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-16 py-14 sm:py-16 px-4 sm:px-6 bg-[#0B0B0C] border-b border-neutral-800 text-white">
      <div className="max-w-[1120px] mx-auto">
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

        {/* Two cards, the same width and height, buttons on one line. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
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
              {/* What the plan is about, level across both cards. */}
              <div
                className={`mt-5 flex min-h-[104px] flex-col justify-center rounded-xl px-4 py-3.5 ${t.highlighted ? "border" : "bg-[#1F1F22]"}`}
                style={t.highlighted ? { background: "rgba(212,162,76,.14)", borderColor: "rgba(212,162,76,.5)" } : undefined}
              >
                <p className="text-2xl font-black leading-tight" style={t.highlighted ? { color: GOLD } : undefined}>{t.main.title}</p>
                <p className="mt-1 text-base text-neutral-300">{t.main.sub}</p>
              </div>
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
          Recording yourself on camera is unlimited on both plans and never uses your videos.
        </p>

        {/* The two styles, so "in Circle" is seen before it's bought. */}
        <div className="mt-12">
          <h3 className="text-2xl font-black text-white mb-5">Two video styles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <StyleCard kind="full" title="Full AI Avatar" text="Your AI avatar on screen, with b-roll and graphics." />
            <StyleCard kind="circle" title="Your AI Avatar in Circle" text="Your AI avatar in a circle, over scenes for every line." />
          </div>
          <p className="mt-4 text-base sm:text-lg text-neutral-400">Both styles work with your headshot avatar or your Digital Twin.</p>
        </div>

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
              <caption className="sr-only">Features by plan: Creator and Producer</caption>
              <thead>
                <tr className="border-b border-neutral-700">
                  <th scope="col" className="py-3 pr-4 text-base font-semibold text-neutral-400">Feature</th>
                  {pricingTiers.map((t) => (
                    <th key={t.name} scope="col" className="w-[24%] py-3 px-2 text-center text-base font-bold text-white">
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
              <div className="rounded-lg border px-4 py-2" style={{ borderColor: GOLD }}>
                <span className="font-black" style={{ color: GOLD }}>$25</span>
                <span className="text-neutral-300 text-lg"> · One video, up to 2 minutes</span>
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
