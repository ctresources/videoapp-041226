import { FREE_IMAGES_BEFORE_VIDEO, FREE_RUNS_BEFORE_VIDEO, freeTrialLocked } from "@/lib/utils/free-trial";

/**
 * Whether Spark Tools opens for an account (2026-10-28), as one plain
 * decision so the page guard and the tests read the same rule:
 *   "open"            paid plan / admin, inside the 14 days after the free
 *                     video, or before it with a try or a free image left
 *   "spent_pre_video" before the free video, tries and free images all used
 *   "trial_ended"     the 14 days after the free video are over
 * The tools' own routes enforce the same allowance (lib/utils/free-trial.ts).
 */
export type ToolsState = "open" | "spent_pre_video" | "trial_ended";

export function toolsState(a: {
  paid: boolean;
  tier: string | null | undefined;
  firstVideoAt: string | null | undefined;
  runsUsed: number;
  imagesUsed: number;
}): ToolsState {
  if (a.paid) return "open";
  if (!freeTrialLocked(a.firstVideoAt, a.tier)) return "open";
  if (!a.firstVideoAt) {
    return a.runsUsed < FREE_RUNS_BEFORE_VIDEO || a.imagesUsed < FREE_IMAGES_BEFORE_VIDEO ? "open" : "spent_pre_video";
  }
  return "trial_ended";
}
