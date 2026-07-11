"use client";

import { useState, useEffect } from "react";
import { Flame, Loader2, RefreshCw, MapPin, TrendingUp } from "lucide-react";

interface Topic {
  title: string;
  hook: string;
  reason: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

// Show exactly one of each: Local → Market → Topic
const PREFERRED_TYPES: Array<Topic["videoType"]> = ["why_live_here", "market_update", "custom"];

// Rendered as template-style cards so trending reads as the first category of the browser
const STEP_CONFIG = [
  { label: "Local Spotlight", icon: MapPin,     color: "bg-emerald-50", iconColor: "text-emerald-600" },
  { label: "Market Pulse",    icon: TrendingUp, color: "bg-blue-50",    iconColor: "text-blue-500" },
  { label: "Hot Topic",       icon: Flame,      color: "bg-orange-50",  iconColor: "text-orange-500" },
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PREFERRED_TYPES.map((type, i) => {
          const t = safeTopics.find((x) => x.videoType === type);
          const cfg = STEP_CONFIG[i];
          const Icon = cfg.icon;
          if (!t) return null;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect?.(t.customTopic || t.title)}
              className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-primary-400 hover:bg-primary-50/50 transition-all text-left group"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color} group-hover:scale-105 transition-transform`}>
                <Icon size={15} className={cfg.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-text leading-tight">
                  🔥 {cfg.label}
                </p>
                <p className="text-xs text-slate-500 leading-snug mt-0.5">
                  {t.title}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
