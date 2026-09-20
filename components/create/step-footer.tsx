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
        {/* Hidden on phones. Squeezed between Back and the primary button there
            is no room for it to say anything — it collapses to two words and an
            ellipsis, which is worse than the space it costs. */}
        {/* Two lines, not one.
            `truncate` cut every hint at whatever width was left beside the
            button — "…ready to paste into your site. You can t…" — so the
            sentence that says what pressing the button produces was the one
            thing on the bar nobody could read. Still clamped, because a hint
            that grows without limit would push the action off a small screen. */}
        {hint && (
          <p className="hidden min-w-0 flex-1 text-[12.5px] leading-[1.35] text-spark-ink-faint line-clamp-2 sm:block">
            {hint}
          </p>
        )}
        <div className="min-w-0 flex-1 sm:hidden" />
        {!hint && <div className="hidden min-w-0 flex-1 sm:block" />}
        <div className="flex-none">{children}</div>
      </div>
    </div>
  );
}
