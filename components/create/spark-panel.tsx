"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  CONTENT_TEMPLATES,
  substitutePlaceholders,
  type ContentTemplate,
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
const GROUPS: { keys: TemplateCategory[]; label: string }[] = [
  // First, because these are the ones somebody is actually deciding. Every
  // other group names a subject; this one names a conflict.
  { keys: ["decision"], label: "The hard questions" },
  { keys: ["general"],  label: "Real estate tips" },
  { keys: ["format"],   label: "Formats" },
  // One group, not two. "Your area" and "Local events & community" were the
  // same subject split by an internal distinction — a schools piece and a
  // farmers-market piece are both a video about where you live, and nobody
  // hunting for one would know which of the two headings to look under.
  { keys: ["location", "community"], label: "Local events & community" },
];

/** How many ideas the panel offers before anyone asks for more. */
const SHORTLIST = 5;

/**
 * Five ideas, chosen rather than shuffled.
 *
 * Thirty-two chips on screen is a catalogue, and a catalogue is the wrong
 * answer to "what should I make?" — it asks someone to read everything before
 * choosing anything. Five is small enough to read in a glance.
 *
 * Which five is decided by the month, so the panel is not the same every visit
 * but is the same all day: a list that reshuffles on every render is one you
 * cannot point at, walk away from and come back to. Local ideas come first
 * when a market is set, because a video about where you work is the one nobody
 * else can make.
 *
 * What it deliberately does NOT do is claim to know what this agent has
 * already made. That needs their history, and a shortlist that quietly repeats
 * last week's topic would be worse than one that admits it is a rotation.
 */
function shortlistFor(city: string | undefined, monthIndex: number): ContentTemplate[] {
  const local = CONTENT_TEMPLATES.filter((t) => t.category === "location" || t.category === "community");
  const rest = CONTENT_TEMPLATES.filter((t) => t.category !== "location" && t.category !== "community");
  // Decisions first among the rest: they name a conflict somebody is actually
  // having, where the others name a subject.
  rest.sort((a, b) => Number(b.category === "decision") - Number(a.category === "decision"));

  const pool = city?.trim() ? [...local, ...rest] : [...rest, ...local];
  const start = monthIndex % pool.length;
  return Array.from({ length: Math.min(SHORTLIST, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
}

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Same five all day, different five next month — see shortlistFor.
  const shortlist = useMemo(() => shortlistFor(city, new Date().getMonth()), [city]);

  /**
   * Searching beats scanning past about a dozen options, and the library only
   * grows. Matches the label, what the template is for, and the topic itself,
   * so "schools" finds the one whose chip says "Best Schools" and "heating"
   * finds whichever one mentions it in its description.
   */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return CONTENT_TEMPLATES.filter((t) =>
      [t.label, t.description, t.topic].some((f) => f.toLowerCase().includes(q)),
    );
  }, [query]);

  const pick = (t: ContentTemplate) =>
    onSelect(substitutePlaceholders(t.topic, city?.trim(), state?.trim()), t.topic);

  const chip =
    "rounded-full border border-spark-rule bg-white px-2.5 py-1 text-[12px] font-medium leading-[1.35] text-spark-ink-soft transition-colors hover:border-spark-amber hover:text-spark-amber";

  return (
    // Joined to the composer above it: no top rounding, no top border, and
    // the page pulls it flush. The two were separate cards with a gap, which
    // made picking an idea look like a different exercise from typing one when
    // they fill the same field. One block now, two shades — white where you
    // write, paper where you choose.
    <section
      id="spark-panel"
      className="scroll-mt-6 rounded-b-[22px] border border-t-0 border-spark-rule bg-[#f4f2e8] px-4 py-3.5 sm:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-spark-ink">
          {open ? "All topics, ideas & templates" : "Need an idea?"}
        </p>
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setQuery(""); }}
          className="text-[12.5px] font-semibold text-spark-amber hover:text-spark-blue"
        >
          {open ? "Show fewer" : `More ideas (${CONTENT_TEMPLATES.length})`}
        </button>
      </div>

      {!open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shortlist.map((t) => (
            <button key={t.id} type="button" onClick={() => pick(t)} title={t.description} className={chip}>
              {SHORT_LABELS[t.id] ?? t.label}
            </button>
          ))}
        </div>
      )}

      {open && (
        <>
          {/* Search first, groups under it. Typing is faster than reading
              thirty-two labels, and it is the half that keeps working as the
              library grows. */}
          <div className="relative mt-2.5">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-spark-ink-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ideas — schools, downsizing, rates…"
              className="w-full rounded-full border border-spark-rule bg-white py-1.5 pl-8 pr-8 text-[13px] text-spark-ink placeholder:text-spark-ink-faint focus:border-spark-amber focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-spark-ink-faint hover:text-spark-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {results ? (
            <div className="mt-2.5">
              {results.length === 0 ? (
                // Not a dead end: the box above takes anything, and saying so
                // is more useful than "no results".
                <p className="text-[12.5px] text-spark-ink-muted">
                  Nothing matches &ldquo;{query}&rdquo; — type what you want in the box above instead.
                  It does not have to be one of these.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {results.map((t) => (
                    <button key={t.id} type="button" onClick={() => pick(t)} title={t.description} className={chip}>
                      {SHORT_LABELS[t.id] ?? t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2.5">
              {GROUPS.map(({ keys, label }) => {
                const items = CONTENT_TEMPLATES.filter((t) => keys.includes(t.category));
                if (items.length === 0) return null;
                return (
                  <div key={label}>
                    <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-spark-ink-faint">
                      {label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((t) => (
                        <button key={t.id} type="button" onClick={() => pick(t)} title={t.description} className={chip}>
                          {SHORT_LABELS[t.id] ?? t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
