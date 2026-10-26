/**
 * One status per video, in the same words everywhere (2026-10-26, the owner's
 * approved mockup): the AutoSparks card, My Sparks and the Publish window.
 *
 *   Draft → Made → Approved · posts Mon 3 PM → Posted     (a card posts it)
 *   Draft → Made → Scheduled · posts Fri 9 AM → Posted    (posted by hand)
 *
 * The middle step shows only when there is one. Account ticks come from what
 * really happened (social_posts), never from what was planned, so an account
 * is ticked only once the video is on it.
 */

export type StepState = "done" | "now" | "todo" | "failed";
export type TickState = "posted" | "scheduled" | "posting" | "failed" | "planned";

export interface PostRow {
  platform: string;
  post_status: string;
  scheduled_at?: string | null;
}

export interface VideoStatusInput {
  /** A video row exists, finished or not. */
  hasVideo: boolean;
  /** Finished, with a file to watch. */
  ready: boolean;
  failed?: boolean;
  /** An approved AutoSparks/Halo card that will post it by itself. */
  autoPost?: { slotAt: string; platforms: string[] } | null;
  posts: PostRow[];
}

export interface VideoStatus {
  steps: { label: string; state: StepState }[];
  /** One sentence under the steps, or null. */
  line: string | null;
  ticks: { platform: string; state: TickState }[];
}

export const PLATFORM_NAMES: Record<string, string> = {
  youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn",
  tiktok: "TikTok", x: "X", twitter: "X", threads: "Threads", bluesky: "Bluesky",
  pinterest: "Pinterest", google_business: "Google",
};

export function whenShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function tickOf(status: string, scheduledAt?: string | null): TickState {
  if (status === "posted") return "posted";
  if (status === "failed") return "failed";
  if (status === "scheduled" || (scheduledAt && Date.parse(scheduledAt) > Date.now())) return "scheduled";
  return "posting";
}

export function videoStatus(v: VideoStatusInput): VideoStatus {
  // Each account's best outcome: posted beats scheduled beats posting beats failed.
  const rank: Record<TickState, number> = { posted: 4, scheduled: 3, posting: 2, failed: 1, planned: 0 };
  const byPlatform = new Map<string, TickState>();
  let nextSchedule: string | null = null;
  for (const p of v.posts) {
    const key = p.platform === "twitter" ? "x" : p.platform;
    const t = tickOf(p.post_status, p.scheduled_at);
    if ((byPlatform.get(key) === undefined) || rank[t] > rank[byPlatform.get(key)!]) byPlatform.set(key, t);
    if (t === "scheduled" && p.scheduled_at && (!nextSchedule || p.scheduled_at < nextSchedule)) nextSchedule = p.scheduled_at;
  }
  if (v.autoPost) for (const p of v.autoPost.platforms) if (!byPlatform.has(p)) byPlatform.set(p, "planned");
  const ticks = Array.from(byPlatform, ([platform, state]) => ({ platform, state }));

  const anyPosted = ticks.some((t) => t.state === "posted");
  const anyPosting = ticks.some((t) => t.state === "posting");

  const steps: VideoStatus["steps"] = [
    { label: "Draft", state: v.hasVideo ? "done" : "now" },
    {
      label: v.failed ? "Failed" : v.hasVideo && !v.ready ? "Being made" : "Made",
      state: v.failed ? "failed" : !v.hasVideo ? "todo" : v.ready ? "done" : "now",
    },
  ];
  const middle = v.autoPost
    ? { label: `Approved · ${whenShort(v.autoPost.slotAt)}`, at: v.autoPost.slotAt, kind: "approved" as const }
    : nextSchedule ? { label: `Scheduled · ${whenShort(nextSchedule)}`, at: nextSchedule, kind: "scheduled" as const } : null;
  if (middle) steps.push({ label: middle.label, state: anyPosted ? "done" : v.ready ? "now" : "todo" });
  steps.push({ label: "Posted", state: anyPosted ? "done" : anyPosting ? "now" : "todo" });

  // The ready step is "now" only when nothing later has started.
  if (v.ready && !middle && !anyPosted && !anyPosting) steps[1].state = "now";

  let line: string | null = null;
  if (v.failed) line = "This video couldn't be made.";
  else if (!v.hasVideo) line = null;
  else if (!v.ready) line = "Your video is being made.";
  else if (middle?.kind === "approved" && !anyPosted) line = `Posts by itself ${whenShort(middle.at)}. Don't post it yourself.`;
  else if (middle?.kind === "scheduled" && !anyPosted) line = `Scheduled to post ${whenShort(middle.at)}.`;
  else if (ticks.some((t) => t.state === "failed")) line = "One account didn't take it. Try it again from Publish.";
  else if (!anyPosted && !anyPosting) line = "Made. Not posted yet.";

  return { steps, line, ticks };
}
