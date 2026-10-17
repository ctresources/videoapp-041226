"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface SettingsStep {
  /** The id of the section this step jumps to. */
  id: string;
  label: string;
  /** Already set up: shown with a tick instead of its number. */
  done?: boolean;
}

/**
 * The numbered bar across the top of a Settings tab (2026-10-17, the owner's
 * ask, after the Create page's steps). Stays at the top while scrolling, jumps
 * to a section when tapped, and highlights the section on screen.
 *
 * On a phone it scrolls sideways rather than wrapping, so it stays one line
 * while it is stuck to the top. overflow-y is hidden on purpose: a bar that
 * scrolls one way and not the other otherwise grows a stray vertical
 * scrollbar on Windows, which is what the old tab bar had.
 */
export function SettingsSteps({ steps }: { steps: SettingsStep[] }) {
  const [current, setCurrent] = useState(steps[0]?.id ?? "");
  const key = steps.map((s) => s.id).join("|");

  useEffect(() => {
    const els = steps
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      // A section counts as "the one you're on" once its top passes under the
      // bar and until it leaves the upper half of the screen.
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrent(id);
  }

  return (
    <nav
      aria-label="Sections on this page"
      className="sticky top-0 z-20 mb-6 overflow-x-auto overflow-y-hidden rounded-2xl border border-spark-rule bg-white/95 px-2 py-2 shadow-sm backdrop-blur sm:overflow-x-visible"
    >
      <ol className="flex min-w-max items-center gap-1 sm:min-w-0 sm:flex-wrap">
        {steps.map((s, i) => {
          const on = s.id === current;
          return (
            <li key={s.id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="text-spark-ink-faint">›</span>}
              <button
                type="button"
                onClick={() => go(s.id)}
                aria-current={on ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
                  on
                    ? "border-spark-amber bg-spark-amber-tint text-spark-ink"
                    : "border-transparent text-spark-ink-soft hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                    s.done
                      ? "bg-emerald-600 text-white"
                      : on
                        ? "bg-spark-amber text-white"
                        : "border border-slate-300 bg-white text-slate-500",
                  )}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
