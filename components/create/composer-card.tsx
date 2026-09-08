"use client";

import { useEffect, useState } from "react";

/**
 * One thing the brief needs — a checklist item, not a question.
 *
 * These used to show a question while blank ("What's it about?") and swap to a
 * short label once answered. That put a third "what is this video about?" on a
 * screen whose section heading already asked it and whose mic line asked it
 * again — one question in three wordings inside four inches, which reads as
 * three separate things being wanted rather than one.
 *
 * Nouns in both states now; the dot carries what the wording used to.
 */
export interface ComposerChip {
  /** Short name — "Town". */
  label: string;
  /** Whether the brief has this yet. */
  ok: boolean;
}

interface ComposerCardProps {
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
  chips,
  tryLines = [],
  showTryLine = false,
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
    <>
      {/* Rotating example, above the card as in the design — it is a prompt to
          the person, not a label on the field. Keyed on the index so each line
          animates in rather than the text swapping in place. */}
      {showTryLine && tryLines.length > 0 && (
        <div className="flex items-start gap-3">
          <span className="mt-1.5 flex-none text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A3660F]">
            Try
          </span>
          <p
            key={tryIdx}
            className="min-w-0 animate-slideDown font-display text-balance text-[21px] font-semibold leading-[1.28] tracking-[-0.01em] text-spark-ink sm:text-[24px]"
          >
            &ldquo;{tryLines[tryIdx % tryLines.length]}&rdquo;
          </p>
        </div>
      )}

      {/* Rounded at the top only. The Spark panel sits flush underneath and
          rounds the bottom, so the two read as one block — white where you
          write, paper where you choose — rather than two cards with a gap,
          which made picking an idea look like a different exercise from
          typing one when they fill the same field. */}
      <div className="rounded-t-[22px] border-[1.5px] border-b-0 border-spark-rule bg-white px-4 py-4 shadow-[0_2px_14px_rgba(44,44,42,0.05)]">
        {children}

        {/* One bottom row: what is still missing, and the way in. The chips are
            a checklist rather than field labels, so they sit under the input
            with the controls, not above it as headings. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold ${
                chip.ok
                  ? "border-spark-blue/25 bg-spark-blue/10 text-spark-blue"
                  : "border-spark-rule bg-[#faf8f2] text-spark-ink-muted"
              }`}
            >
              <span
                className={`block h-[5px] w-[5px] flex-none rounded-full ${
                  chip.ok ? "bg-spark-blue" : "bg-spark-ink-faint"
                }`}
              />
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
