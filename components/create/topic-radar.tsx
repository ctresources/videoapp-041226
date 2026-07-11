"use client";

import { useState, useEffect } from "react";
import { Flame, Loader2, RefreshCw } from "lucide-react";

interface Topic {
  title: string;
  hook: string;
  reason: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

// Show exactly one of each: Local → Market → Topic
const PREFERRED_TYPES: Array<Topic["videoType"]> = ["why_live_here", "market_update", "custom"];

// Plain category chips — "Step N" labels here read like the page's own steps and confuse the flow
const STEP_CONFIG = [
  { label: "Local",  bg: "bg-emerald-500", text: "text-white" },
  { label: "Market", bg: "bg-blue-500",    text: "text-white" },
  { label: "Topic",  bg: "bg-orange-500",  text: "text-white" },
];

interface Props {
  city?: string;
  state?: string;
  onSelect?: (topic: string) => void;
}

export function TopicRadar({ city, state, onSelect }: Props) {
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
          // never reach state, or topics.find() below throws and crashes render.
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
  const safeTopics = Array.isArray(topics) ? topics : [];

  // Styled as a category section so it sits flush inside the Topic Templates browser
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide">
          <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-red-400 to-orange-400 shrink-0" />
          <Flame size={13} className="text-red-500" />
          Trending Now{city ? ` · ${city}` : ""}
        </p>
        <button
          onClick={() => loadTopics(true)}
          disabled={loading}
          className="p-1 rounded hover:bg-slate-200 transition-colors disabled:opacity-40"
          title="Refresh topics"
        >
          <RefreshCw size={11} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && safeTopics.length === 0 && (
        <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin text-blue-500" />
          Scanning your market for trending topics…
        </div>
      )}

      <div className="flex flex-col gap-2">
        {PREFERRED_TYPES.map((type, i) => {
          const t = safeTopics.find((x) => x.videoType === type);
          const cfg = STEP_CONFIG[i];
          if (!t) return null;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect?.(t.customTopic || t.title)}
              className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-primary-400 hover:bg-primary-50/50 transition-all group"
            >
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
                {cfg.label}
              </span>
              <span className="text-xs font-medium text-slate-700 group-hover:text-blue-900 leading-snug flex-1">
                {t.title}
              </span>
            </button>
          );
        })}
      </div>

      {safeTopics.length > 0 && (
        <p className="text-[10px] text-slate-400 mt-2 text-center">Tap any row to Spark your topic</p>
      )}
    </div>
  );
}
