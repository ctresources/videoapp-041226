"use client";

import toast from "react-hot-toast";

/**
 * The 30-day gate, surfaced as something you can act on.
 *
 * free-trial.ts has always returned a `code` alongside its message and
 * nothing ever read it, so every locked feature ended at a toast telling
 * someone their trial had expired with no way to do anything about it. The
 * out-of-videos path next door already does this properly — its own comment
 * says "offer the plan picker rather than a toast the user can't act on" —
 * and this is the same idea for the same problem.
 *
 * A link rather than a redirect: someone mid-task should choose when to leave,
 * and a page that navigates itself away from half-finished work is worse than
 * the toast it replaced.
 */
export const TRIAL_LOCK_CODES = ["free_trial_expired", "free_trial_not_started"];

export function isTrialLock(payload: unknown): boolean {
  const code = (payload as { code?: string } | null)?.code;
  return !!code && TRIAL_LOCK_CODES.includes(code);
}

/** Shows the lock toast. Returns true when it handled the error, so callers
 *  can `if (showTrialLock(data)) return;` before their generic handling. */
export function showTrialLock(payload: unknown): boolean {
  if (!isTrialLock(payload)) return false;

  const message = (payload as { error?: string }).error
    ?? "Your 30-day free trial has ended.";
  // "not started" is a different fix from "expired" — one needs a plan, the
  // other needs the free video that opens the window.
  const notStarted = (payload as { code?: string }).code === "free_trial_not_started";

  toast(
    (t) => (
      <span className="flex flex-wrap items-center gap-2">
        <span>{message}</span>
        <a
          href={notStarted ? "/create" : "/billing"}
          onClick={() => toast.dismiss(t.id)}
          className="font-semibold text-spark-amber underline underline-offset-2"
        >
          {notStarted ? "Make your free video" : "See plans"}
        </a>
      </span>
    ),
    { icon: "🔒", duration: 8000 },
  );
  return true;
}
