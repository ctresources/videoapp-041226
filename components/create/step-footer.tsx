"use client";

import { ArrowLeft } from "lucide-react";

interface StepFooterProps {
  /** Omit for the first step, where there is nowhere back to go. */
  onBack?: () => void;
  backLabel?: string;
  /** Status line — what is missing, or what happens next. */
  hint?: React.ReactNode;
  /** The primary action. Passed in rather than configured, because each step's
   *  button differs in label, loading state and what it disables on. */
  children: React.ReactNode;
}

/**
 * The v2 fixed action bar, shared by both Create routes.
 *
 * Pinned so the primary action never scrolls away, and offset past the sidebar
 * on desktop so it lines up with the content rather than the viewport. Pages
 * using this need bottom padding of their own to keep their last card clear —
 * a fixed element is out of flow and will otherwise sit on top of it.
 */
export function StepFooter({ onBack, backLabel = "Back", hint, children }: StepFooterProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-spark-rule bg-spark-paper/95 backdrop-blur md:left-[184px]">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex flex-none items-center gap-1.5 rounded-full border border-spark-rule px-3.5 py-2 text-[13px] font-medium text-spark-ink-soft transition-colors hover:border-spark-amber hover:text-spark-amber"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            {backLabel}
          </button>
        )}
        {hint && (
          <p className="min-w-0 flex-1 truncate text-[13px] text-spark-ink-faint">{hint}</p>
        )}
        {!hint && <div className="min-w-0 flex-1" />}
        <div className="flex-none">{children}</div>
      </div>
    </div>
  );
}
