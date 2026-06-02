"use client";

import { useState, useEffect } from "react";
import { Flame, Loader2, RefreshCw, MapPin } from "lucide-react";

interface Topic {
  title: string;
  hook: string;
  reason: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

const TYPE_COLORS: Record<string, string> = {
  market_update: "bg-blue-100 text-blue-700",
  why_live_here: "bg-emerald-100 text-emerald-700",
  community_events: "bg-purple-100 text-purple-700",
  custom: "bg-orange-100 text-orange-700",
};

const TYPE_LABELS: Record<string, string> = {
  market_update: "Market",
  why_live_here: "Local",
  community_events: "Community",
  custom: "Topic",
};

interface Props {
  city?: string;
  state?: string;
  onSelect: (topic: string) => void;
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
          if (Date.now() - ts < 4 * 3600 * 1000) { setTopics(data); return; }
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
      if (data.topics) {
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

  return (
    <div className="mb-5 bg-slate-50 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Flame size={13} className="text-red-500" />
          <span className="text-xs font-bold text-slate-700">Topic Radar</span>
          {city && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <MapPin size={9} /> {city}
            </span>
          )}
        </div>
        <button
          onClick={() => loadTopics(true)}
          disabled={loading}
          className="p-1 rounded hover:bg-slate-200 transition-colors disabled:opacity-40"
          title="Refresh topics"
        >
          <RefreshCw size={11} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && topics.length === 0 && (
        <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin text-blue-500" />
          Scanning your market for trending topics…
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {topics.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(t.customTopic || t.title)}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
          >
            <span className="w-5 h-5 rounded bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center text-[10px] font-bold text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors">
              {i + 1}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[t.videoType]}`}>
              {TYPE_LABELS[t.videoType]}
            </span>
            <span className="text-xs font-medium text-slate-700 group-hover:text-blue-900 leading-snug truncate flex-1">
              {t.title}
            </span>
          </button>
        ))}
      </div>

      {topics.length > 0 && (
        <p className="text-[10px] text-slate-400 mt-2 text-center">Click any topic to fill your topic field</p>
      )}
    </div>
  );
}
