"use client";

import { useMemo, useState } from "react";
import {
  CONTENT_TEMPLATES,
  VIDEO_FORMATS,
  substitutePlaceholders,
  type ContentTemplate,
} from "@/components/create/content-templates";

/** One pickable idea, whatever list it came from. */
interface Spark {
  /** Small amber line above the title. */
  kicker: string;
  title: string;
  /** What lands in the topic field, with {city}/{state} still unresolved. */
  raw: string;
}

/**
 * Two tabs, not three.
 *
 * "Trending here" is gone, and with it this panel's call to
 * /api/ai/trending-topics, the cache behind it and its loading state. It could
 * not show anything until a city had been typed, and the city field is further
 * down the page — so it was the tab most likely to be empty, and it spent its
 * empty state asking for a field somewhere else.
 *
 * The endpoint itself stays: the camera tab's TopicRadar and the dashboard
 * widget both still use it. This panel simply no longer fires it, which also
 * means typing a market here costs nothing.
 */
const TABS = [
  { key: "formats" as const, label: "Formats" },
  { key: "ideas" as const, label: "Ideas" },
];

/**
 * The six chips under the title — the kinds of video agents actually post.
 *
 * Short chip labels mapped onto templates that already exist, rather than a
 * second set of topics to keep in step with the first. The label is what an
 * agent calls the video; the template underneath is the prompt that writes it.
 *
 * They are duplicates of six cards a tab away, deliberately: a card is found
 * by looking through three tabs, a chip is found by arriving.
 */
const QUICK_TEMPLATES: { label: string; templateId: string }[] = [
  { label: "Property tour",       templateId: "home_tour" },
  { label: "Market update",       templateId: "market_conditions" },
  { label: "Community spotlight", templateId: "neighborhood_spotlight" },
  { label: "Seller tip",          templateId: "seller_tips" },
  { label: "Buyer tip",           templateId: "homebuyer_tips" },
  { label: "Just listed",         templateId: "just_listed" },
];

/** The design's grid is 3x2. */
const SHOWN = 6;

/** Seeded shuffle, so Shuffle genuinely reorders and a reload does not. */
function shuffled<T>(pool: T[], seed: number): T[] {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out = pool.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface SparkPanelProps {
  city?: string;
  state?: string;
  /** Receives the resolved topic and the raw {city}/{state} original, so a
   *  location typed after picking still lands. */
  onSelect: (topic: string, raw: string) => void;
}

/**
 * The design's "Say or Choose to Spark" panel.
 *
 * One surface for choosing an idea, replacing the trending list and the
 * categorised template browser that used to sit as two separate sections —
 * and now flush against the composer above it, because they fill the same
 * field. The card face carries a kicker and a title only: the descriptions
 * the old cards showed made every card three lines tall, which is what stopped
 * six of them fitting as a grid.
 *
 * The full list stays reachable through the picker at the bottom rather than
 * an expanding browser, so the panel is a fixed height whatever is chosen.
 */
export function SparkPanel({ city, state, onSelect }: SparkPanelProps) {
  const [tab, setTab] = useState<"formats" | "ideas">("formats");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 9999));

  const toSpark = (t: ContentTemplate): Spark => ({
    kicker: t.category === "format" ? "Format" : t.category === "location" ? "Location" : t.category === "community" ? "Community" : "Idea",
    title: t.label,
    raw: t.topic,
  });

  /**
   * Everything except what the chips already offer.
   *
   * The six chips ARE six of these templates, so without this the panel drew
   * "Seller tip" as a chip and "Home Seller Tips" as a card directly beneath
   * it — the same topic twice, in two shapes, four inches apart, and again a
   * third time inside Browse more sparks.
   */
  const chipIds = useMemo(() => new Set(QUICK_TEMPLATES.map((q) => q.templateId)), []);

  const pools = useMemo(() => ({
    formats: VIDEO_FORMATS.filter((t) => !chipIds.has(t.id)).map(toSpark),
    ideas: CONTENT_TEMPLATES
      .filter((t) => t.category !== "format" && !chipIds.has(t.id))
      .map(toSpark),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [chipIds]);

  // Both tabs' six, not just the open one. Either is a tab click away, so
  // anything drawn on either is already reachable by looking — the picker at
  // the bottom is for what is not.
  const sixByTab = useMemo(() => ({
    formats: shuffled(pools.formats, seed).slice(0, SHOWN),
    ideas: shuffled(pools.ideas, seed).slice(0, SHOWN),
  }), [pools, seed]);
  const six = sixByTab[tab];

  const shownTitles = useMemo(
    () => new Set([...sixByTab.formats, ...sixByTab.ideas].map((s) => s.title)),
    [sixByTab],
  );
  const rest = useMemo(() => {
    const out: Record<keyof typeof pools, Spark[]> = { formats: [], ideas: [] };
    (Object.keys(pools) as (keyof typeof pools)[]).forEach((k) => {
      out[k] = pools[k].filter((s) => !shownTitles.has(s.title));
    });
    return out;
  }, [pools, shownTitles]);
  const restCount = rest.formats.length + rest.ideas.length;

  function pick(s: Spark) {
    onSelect(substitutePlaceholders(s.raw, city?.trim(), state?.trim()), s.raw);
  }

  return (
    // Joined to the composer above it: no top rounding, no top border, and
    // the page pulls it flush. The two were separate cards with a gap, which
    // made picking an idea look like a different exercise from typing one when
    // they fill the same field. One block now, two shades — white where you
    // write, paper where you choose.
    <section
      id="spark-panel"
      className="scroll-mt-6 rounded-b-[22px] border border-t-0 border-spark-rule bg-[#f4f2e8] px-4 py-4 sm:px-5"
    >
      {/* The "What's it about?" eyebrow that sat beside this is gone. It was
          the fourth place on one screen asking the same question — after the
          section heading, the mic line and a chip — and the title beside it
          already says what the panel holds. */}
      <p className="text-[17px] font-semibold text-spark-ink">
        Topics, ideas &amp; templates to spark you
      </p>

      {/* The six most-posted kinds of video, straight off the title.
          They lived above this panel as their own row, under their own
          heading, which made two template pickers stacked and two pale pill
          rows in a column — one of which was the composer's checklist and not
          clickable at all. Here they are the fast path INTO the panel: the
          same pick() every card below uses. */}
      {/* One row: the six chips, then the two tabs behind a divider.
          The chips pick a topic outright; the tabs change what the cards
          below show. Run together they would read as eight of the same
          thing, so the rule is what says the last two are a switch. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {QUICK_TEMPLATES.map(({ label, templateId }) => {
          const t = CONTENT_TEMPLATES.find((c) => c.id === templateId);
          if (!t) return null;
          return (
            <button
              key={templateId}
              type="button"
              onClick={() => pick(toSpark(t))}
              className="rounded-full border border-spark-rule bg-white px-3.5 py-2 text-[13px] font-medium text-spark-ink-soft transition-colors hover:border-spark-amber hover:text-spark-amber"
            >
              {label}
            </button>
          );
        })}

        <span aria-hidden className="mx-1 h-6 w-px flex-none bg-spark-rule-dim" />

        {TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            // The same chip as the six beside it — same radius, padding, type
            // size and weight, sentence case rather than shouted uppercase.
            // A black pill next to six white ones read as a different species
            // of control on a row that is meant to be one row.
            //
            // Selected is the app's amber, which is what a chosen thing looks
            // like everywhere else here, rather than the inverted black that
            // only this panel used.
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                on
                  ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]"
                  : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-amber hover:text-spark-amber"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* "For you today" is gone. It labelled the six cards under it, which
          are already plainly six cards, and it sat where a tab had just been
          chosen — so it read as a fourth tab that would not press. Shuffle
          keeps the row to itself. */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSeed(Math.floor(Math.random() * 9999))}
          className="ml-auto text-[14px] text-spark-amber underline underline-offset-[3px] hover:text-spark-blue"
        >
          Shuffle
        </button>
      </div>

      {/* No loading state left to draw. Both tabs come out of a list this
          file already holds, so there is nothing to wait for — the spinner
          and the "add the city and state" box that lived here both belonged
          to the trending tab, which is gone. */}
      {(
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {six.map((s, i) => (
            <button
              key={`${s.title}-${i}`}
              type="button"
              onClick={() => pick(s)}
              className="flex flex-col gap-1 rounded-[12px] border border-spark-rule bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-px hover:border-spark-amber"
            >
              <span className="text-[8.5px] font-semibold uppercase leading-[1.3] tracking-[0.12em] text-spark-amber">
                {s.kicker}
              </span>
              <span className="text-[15.5px] font-semibold leading-[1.2] tracking-[-0.01em] text-spark-ink text-pretty">
                {s.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Everything the cards are not showing. Replaces the expanding browser
          that used to push the rest of the page down by several screens.

          The "Other sparks" eyebrow that used to sit inside this row went with
          the rename — beside a control reading "Browse more sparks" it was the
          same words twice, three inches apart, one of them shouting. */}
      {restCount > 0 && (
        <label className="mt-3.5 flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[14px] border border-spark-rule bg-white px-4 py-3">
          <select
            value=""
            onChange={(e) => {
              const [group, idx] = e.target.value.split(":");
              const s = rest[group as keyof typeof rest]?.[Number(idx)];
              if (s) pick(s);
            }}
            className="min-w-0 flex-1 cursor-pointer appearance-none border-none bg-transparent text-[16px] text-spark-ink focus:outline-none"
          >
            <option value="">Browse more sparks</option>
            {TABS.map(({ key, label }) =>
              rest[key].length ? (
                <optgroup key={key} label={label}>
                  {rest[key].map((s, i) => (
                    <option key={`${key}-${i}`} value={`${key}:${i}`}>
                      {s.title}
                    </option>
                  ))}
                </optgroup>
              ) : null
            )}
          </select>
          <span className="flex-none text-[13px] text-spark-amber">▾</span>
        </label>
      )}
    </section>
  );
}
