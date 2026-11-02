"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Feature videos (2026-11-01, SparkReels mode; the owner's approved mockup):
 * on AutoSparks for an account that promotes SparkReels, one row per feature,
 * newest updates first. Make draft writes the script and blog; the draft then
 * waits in From Sparklee and Needs Your Approval like any other.
 */
interface Feature { id: string; title: string; blurb: string; isNew: boolean; draftAt: string | null; status: string | null }

export function FeatureVideos({ onMade }: { onMade?: () => void }) {
  const [list, setList] = useState<Feature[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    fetch("/api/sparkreels/features").then((r) => (r.ok ? r.json() : null)).then((d) => setList(d?.features ?? [])).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  async function make(f: Feature) {
    setBusy(f.id);
    try {
      const res = await fetch("/api/sparkreels/features", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't start that. Try again."); return; }
      toast.success("Writing it now. It shows under From Sparklee in about a minute.");
      load();
      onMade?.();
    } finally { setBusy(null); }
  }

  if (!list || list.length === 0) return null;
  const shown = all ? list : list.slice(0, 8);

  return (
    <div className="rounded-2xl border border-spark-rule bg-white p-4">
      <h3 className="text-[17px] font-bold text-spark-ink">Feature videos</h3>
      <p className="mt-0.5 text-[13.5px] text-spark-ink-muted">One for each SparkReels feature. New ones from What&apos;s New are added at the top.</p>
      <div className="mt-2">
        {shown.map((f) => (
          <div key={f.id} className="flex items-center gap-3 border-t border-spark-rule py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] text-spark-ink">
                {f.title}
                {f.isNew && <span className="ml-1.5 rounded-full bg-[#c2410c] px-1.5 py-px align-[2px] text-[10.5px] font-extrabold text-white">NEW</span>}
              </b>
              <span className="line-clamp-1 text-[13px] text-spark-ink-muted">{f.blurb}</span>
            </div>
            {f.draftAt && (
              <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-[#0f7a52]">
                ✓ {f.status === "posted" ? "Posted" : "Draft made"} {new Date(f.draftAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            <button type="button" onClick={() => void make(f)} disabled={!!busy}
              className={`shrink-0 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[13.5px] font-semibold disabled:opacity-50 ${f.draftAt ? "border border-spark-rule bg-white text-spark-ink" : "bg-spark-amber text-white"}`}>
              {busy === f.id ? <Loader2 size={14} className="animate-spin" /> : f.draftAt ? "Another" : "Make draft"}
            </button>
          </div>
        ))}
      </div>
      {list.length > 8 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-[13px] font-semibold text-[#A3660F] underline">
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
      <p className="mt-2 text-[12.5px] text-spark-ink-muted">Make draft writes the script and blog. Nothing is made or posted until you approve it.</p>
    </div>
  );
}
