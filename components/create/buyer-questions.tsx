"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * What buyers in this market are asking AI, as topics (owner's mock,
 * 2026-10-15).
 *
 * One live question shows as the page opens, for the market from Settings or
 * the one typed in Details; Show more opens the rest. The questions come from
 * /api/tools/buyer-questions, looked up once a day per market. Record this
 * puts a question in the topic box, so the video answers what buyers type
 * into an assistant. The topic ideas ("Or try") come in as children, under a
 * dashed rule.
 */
export function BuyerQuestions({
  city,
  state,
  onPick,
  className = "",
  children,
}: {
  city: string;
  state: string;
  onPick: (topic: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const place = city.trim();
  const st = state.trim();

  useEffect(() => {
    setQuestions([]);
    setMore(false);
    setPicked(null);
    if (!place) return;
    let stop = false;
    // A moment's wait, so typing a city in Details does not look up every
    // letter of it.
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/tools/buyer-questions?city=${encodeURIComponent(place)}&state=${encodeURIComponent(st)}`)
        .then((r) => r.json().catch(() => ({})))
        .then((d) => { if (!stop && Array.isArray(d.questions)) setQuestions(d.questions); })
        .catch(() => {})
        .finally(() => { if (!stop) setLoading(false); });
    }, 700);
    return () => { stop = true; clearTimeout(t); };
  }, [place, st]);

  const shown = more ? questions : questions.slice(0, 1);

  return (
    // No card of its own since 2026-10-18: it sits inside step 1's one card.
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-[16px] font-bold leading-tight text-spark-ink">
            What buyers in {place || "your area"} ask AI
          </h3>
        </div>
        {questions.length > 1 && (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="rounded-md spark-cta-gradient px-2.5 py-1 text-[12.5px] font-semibold text-white"
          >
            {more ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-[1.4] text-spark-ink-muted">
        Answer these on video and you show up when buyers ask ChatGPT, Google or Siri.
      </p>

      {loading && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-spark-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Looking up {place}…
        </p>
      )}
      {!loading && !place && (
        <p className="mt-2 text-[13px] text-spark-ink-muted">Add your city in Details to see them.</p>
      )}

      {shown.length > 0 && (
        <ol className="mt-2 flex flex-col gap-1.5">
          {shown.map((q, i) => {
            const on = picked === q;
            return (
              // The whole row is the button (2026-10-18): only the Record this
              // pill used to respond, so tapping the question did nothing.
              <li
                key={q}
                role="button"
                tabIndex={0}
                onClick={() => { setPicked(q); onPick(q); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(q); onPick(q); } }}
                className="flex cursor-pointer items-center gap-2.5 rounded-[12px] border border-spark-rule bg-white px-2.5 py-1.5 transition-colors hover:border-spark-amber active:bg-spark-amber-tint"
              >
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-spark-paper text-[12px] font-bold text-spark-ink-soft">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold leading-[1.35] text-spark-ink">&ldquo;{q}&rdquo;</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPicked(q); onPick(q); }}
                  className={`flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                    on ? "border-green-300 bg-green-50 text-green-700" : "border-[#e2b97a] text-[#A3660F] hover:bg-spark-amber-tint"
                  }`}
                >
                  {on ? <Check size={12} /> : <span className="h-2 w-2 rounded-full bg-red-500" />}
                  {on ? "In topic box" : "Record this"}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {children && (
        <div className="mt-2.5 border-t border-dashed border-spark-rule pt-2">
          {children}
        </div>
      )}
    </section>
  );
}
