"use client";

import { useEffect, useRef, useState } from "react";

export interface PipelineStage {
  title: string;
  sub: string;
}

/** Terminal states end the poll; anything else keeps it running. */
type RenderState = "rendering" | "completed" | "failed";

/**
 * Polls the render every 6s, matching what My Videos already does.
 *
 * Without this the card can only ever say "Working" — including for a render
 * that has already failed, which is the one case where saying nothing is
 * actively harmful.
 */
function useRenderStatus(renderJobId: string | null) {
  const [state, setState] = useState<RenderState>("rendering");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!renderJobId) return;

    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/video/status?renderId=${renderJobId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { status?: string; error?: string | null };
        if (cancelled) return;
        if (data.status === "completed" || data.status === "failed") {
          setState(data.status);
          setError(data.error ?? null);
          if (timer.current) clearInterval(timer.current);
        }
      } catch {
        // Network blips are not render failures — keep waiting.
      }
    }

    poll();
    timer.current = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [renderJobId]);

  return { state, error };
}

interface RenderPipelineProps {
  /** Format and market line above the title — "Reel · 9:16 · Ambler, PA". */
  queueLabel: string;
  /** What is being made. */
  title: string;
  stages: PipelineStage[];
  /** Index of the stage in progress. Everything before it reads as done. */
  activeIndex: number;
  /** Shown under the bar — what happens while this runs. */
  note?: string;
  /** HeyGen job to poll. Without one the last stage just reads as working. */
  renderJobId?: string | null;
  /** Told when the render finishes, so the page can offer what comes next. */
  onSettled?: (state: "completed" | "failed") => void;
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
  note,
  renderJobId = null,
  onSettled,
}: RenderPipelineProps) {
  const { state, error } = useRenderStatus(renderJobId);
  const complete = state === "completed";
  const failed = state === "failed";

  const settledRef = useRef(false);
  useEffect(() => {
    if (settledRef.current || state === "rendering") return;
    settledRef.current = true;
    onSettled?.(state);
  }, [state, onSettled]);

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
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            failed ? "bg-red-500" : "spark-cta-gradient"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 flex flex-col">
        {stages.map((stage, i) => {
          const isLast = i === activeIndex;
          const done = complete || i < activeIndex;
          const broke = failed && isLast;
          const active = !complete && !failed && isLast;
          return (
            <div
              key={stage.title}
              className="flex items-center gap-3.5 border-t border-spark-rule-soft py-3 first:border-t-0"
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                  broke
                    ? "bg-red-500 text-white"
                    : done
                      ? "bg-spark-blue text-white"
                      : active
                        ? "bg-spark-amber text-white"
                        : "bg-spark-rule-soft text-spark-ink-faint"
                }`}
              >
                {broke ? "!" : done ? "✓" : active ? "◉" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[14px] font-semibold leading-tight ${
                    done || active || broke ? "text-spark-ink" : "text-spark-ink-faint"
                  }`}
                >
                  {stage.title}
                </span>
                <span className="block text-[12px] text-spark-ink-muted">
                  {broke ? error || "Render failed" : stage.sub}
                </span>
              </span>
              <span
                className={`flex-none font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] ${
                  broke ? "text-red-600"
                    : done ? "text-spark-blue"
                      : active ? "text-spark-amber"
                        : "text-spark-ink-faint"
                }`}
              >
                {broke ? "Failed" : done ? "Done" : active ? "Working" : "Queued"}
              </span>
            </div>
          );
        })}
      </div>

      {complete && (
        <p className="mt-3 text-[12.5px] font-medium leading-[1.45] text-spark-blue">
          Your video is ready — it&apos;s waiting in My Videos.
        </p>
      )}
      {failed && (
        <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12.5px] leading-[1.45] text-red-700">
          {error || "The render failed."} Any credits it used have been returned.
        </p>
      )}
      {!complete && !failed && note && (
        <p className="mt-3 text-[12.5px] leading-[1.45] text-spark-ink-muted">{note}</p>
      )}
    </div>
  );
}
