"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface Topic {
  title: string;
  hook: string;
  reason: string;
  category?: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

// The design's grid is 3×2. Anything the model returns beyond that is dropped
// rather than left to wrap into a ragged third row.
const MAX_CARDS = 6;

// Fallback kicker, for cached responses written before the API returned a
// category and for the occasional result that comes back without one.
const TYPE_LABELS: Record<Topic["videoType"], string> = {
  market_update: "MARKET UPDATE",
  why_live_here: "NEIGHBORHOOD",
  community_events: "COMMUNITY EVENTS",
  custom: "TRENDING NOW",
};

interface Props {
  city?: string;
  state?: string;
  onSelect?: (topic: string) => void;
  /** "See all templates ›" — opens the full browser below. */
  onSeeAll?: () => void;
}

export function TopicRadar({ city, state, onSelect, onSeeAll }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadTopics(force = false) {
    const key = `topic_radar_${city}_${state}`;
    if (!force) {
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          // Only accept a well-formed array cache — a stale/corrupt entry must
          // never reach state, or the map below throws and crashes render.
          if (Array.isArray(data) && Date.now() - ts < 4 * 3600 * 1000) { setTopics(data); return; }
        }
      } catch { /* ignore */ }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trending-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, state }),
      });
      const data = await res.json();
      if (Array.isArray(data.topics)) {
        setTopics(data.topics);
        sessionStorage.setItem(key, JSON.stringify({ data: data.topics, ts: Date.now() }));
      }
    } catch { /* silent fail */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (city && state) loadTopics();
  }, [city, state]); // eslint-disable-line

  if (!city && !state) return null;

  // Backstop: never call array methods on a non-array, whatever state holds.
  const safeTopics = (Array.isArray(topics) ? topics : []).slice(0, MAX_CARDS);
  const market = [city, state?.toUpperCase()].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.13em] text-spark-ink-muted">
          Trending in {market || "your market"}
          <button
            type="button"
            onClick={() => loadTopics(true)}
            disabled={loading}
            className="rounded p-0.5 transition-colors hover:bg-spark-rule-soft disabled:opacity-40"
            title="Refresh topics"
          >
            <RefreshCw size={10} className={`text-spark-ink-faint ${loading ? "animate-spin" : ""}`} />
          </button>
        </p>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex-none text-[13px] font-medium text-spark-amber hover:text-spark-blue"
          >
            See all templates ›
          </button>
        )}
      </div>

      {loading && safeTopics.length === 0 && (
        <div className="flex items-center gap-2 py-2 text-[13px] text-spark-ink-faint">
          <Loader2 size={12} className="animate-spin text-spark-amber" />
          Scanning your market for trending topics…
        </div>
      )}

      {safeTopics.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {safeTopics.map((t, i) => (
            <button
              key={`${t.title}-${i}`}
              type="button"
              onClick={() => onSelect?.(t.customTopic || t.title)}
              className="flex flex-col gap-1 rounded-[9px] border border-spark-rule bg-white px-3.5 py-3 text-left transition-colors hover:border-spark-amber hover:bg-spark-amber-tint"
            >
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-spark-amber">
                {t.category?.trim() || TYPE_LABELS[t.videoType] || "TRENDING NOW"}
              </span>
              <span className="text-[14px] font-medium leading-[1.35] text-spark-ink">
                {t.title}
              </span>
              <span className="text-[12.5px] leading-[1.4] text-spark-ink-faint">
                {t.reason}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
