"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * More ideas on Spark Studio for an account in SparkReels mode (2026-11-01):
 * every SparkReels feature as a topic, newest updates first, in place of the
 * real estate ideas. Same list as Feature videos on AutoSparks.
 */
interface Feature { id: string; title: string; blurb: string; isNew: boolean }

export function SparkreelsIdeas({ onPick, onClose }: { onPick: (topic: string) => void; onClose: () => void }) {
  const [list, setList] = useState<Feature[] | null>(null);
  useEffect(() => {
    fetch("/api/sparkreels/features").then((r) => (r.ok ? r.json() : null)).then((d) => setList(d?.features ?? [])).catch(() => setList([]));
  }, []);

  return (
    <div id="all-ideas" className="flex scroll-mt-24 flex-col gap-2 border-t border-spark-rule pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-spark-ink">SparkReels features to make a video about</p>
        <button type="button" onClick={onClose} className="text-[13px] font-medium text-spark-ink-muted underline">Fewer ideas</button>
      </div>
      {!list && <Loader2 size={16} className="animate-spin text-spark-ink-muted" />}
      <div className="flex flex-wrap gap-1.5">
        {list?.map((f) => (
          <button key={f.id} type="button" title={f.blurb}
            onClick={() => onPick(`How SparkReels' ${f.title} helps real estate agents`)}
            className="rounded-full border border-spark-rule bg-white px-3 py-1.5 text-[13.5px] text-spark-ink hover:border-spark-amber">
            {f.title}
            {f.isNew && <span className="ml-1.5 rounded-full bg-[#c2410c] px-1.5 py-px text-[10px] font-extrabold text-white">NEW</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
