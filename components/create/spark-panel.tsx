"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

interface TrendingTopic {
  title: string;
  reason: string;
  category?: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

const TYPE_LABELS: Record<TrendingTopic["videoType"], string> = {
  market_update: "Market update",
  why_live_here: "Neighborhood",
  community_events: "Community events",
  custom: "Trending now",
};

const TABS = [
  { key: "trending" as const, label: "Trending here" },
  { key: "formats" as const, label: "Formats" },
  { key: "ideas" as const, label: "Ideas" },
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
 * One surface for all three ways of choosing an idea, replacing the trending
 * list and the categorised template browser that used to sit as two separate
 * sections. The card face carries a kicker and a title only: the descriptions
 * the old cards showed made every card three lines tall, which is what stopped
 * six of them fitting as a grid.
 *
 * The full list stays reachable through the picker at the bottom rather than
 * an expanding browser, so the panel is a fixed height whatever is chosen.
 */
export function SparkPanel({ city, state, onSelect }: SparkPanelProps) {
  const [tab, setTab] = useState<"trending" | "formats" | "ideas">("trending");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 9999));
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(false);

  const hasMarket = !!(city?.trim() && state?.trim());

  useEffect(() => {
    if (!hasMarket) return;
    const key = `topic_radar_${city}_${state}`;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Array.isArray(data) && Date.now() - ts < 4 * 3600 * 1000) {
          setTrending(data);
          return;
        }
      }
    } catch { /* ignore */ }

    let cancelled = false;
    setLoading(true);
    fetch("/api/ai/trending-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, state }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.topics)) return;
        setTrending(data.topics);
        sessionStorage.setItem(key, JSON.stringify({ data: data.topics, ts: Date.now() }));
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [city, state, hasMarket]);

  const toSpark = (t: ContentTemplate): Spark => ({
    kicker: t.category === "format" ? "Format" : t.category === "location" ? "Location" : t.category === "community" ? "Community" : "Idea",
    title: t.label,
    raw: t.topic,
  });

  const pools = useMemo(() => ({
    trending: trending.map((t): Spark => ({
      kicker: t.category?.trim() || TYPE_LABELS[t.videoType] || "Trending now",
      title: t.title,
      raw: t.customTopic || t.title,
    })),
    formats: VIDEO_FORMATS.map(toSpark),
    ideas: CONTENT_TEMPLATES.filter((t) => t.category !== "format").map(toSpark),
  }), [trending]);

  // Every tab's six, not just the open one. All three are a tab click away, so
  // anything drawn on any of them is already reachable by looking — the picker
  // is for what is not. Trending and Formats hold exactly six, so they are
  // fully on the cards and contribute nothing here.
  const sixByTab = useMemo(() => ({
    trending: shuffled(pools.trending, seed).slice(0, SHOWN),
    formats: shuffled(pools.formats, seed).slice(0, SHOWN),
    ideas: shuffled(pools.ideas, seed).slice(0, SHOWN),
  }), [pools, seed]);
  const six = sixByTab[tab];

  const shownTitles = useMemo(
    () => new Set([...sixByTab.trending, ...sixByTab.formats, ...sixByTab.ideas].map((s) => s.title)),
    [sixByTab],
  );
  const rest = useMemo(() => {
    const out: Record<keyof typeof pools, Spark[]> = { trending: [], formats: [], ideas: [] };
    (Object.keys(pools) as (keyof typeof pools)[]).forEach((k) => {
      out[k] = pools[k].filter((s) => !shownTitles.has(s.title));
    });
    return out;
  }, [pools, shownTitles]);
  const restCount = rest.trending.length + rest.formats.length + rest.ideas.length;

  function pick(s: Spark) {
    onSelect(substitutePlaceholders(s.raw, city?.trim(), state?.trim()), s.raw);
  }

  return (
    <section
      id="spark-panel"
      className="scroll-mt-6 rounded-[18px] border border-spark-rule bg-[#f4f2e8] px-4 py-4 sm:px-5"
    >
      {/* "What's it about?" matches the chip — the thing this fills is the
          topic, which is a what, and two names for one field is how someone
          ends up hunting for a question they already answered.

          The subtitle says what is actually in the panel. "Say or Choose to
          Spark" was instructing rather than describing, and reads as talking
          down once you can plainly see three tabs and six cards. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-ink-muted">
          What&rsquo;s it about?
        </span>
        <span className="text-[17px] font-semibold text-spark-ink">
          Topics, ideas and templates to spark you
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={on}
              className={`rounded-full border-[1.5px] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                on
                  ? "border-spark-ink bg-spark-ink text-white"
                  : "border-spark-rule-dim bg-transparent text-spark-ink-muted hover:border-spark-ink-faint"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-ink-faint">
          For you today
        </span>
        <button
          type="button"
          onClick={() => setSeed(Math.floor(Math.random() * 9999))}
          className="ml-auto text-[14px] text-spark-amber underline underline-offset-[3px] hover:text-spark-blue"
        >
          Shuffle
        </button>
      </div>

      {tab === "trending" && !hasMarket ? (
        <p className="mt-3 rounded-[12px] border border-spark-rule bg-white px-3.5 py-3 text-[13.5px] text-spark-ink-muted">
          Add the city and state below and we&rsquo;ll scan what&rsquo;s trending there.
        </p>
      ) : tab === "trending" && loading && six.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 py-2 text-[13.5px] text-spark-ink-faint">
          <Loader2 size={13} className="animate-spin text-spark-amber" />
          Scanning your market for trending topics…
        </div>
      ) : (
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
          that used to push the rest of the page down by several screens. */}
      {restCount > 0 && (
        <label className="mt-3.5 flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[14px] border border-spark-rule bg-white px-4 py-3">
          <span className="flex-none text-[10px] font-semibold uppercase tracking-[0.13em] text-spark-ink-faint">
            Other sparks
          </span>
          <select
            value=""
            onChange={(e) => {
              const [group, idx] = e.target.value.split(":");
              const s = rest[group as keyof typeof rest]?.[Number(idx)];
              if (s) pick(s);
            }}
            className="min-w-0 flex-1 cursor-pointer appearance-none border-none bg-transparent text-[16px] text-spark-ink focus:outline-none"
          >
            <option value="">{restCount} more to choose from</option>
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
