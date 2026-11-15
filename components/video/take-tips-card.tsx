"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TakeTips } from "@/lib/video/take-tips";

/**
 * "Take tips" for a saved camera take (2026-11-15, the owner's approved
 * mockup #4). Looks every 10 seconds for up to 4 minutes while they're being
 * written; shows nothing if there are none or they couldn't be made.
 */
export function TakeTipsCard({ videoId, initial, onRecordAgain, wait = true }: {
  videoId: string;
  initial?: TakeTips | null;
  onRecordAgain?: () => void;
  /** False where the take is old: show what's there, don't wait. */
  wait?: boolean;
}) {
  const [tips, setTips] = useState<TakeTips | null>(initial ?? null);
  const [gaveUp, setGaveUp] = useState(!wait);

  useEffect(() => {
    if (tips || !wait) return;
    let stop = false;
    const started = Date.now();
    const look = async () => {
      if (stop) return;
      const d = await fetch(`/api/video/take-tips?videoId=${encodeURIComponent(videoId)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (stop) return;
      if (d?.tips) { setTips(d.tips as TakeTips); return; }
      if (Date.now() - started > 240_000) { setGaveUp(true); return; }
      setTimeout(look, 10_000);
    };
    const t = setTimeout(look, 8_000);
    return () => { stop = true; clearTimeout(t); };
  }, [videoId, tips, wait]);

  if (tips?.failed || (gaveUp && !tips)) return null;
  if (!tips) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-slate-400">
        <Loader2 size={12} className="animate-spin" /> Writing take tips…
      </p>
    );
  }
  const list = tips.tips ?? [];
  if (!tips.good && !list.length) return null;

  return (
    <div className="rounded-xl border border-spark-rule bg-white p-4">
      <p className="mb-1 text-sm font-semibold text-brand-text">Take tips</p>
      <ul>
        {tips.good && (
          <li className="flex gap-3 border-t border-spark-rule py-2 text-sm first:border-t-0">
            <span className="w-10 shrink-0 font-bold text-green-700">✓</span><span>{tips.good}</span>
          </li>
        )}
        {list.map((t, i) => (
          <li key={i} className="flex gap-3 border-t border-spark-rule py-2 text-sm first:border-t-0">
            <b className="w-10 shrink-0 tabular-nums text-spark-amber">{t.at || "—"}</b><span>{t.tip}</span>
          </li>
        ))}
      </ul>
      {onRecordAgain && (
        <button type="button" onClick={onRecordAgain} className="mt-2 rounded-xl border border-spark-rule bg-white px-3.5 py-2 text-sm font-semibold text-brand-text hover:border-spark-amber">
          Record again
        </button>
      )}
    </div>
  );
}
