"use client";

export interface PipelineStage {
  title: string;
  sub: string;
}

interface RenderPipelineProps {
  /** Format and market line above the title — "Reel · 9:16 · Ambler, PA". */
  queueLabel: string;
  /** What is being made. */
  title: string;
  stages: PipelineStage[];
  /** Index of the stage in progress. Everything before it reads as done. */
  activeIndex: number;
  /** Every stage finished. */
  complete?: boolean;
  /** Shown under the bar — what happens while this runs. */
  note?: string;
}

/**
 * The v2 generating card.
 *
 * The stages are stated, not animated: by the time this is on screen the first
 * two have genuinely happened, and the third is running on the server and
 * outlives the page. Nothing here polls, so nothing here pretends to — an
 * invented progress animation would be claiming knowledge the page does not
 * have, and would keep crawling forward after a render had already failed.
 */
export function RenderPipeline({
  queueLabel,
  title,
  stages,
  activeIndex,
  complete = false,
  note,
}: RenderPipelineProps) {
  // Each finished stage is worth an equal share; the one in progress shows a
  // partial slice so the bar is never flat at the start of a step.
  const pct = complete
    ? 100
    : Math.round(((activeIndex + 0.45) / stages.length) * 100);

  return (
    <div className="rounded-[18px] border border-spark-rule bg-white px-6 py-5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-spark-ink-muted">
        {queueLabel}
      </p>
      <p className="mt-2 text-[19px] font-semibold leading-[1.3] text-spark-ink">{title}</p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-spark-rule-soft">
        <div
          className="spark-cta-gradient h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 flex flex-col">
        {stages.map((stage, i) => {
          const done = complete || i < activeIndex;
          const active = !complete && i === activeIndex;
          return (
            <div
              key={stage.title}
              className="flex items-center gap-3.5 border-t border-spark-rule-soft py-3 first:border-t-0"
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                  done
                    ? "bg-spark-blue text-white"
                    : active
                      ? "bg-spark-amber text-white"
                      : "bg-spark-rule-soft text-spark-ink-faint"
                }`}
              >
                {done ? "✓" : active ? "◉" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[14px] font-semibold leading-tight ${
                    done || active ? "text-spark-ink" : "text-spark-ink-faint"
                  }`}
                >
                  {stage.title}
                </span>
                <span className="block text-[12px] text-spark-ink-muted">{stage.sub}</span>
              </span>
              <span
                className={`flex-none font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] ${
                  done ? "text-spark-blue" : active ? "text-spark-amber" : "text-spark-ink-faint"
                }`}
              >
                {done ? "Done" : active ? "Working" : "Queued"}
              </span>
            </div>
          );
        })}
      </div>

      {note && <p className="mt-3 text-[12.5px] leading-[1.45] text-spark-ink-muted">{note}</p>}
    </div>
  );
}
