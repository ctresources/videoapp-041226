"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Loader2, RefreshCw, X } from "lucide-react";

interface Suggestion {
  title: string;
  hook: string;
  why_now: string;
}

interface Props {
  city?: string;
  state?: string;
}

function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `draft_queue_${now.getFullYear()}_${weekNum}`;
}

export function DraftQueue({ city, state }: Props) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function fetchSuggestions(force = false) {
    const cacheKey = getWeekKey();
    if (!force) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) { setSuggestions(JSON.parse(cached)); return; }
      } catch { /* ignore */ }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/weekly-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, state }),
      });
      const data = await res.json();
      if (data.suggestions) {
        setSuggestions(data.suggestions);
        sessionStorage.setItem(getWeekKey(), JSON.stringify(data.suggestions));
      }
    } catch { /* silent fail */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const dismissKey = `draft_queue_dismissed_${getWeekKey()}`;
    if (sessionStorage.getItem(dismissKey)) { setDismissed(true); return; }
    fetchSuggestions();
  }, []); // eslint-disable-line

  function handleDismiss() {
    sessionStorage.setItem(`draft_queue_dismissed_${getWeekKey()}`, "1");
    setDismissed(true);
  }

  function handleGenerate(title: string) {
    router.push(`/create?topic=${encodeURIComponent(title)}`);
  }

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-5 mb-6 text-white">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-yellow-300" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Your Draft Queue</p>
            <p className="text-xs text-blue-200 mt-0.5">AI-researched topics ready to record this week</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => fetchSuggestions(true)}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={13} className={`text-blue-200 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={13} className="text-blue-300" />
          </button>
        </div>
      </div>

      {loading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-blue-200">
          <Loader2 size={14} className="animate-spin" />
          Researching this week&apos;s best topics for your market…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {suggestions.map((s, i) => (
            <div key={i} className="bg-white/10 hover:bg-white/15 rounded-xl p-3.5 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-snug mb-1">{s.title}</p>
                  <p className="text-xs text-blue-200 leading-relaxed">{s.why_now}</p>
                </div>
                <button
                  onClick={() => handleGenerate(s.title)}
                  className="shrink-0 flex items-center gap-1.5 bg-white text-blue-900 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors mt-0.5"
                >
                  Generate <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
