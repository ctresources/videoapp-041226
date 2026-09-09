"use client";

import {
  CONTENT_TEMPLATES,
  substitutePlaceholders,
  type TemplateCategory,
} from "@/components/create/content-templates";

/**
 * Shorter names for the handful people reach for most.
 *
 * The canonical labels are written to be unambiguous in a list of thirty —
 * "Home Tour", "Homebuyer Tips" — which is right there and long here. These
 * six are the ones an agent already has a word for.
 */
const SHORT_LABELS: Record<string, string> = {
  home_tour: "Property tour",
  market_conditions: "Market update",
  neighborhood_spotlight: "Community spotlight",
  seller_tips: "Seller tip",
  homebuyer_tips: "Buyer tip",
  just_listed: "Just listed",
};

/**
 * The four groups, in the order an agent works through them: what to say,
 * how to shape it, then the two kinds of local content.
 *
 * Labels borrowed from the browser this panel replaced, which already had
 * names for three of these — one fewer set of words to keep in step.
 */
const GROUPS: { key: TemplateCategory; label: string }[] = [
  { key: "general",   label: "Real estate tips" },
  { key: "format",    label: "Formats" },
  { key: "location",  label: "Your area" },
  { key: "community", label: "Local events & community" },
];

interface SparkPanelProps {
  city?: string;
  state?: string;
  /** Receives the resolved topic and the raw {city}/{state} original, so a
   *  location typed after picking still lands. */
  onSelect: (topic: string, raw: string) => void;
}

/**
 * Every topic, on screen, one tap away.
 *
 * This was three tabs over a grid of six cards with a dropdown underneath
 * holding the rest — a design that showed you a sixth of what it had and made
 * the other twenty-four a hunt through two controls. The tabs are gone, and
 * with them the cards, the Shuffle that reordered which six appeared, and the
 * "Browse more sparks" picker that existed only to reach what the cards were
 * hiding. All thirty are chips now, grouped rather than in one flat wall so
 * that Pros & Cons does not sit next to Farmers Markets with nothing between
 * them.
 *
 * Nothing is lost by showing everything: these are short labels, not cards,
 * and the whole set costs about the vertical space the six cards did.
 */
export function SparkPanel({ city, state, onSelect }: SparkPanelProps) {
  return (
    // Joined to the composer above it: no top rounding, no top border, and
    // the page pulls it flush. The two were separate cards with a gap, which
    // made picking an idea look like a different exercise from typing one when
    // they fill the same field. One block now, two shades — white where you
    // write, paper where you choose.
    <section
      id="spark-panel"
      // Tightened once every topic was on screen at once. Six cards could
      // afford card-sized padding; thirty chips cannot, and the panel is a
      // list to scan rather than a thing to admire.
      className="scroll-mt-6 rounded-b-[22px] border border-t-0 border-spark-rule bg-[#f4f2e8] px-4 py-3.5 sm:px-5"
    >
      <p className="text-[15px] font-semibold text-spark-ink">
        Topics, ideas &amp; templates to spark you
      </p>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {GROUPS.map(({ key, label }) => {
          const items = CONTENT_TEMPLATES.filter((t) => t.category === key);
          if (items.length === 0) return null;
          return (
            <div key={key}>
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-spark-ink-faint">
                {label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      onSelect(substitutePlaceholders(t.topic, city?.trim(), state?.trim()), t.topic)
                    }
                    title={t.description}
                    className="rounded-full border border-spark-rule bg-white px-2.5 py-1 text-[12px] font-medium leading-[1.35] text-spark-ink-soft transition-colors hover:border-spark-amber hover:text-spark-amber"
                  >
                    {SHORT_LABELS[t.id] ?? t.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
