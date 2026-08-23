"use client";

import { useEffect, useState } from "react";
import { Mic, Keyboard } from "lucide-react";

/** One thing the brief needs. Shows the question until it has an answer, then
 *  the short label — the v2 design's way of asking for four things without
 *  laying out four form rows. */
export interface ComposerChip {
  /** Short name once answered — "Where". */
  label: string;
  /** The question while still blank — "Which town?". */
  ask: string;
  /** Whether the brief has this yet. */
  ok: boolean;
}

interface ComposerCardProps {
  inputStyle: "speak" | "type";
  onInputStyleChange: (next: "speak" | "type") => void;
  chips: ComposerChip[];
  /** Rotating example lines, shown only while the brief is still empty. */
  tryLines?: string[];
  showTryLine?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * The v2 composer shell.
 *
 * Everything about *how* the brief gets captured stays in the components this
 * wraps — the conversational voice session and the typed field are unchanged.
 * This only supplies the surface the design asks for: one card instead of a
 * picker stacked above a separate box, a rotating example while the page is
 * cold, and the four reminder chips.
 *
 * The chips are fed from the Create page's own fields, not from anything this
 * component works out for itself. Trending topics and templates fill the same
 * fields, so a chip lighting up has to mean "the brief has this", not "voice
 * heard it" — the mock's client-side parsing of one spoken sentence would have
 * been wrong for every path except speaking.
 */
export function ComposerCard({
  inputStyle,
  onInputStyleChange,
  chips,
  tryLines = [],
  showTryLine = false,
  disabled = false,
  children,
}: ComposerCardProps) {
  const [tryIdx, setTryIdx] = useState(0);

  // Only runs while the line is actually on screen, so an idle Create tab is
  // not re-rendering every few seconds for something nobody can see.
  useEffect(() => {
    if (!showTryLine || tryLines.length < 2) return;
    const id = setInterval(() => setTryIdx((i) => i + 1), 3600);
    return () => clearInterval(id);
  }, [showTryLine, tryLines.length]);

  return (
    <div className="rounded-[20px] border-[1.5px] border-spark-rule bg-white px-4 py-4 shadow-[0_2px_14px_rgba(44,44,42,0.05)] sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.13em] text-spark-ink-muted">
          Your topic
        </p>

        {/* The speak-or-type choice, as a segmented control inside the card
            rather than the two big tiles that used to sit above it. Same
            decision, a quarter of the height — and next to the thing it
            actually changes. */}
        <div className="flex flex-none items-center gap-0.5 rounded-nav border border-spark-rule bg-spark-paper p-0.5">
          {([
            { key: "speak" as const, label: "Speak", Icon: Mic },
            { key: "type" as const, label: "Type", Icon: Keyboard },
          ]).map(({ key, label, Icon }) => {
            const active = inputStyle === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onInputStyleChange(key)}
                disabled={disabled}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "bg-white text-spark-ink shadow-[0_1px_2px_rgba(44,44,42,0.08)]"
                    : "text-spark-ink-muted hover:text-spark-ink"
                }`}
              >
                <Icon size={13} className={active ? "text-spark-amber" : undefined} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rotating example. Keyed on the index so each line animates in rather
          than the text swapping in place. */}
      {showTryLine && tryLines.length > 0 && (
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 flex-none font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-spark-amber">
            Try
          </span>
          <p
            key={tryIdx}
            className="min-w-0 animate-slideDown text-balance text-[19px] font-bold leading-[1.28] tracking-[-0.01em] text-spark-ink sm:text-[22px]"
          >
            &ldquo;{tryLines[tryIdx % tryLines.length]}&rdquo;
          </p>
        </div>
      )}

      {children}

      {/* Reminder chips. Deliberately below the input: they are a checklist of
          what is still missing, not labels for what to fill in next. */}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-spark-rule-soft pt-3">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                chip.ok
                  ? "border-spark-blue/25 bg-spark-blue/10 text-spark-blue"
                  : "border-spark-rule bg-spark-paper text-spark-ink-muted"
              }`}
            >
              <span
                className={`block h-[5px] w-[5px] flex-none rounded-full ${
                  chip.ok ? "bg-spark-blue" : "bg-spark-ink-faint"
                }`}
              />
              {chip.ok ? chip.label : chip.ask}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
