"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, FileText, Film, ListChecks, Search } from "lucide-react";

/**
 * My Sparks' older items (2026-10-29, the owner's pick from the mockup).
 *
 * The last 10 days stay as big cards; everything older is one line each in
 * a box that opens and closes, newest first, by month, with search. The box
 * remembers whether it was left open. Select works here too, with the same
 * Select / Select all / Delete bar as the cards.
 */

export const RECENT_DAYS = 10;
/** With nothing from the last 10 days, this many stay big so the page isn't empty. */
const FALLBACK_RECENT = 6;
const PAGE = 20;

/** Splits a newest-first list into the big cards and the older list. */
export function splitRecent<T>(items: T[], dateOf: (i: T) => string, keepBig: (i: T) => boolean = () => false): [T[], T[]] {
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  let recent = items.filter((i) => keepBig(i) || Date.parse(dateOf(i)) >= cutoff);
  if (recent.length === 0) recent = items.slice(0, FALLBACK_RECENT);
  const big = new Set(recent);
  return [recent, items.filter((i) => !big.has(i))];
}

export interface OlderItem {
  id: string;
  title: string;
  /** ISO date. */
  at: string;
  thumbUrl?: string | null;
  /** "Posted · YouTube" (ok) or "Not posted". */
  chip?: { text: string; ok: boolean } | null;
  /** For the "Not posted" filter. */
  notPosted?: boolean;
  actions: ReactNode;
}

export function OlderList({
  kind, items, checking, isChecked, onCheck, onStartSelect, canSelect = true,
}: {
  kind: "videos" | "blogs";
  items: OlderItem[];
  /** Ticking rows (deleting, or picking posts for a newsletter). */
  checking: boolean;
  isChecked: (id: string) => boolean;
  onCheck: (id: string) => void;
  onStartSelect: () => void;
  canSelect?: boolean;
}) {
  const storeKey = `sparks-older-open-${kind}`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [onlyUnposted, setOnlyUnposted] = useState(false);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    try { setOpen(localStorage.getItem(storeKey) === "1"); } catch { /* closed */ }
  }, [storeKey]);
  // Ticking opens it, so nothing is selected out of sight.
  useEffect(() => { if (checking) setOpen(true); }, [checking]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storeKey, next ? "1" : "0"); } catch { /* fine */ }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => (!needle || i.title.toLowerCase().includes(needle)) && (!onlyUnposted || i.notPosted));
  }, [items, q, onlyUnposted]);
  const visible = filtered.slice(0, shown);

  if (items.length === 0) return null;
  const noun = kind === "videos" ? "videos" : "blogs";
  let lastMonth = "";

  return (
    <div className="mt-3 rounded-2xl border border-spark-rule bg-white">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <span className="text-[15px] font-semibold text-brand-text">Older {noun}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
        <span className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-[#A3660F]">
          {open ? "Hide" : "Show"} <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-spark-rule px-3 py-1.5">
              <Search size={14} className="text-slate-400" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
                placeholder={`Search older ${noun}`}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-brand-text outline-none" />
            </label>
            {kind === "videos" && (
              <div className="flex gap-1">
                {([[false, "All"], [true, "Not posted"]] as const).map(([v, label]) => (
                  <button key={label} type="button" onClick={() => { setOnlyUnposted(v); setShown(PAGE); }}
                    className={`rounded-lg border px-2.5 py-1 text-[13px] font-semibold ${onlyUnposted === v ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {canSelect && !checking && (
              <button type="button" onClick={onStartSelect}
                className="flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-2.5 py-1 text-[13px] font-semibold text-slate-600 hover:border-spark-amber">
                <ListChecks size={13} /> Select
              </button>
            )}
          </div>

          {visible.length === 0 && (
            <p className="border-t border-spark-rule px-4 py-4 text-[14px] text-slate-500">Nothing matches.</p>
          )}
          {visible.map((i) => {
            const d = new Date(i.at);
            const month = d.toLocaleString("en-US", { month: "long", year: "numeric" });
            const header = month !== lastMonth ? month : null;
            lastMonth = month;
            const checked = isChecked(i.id);
            return (
              <div key={i.id}>
                {header && (
                  <p className="border-t border-spark-rule bg-[#faf9f5] px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-wider text-slate-400">{header}</p>
                )}
                <div
                  className={`flex items-center gap-3 border-t border-spark-rule px-4 py-2.5 ${checking ? "cursor-pointer" : ""} ${checked ? "bg-spark-amber-tint" : ""}`}
                  onClick={checking ? () => onCheck(i.id) : undefined}
                >
                  {checking && (
                    <span role="checkbox" aria-checked={checked} aria-label={`Select ${i.title}`}
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[12px] text-white ${checked ? "border-[#A3660F] bg-[#A3660F]" : "border-[#d9c6a8] bg-white"}`}>
                      {checked && "✓"}
                    </span>
                  )}
                  <div className="flex h-[40px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-slate-700 to-slate-900">
                    {i.thumbUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={i.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : kind === "videos" ? <Film size={16} className="text-slate-400" /> : <FileText size={16} className="text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-brand-text">{i.title}</p>
                    <p className="text-[12px] text-slate-400">
                      {d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  {i.chip && (
                    <span className={`hidden whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold sm:inline ${i.chip.ok ? "bg-[#e8f5ee] text-[#0f7a52]" : "border border-spark-rule bg-[#faf9f5] text-slate-500"}`}>
                      {i.chip.text}
                    </span>
                  )}
                  {!checking && <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>{i.actions}</div>}
                </div>
              </div>
            );
          })}
          {filtered.length > shown && (
            <div className="border-t border-spark-rule p-3 text-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE)}
                className="rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-600 hover:border-spark-amber">
                Show {Math.min(PAGE, filtered.length - shown)} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
