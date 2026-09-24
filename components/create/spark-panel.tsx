"use client";

import { useMemo, useState } from "react";
import { Search, Shuffle, X } from "lucide-react";
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
 * Five ideas, freshly drawn each visit.
 *
 * Thirty-two chips on screen is a catalogue, and a catalogue is the wrong
 * answer to "what should I make?" — it asks someone to read everything before
 * choosing anything. Five is small enough to read in a glance, and drawing a
 * new five each time means the panel stays worth looking at on the tenth visit
 * rather than becoming five words the eye skips.
 *
 * Seeded rather than shuffled live: the seed is held in state, so the set is
 * stable while the page is open and changes when the agent asks or when they
 * come back. A list that reorders under the cursor is one nobody can point at.
 *
 * Formats are excluded. "Listicle (Top 5)" and "Pros & Cons" answer HOW a
 * video is told, not what it is about — offered among subjects they read as
 * alternatives to them, and picking one still leaves the page not knowing what
 * the video is for. They live under More ideas, where someone looking for a
 * shape will find them.
 *
 * What this deliberately does NOT do is claim to know what this agent has
 * already made. That needs their history, and quietly repeating last week's
 * topic would be worse than an honest draw.
 */
function shortlistFor(city: string | undefined, seed: number): ContentTemplate[] {
  const pool = CONTENT_TEMPLATES.filter((t) => t.category !== "format");
  const local = pool.filter((t) => t.category === "location" || t.category === "community");
  const rest = pool.filter((t) => t.category !== "location" && t.category !== "community");

  // A video about where you work is the one nobody else can make, so those
  // lead once a market is set — but only two of the five, or the panel becomes
  // a local-events list.
  const ordered = city?.trim() ? [...draw(local, 2, seed), ...draw(rest, SHORTLIST, seed)] : draw(rest, SHORTLIST, seed);
  return dedupe(ordered).slice(0, SHORTLIST);
}

/** `count` items from `items`, starting somewhere the seed decides and striding
 *  through so a draw is spread across the list rather than a run of neighbours. */
function draw(items: ContentTemplate[], count: number, seed: number): ContentTemplate[] {
  if (items.length === 0) return [];
  const stride = 1 + (seed % Math.max(1, items.length - 1));
  const start = seed % items.length;
  const out: ContentTemplate[] = [];
  for (let i = 0; out.length < Math.min(count, items.length); i++) {
    const next = items[(start + i * stride) % items.length];
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

function dedupe(items: ContentTemplate[]): ContentTemplate[] {
  const seen = new Set<string>();
  return items.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

interface SparkPanelProps {
  city?: string;
  state?: string;
  /** Receives the resolved topic and the raw {city}/{state} original, so a
   *  location typed after picking still lands. */
  onSelect: (topic: string, raw: string) => void;
}

/**
 * Five ideas, with the whole library one press behind them.
 *
 * This was three tabs over a grid of six cards with a dropdown underneath
 * holding the rest, then thirty-two chips in groups — a sixth of the library
 * behind two controls, or all of it at once. Both asked the same wrong thing:
 * read everything before choosing anything. Somebody who came here to make a
 * video today does not want a catalogue, they want a suggestion.
 *
 * So five chips and a Shuffle, with More ideas holding the search and the full
 * grouped library for anyone who does want to browse. Nothing is hidden that
 * was reachable before; it is one press further away and the press is labelled.
 */
export function SparkPanel({ city, state, onSelect }: SparkPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * Drawn once per visit, and again whenever Shuffle is pressed. In state
   * rather than computed inline so the five hold still while the page is being
   * read — a set that changes on every render cannot be pointed at.
   */
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 9973));

  const shortlist = useMemo(() => shortlistFor(city, seed), [city, seed]);

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
      className="scroll-mt-6 rounded-b-[22px] border border-t-0 border-spark-rule bg-[#f4f2e8] px-4 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-3">
          <p className="text-[15px] font-semibold text-spark-ink">
            {open ? "All topics, ideas & templates" : "Need an Idea for a Topic?"}
          </p>
          {/* Beside the heading rather than at the end of the chips, where it
              wrapped onto the same line as More ideas and the two read as a
              pair — they do opposite jobs. Here it belongs to the five it
              redraws, and the row below is nothing but ideas. */}
          {!open && (
            <button
              type="button"
              // Stepped rather than re-rolled, so a press always lands on a
              // different draw — a Shuffle that can return the same five reads
              // as a broken button.
              onClick={() => setSeed((n) => n + 1 + Math.floor(Math.random() * 7))}
              title="Show me five more"
              className="flex items-center gap-1.5 text-[14px] font-semibold text-spark-ink-muted transition-colors hover:text-spark-amber"
            >
              <Shuffle size={14} /> Shuffle
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setQuery(""); }}
          className="text-[14px] font-semibold text-spark-amber hover:text-spark-blue"
        >
          {open ? "Show fewer" : `More ideas (${CONTENT_TEMPLATES.length})`}
        </button>
      </div>

      {!open && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
