"use client";

import Link from "next/link";

export type ReadyItem = {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
  /** Spark Video stays off while this is not ok. */
  blocks: boolean;
  fix?: { label: string; href?: string; onClick?: () => void };
};

/**
 * "Ready to make", above Spark Video (2026-10-26, usability sweep #4): every
 * reason the render would be refused, each with the button that fixes it,
 * before anything is charged.
 */
export function ReadyCheck({ items }: { items: ReadyItem[] }) {
  const blockers = items.filter((i) => !i.ok && i.blocks).length;
  return (
    <div className="mb-4 rounded-2xl border border-spark-rule bg-white px-4 py-3">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-spark-ink-faint">Ready to make</p>
      {items.map((it) => (
        <div key={it.label} className="flex flex-wrap items-center justify-between gap-2 border-t border-spark-rule/60 py-2 first:border-t-0">
          <span className="text-sm text-spark-ink">{it.label}</span>
          {it.ok ? (
            <span className="text-sm font-semibold text-emerald-700">✓ {it.okText}</span>
          ) : (
            <span className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${it.blocks ? "text-amber-700" : "text-spark-ink-faint"}`}>{it.badText}</span>
              {it.fix && (
                it.fix.href ? (
                  <Link href={it.fix.href} className="rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white">
                    {it.fix.label}
                  </Link>
                ) : (
                  <button type="button" onClick={it.fix.onClick} className="rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white">
                    {it.fix.label}
                  </button>
                )
              )}
            </span>
          )}
        </div>
      ))}
      {blockers > 0 && (
        <p className="mt-1 text-xs font-semibold text-amber-700">
          {blockers === 1 ? "One thing left" : `${blockers} things left`} before Spark Video. Nothing is charged until then.
        </p>
      )}
    </div>
  );
}
