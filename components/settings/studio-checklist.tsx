"use client";

import Link from "next/link";

export interface StudioItem {
  label: string;
  done: boolean;
  /** A section id on this page, or a path to another page. */
  target: string;
  /** The button's word when it isn't done. */
  action: string;
  /** Labelled "(optional)". */
  optional?: boolean;
}

/**
 * "Your studio: X of 8 ready" at the top of Settings (2026-10-26, the owner's
 * usability sweep #7). Each missing item jumps to the section that sets it.
 */
export function StudioChecklist({ items }: { items: StudioItem[] }) {
  // All eight count, as the approved mockup showed ("6 of 8"); optional only changes the label.
  const counted = items;
  const ready = counted.filter((i) => i.done).length;
  const total = counted.length;
  const left = total - ready;
  const pct = total ? Math.round((ready / total) * 100) : 0;
  const half = Math.ceil(items.length / 2);
  const cols = [items.slice(0, half), items.slice(half)];

  function go(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section aria-label="Your studio" className="rounded-2xl border border-spark-rule bg-white px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold text-spark-ink">Your studio: {ready} of {total} ready</h2>
        <span className="text-sm text-spark-ink-faint">{left === 0 ? "All set" : `${left} to go`}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-spark-amber transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        {cols.map((col, ci) => (
          <ul key={ci}>
            {col.map((it) => (
              <li key={it.label} className="flex items-center justify-between gap-2 border-b border-spark-rule/60 py-2 last:border-b-0">
                <span className="text-sm text-spark-ink">
                  {it.label}
                  {it.optional && <span className="text-spark-ink-faint"> (optional)</span>}
                </span>
                {it.done ? (
                  <span className="text-sm font-semibold text-emerald-700">✓</span>
                ) : it.target.startsWith("/") ? (
                  <Link href={it.target} className="rounded-lg bg-spark-amber px-3 py-1 text-xs font-semibold text-white">
                    {it.action}
                  </Link>
                ) : (
                  <button type="button" onClick={() => go(it.target)} className="rounded-lg bg-spark-amber px-3 py-1 text-xs font-semibold text-white">
                    {it.action}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
