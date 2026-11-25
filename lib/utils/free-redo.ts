import { PAID_TIERS } from "@/lib/utils/plan-features";

/**
 * One free redo per project (2026-11-25, the owner's approved plan, after
 * Abby Vellucci made a second version of her Thanksgiving video and it used
 * a second video).
 *
 * The rule: on a paid plan, the first redo of a project within 48 hours of
 * its first video finishing doesn't use a video. A third video, or a redo
 * after 48 hours, uses one as usual. The first video stays in My Sparks.
 *
 * "First video" means one that used a video, or was free for another reason
 * the app records (credit_source is set on every charged or free-by-rule
 * render). Camera takes, classic photo reels and translations don't count.
 * A failed video never counts, and a failed free redo gives the redo back.
 *
 * Every route that makes a video on an existing project asks here, so the
 * rule lives in one place: start-render (avatar, Circle, Full AI Avatar,
 * Agent Intro), Cinematic AI Avatar, and the Cinematic and Scenes reels.
 */

export const FREE_REDO_HOURS = 48;
export const REDO_CREDIT_SOURCE = "redo_free";

export interface RedoRow {
  render_status: string | null;
  render_finished_at: string | null;
  created_at: string;
  source_video_id: string | null;
  credit_source: string | null;
}

/** The rule itself, on the project's videos. Pure, so it can be tested. */
export function redoIsFree(rows: RedoRow[], now: number = Date.now()): boolean {
  const live = rows.filter((r) => r.render_status !== "failed" && !r.source_video_id);
  if (live.some((r) => r.credit_source === REDO_CREDIT_SOURCE)) return false;
  const finished = live
    .filter((r) => r.render_status === "completed" && !!r.credit_source)
    .map((r) => Date.parse(r.render_finished_at ?? r.created_at))
    .filter((t) => Number.isFinite(t));
  if (finished.length === 0) return false;
  return now - Math.min(...finished) <= FREE_REDO_HOURS * 3600_000;
}

/**
 * Whether the next video on this project is a free redo. Asked before the
 * new video's row is written, so the row being made never counts itself.
 */
export async function freeRedoFor(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  projectId: string | null | undefined,
  tier: string | null | undefined,
): Promise<boolean> {
  if (!projectId || !PAID_TIERS.includes(tier ?? "free")) return false;
  const { data } = await admin
    .from("generated_videos")
    .select("render_status, render_finished_at, created_at, source_video_id, credit_source:metadata->>credit_source")
    .eq("project_id", projectId)
    .eq("user_id", userId);
  return redoIsFree((data ?? []) as RedoRow[]);
}
