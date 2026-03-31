"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Flame, Loader2, RefreshCw, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrendingTopic {
  title: string;
  hook: string;
  reason: string;
  videoType: "market_update" | "why_live_here" | "community_events" | "custom";
  customTopic?: string;
}

const VIDEO_TYPE_LABELS: Record<string, string> = {
  market_update: "Market Update",
  why_live_here: "Why Live Here",
  community_events: "Community Events",
  custom: "Custom Topic",
};

const VIDEO_TYPE_COLORS: Record<string, string> = {
  market_update: "bg-blue-100 text-blue-700",
  why_live_here: "bg-green-100 text-green-700",
  community_events: "bg-purple-100 text-purple-700",
  custom: "bg-orange-100 text-orange-700",
};

interface TrendingTopicsProps {
  city?: string;
  state?: string;
}

export function TrendingTopics({ city, state }: TrendingTopicsProps) {
  const router = useRouter();
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [location, setLocation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  async function fetchTopics(force = false) {
    // Cache for 4 hours per location
    const cacheKey = `trending_topics_${city || "us"}_${state || "all"}`;
    if (!force) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { topics: cachedTopics, location: cachedLocation, ts } = JSON.parse(cached);
        if (Date.now() - ts < 4 * 60 * 60 * 1000) {
          setTopics(cachedTopics);
          setLocation(cachedLocation);
          setLastFetched(new Date(ts));
          return;
        }
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai/trending-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, state }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTopics(data.topics);
      setLocation(data.location);
      setLastFetched(new Date());
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ topics: data.topics, location: data.location, ts: Date.now() })
      );
    } catch (err) {
      console.error("Failed to load trending topics:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTopics();
  }, [city, state]); // eslint-disable-line

  function handleCreate(topic: TrendingTopic) {
    const params = new URLSearchParams({
      tab: "location",
      type: topic.videoType,
      topic: topic.customTopic || topic.title,
      ...(city && { city }),
      ...(state && { state }),
    });
    router.push(`/create?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
            <Flame size={14} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-text">Trending This Week</p>
            {location && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin size={10} />
                {location}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => fetchTopics(true)}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
          title="Refresh trends"
        >
          <RefreshCw size={13} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Loading state */}
      {loading && topics.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[72px] rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Topics list */}
      {!loading && topics.length === 0 && (
        <div className="py-6 text-center">
          <TrendingUp size={24} className="text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Couldn&apos;t load trends right now</p>
          <button
            onClick={() => fetchTopics(true)}
            className="mt-2 text-xs text-primary-500 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {topics.map((topic, i) => (
        <div
          key={i}
          className="group flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-primary-200 hover:bg-primary-50/30 transition-all cursor-pointer"
          onClick={() => handleCreate(topic)}
        >
          {/* Rank */}
          <div className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-primary-100 flex items-center justify-center shrink-0 text-xs font-bold text-slate-400 group-hover:text-primary-600 transition-colors mt-0.5">
            {i + 1}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${VIDEO_TYPE_COLORS[topic.videoType]}`}
              >
                {VIDEO_TYPE_LABELS[topic.videoType]}
              </span>
            </div>
            <p className="text-xs font-semibold text-brand-text leading-snug line-clamp-1">
              {topic.title}
            </p>
            <p className="text-xs text-slate-400 leading-snug line-clamp-1 mt-0.5">
              {topic.reason}
            </p>
          </div>

          {/* Arrow */}
          <ArrowRight
            size={14}
            className="text-slate-300 group-hover:text-primary-500 transition-colors shrink-0 mt-1"
          />
        </div>
      ))}

      {/* Last updated */}
      {lastFetched && !loading && (
        <p className="text-[10px] text-slate-300 text-center">
          Updated {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
