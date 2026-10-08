import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Free-tier trial window — camera recording, every AI Tool, and the "My
 * Content & Listings" import features (paste script, PDF/URL extract,
 * listing parse/scrape) are all gated by this. Not by signup date, and not
 * open-by-default either: the window is UNLOCKED by generating the one free
 * video (profiles.first_video_generated_at, set once in create-blog/
 * route.ts), then runs for 30 days from that moment. Before that video is
 * generated, these features are locked — the free video itself has no
 * server-side gate and never expires while unused, but it's the only thing
 * that starts the clock. Paid plans and admins are never gated.
 *
 * This intentionally does NOT touch the core "AI Writes It" path
 * (generate-script / generate-location-script / create-blog) — those have to
 * stay open unconditionally, or nobody could ever generate the first video
 * that's supposed to unlock everything else.
 */
export const FREE_TRIAL_DAYS = 30;

/**
 * What an account may do BEFORE it makes its free video.
 *
 * The gate used to be absolute: no video, no tools. It is a reasonable rule
 * and a poor welcome — somebody who signs up to look around meets a wall on
 * the first screen they open, before anything has shown them the thing works.
 *
 * Two of each is enough to see that it does, costs pennies against the ~$6 the
 * free video itself costs, and runs out at the moment they want more — which
 * is the moment to ask for the video. Images are counted separately because
 * they are the half that costs real money.
 */
export const FREE_RUNS_BEFORE_VIDEO = 2;
export const FREE_IMAGES_BEFORE_VIDEO = 2;
/**
 * One blog and one camera recording, also before the video, at the owner's
 * ask. Both cards on the Create page used to be locked on day one, so the two
 * cheapest things the product makes were the two a new account could not try.
 * One of each is enough to see them work. Neither starts the 30 days: the
 * free video is still what unlocks everything, and after the one, each says
 * so.
 *
 * A "recording" is a take saved to My Sparks. Retakes before saving, and the
 * teleprompter script written for it, do not count.
 */
export const FREE_BLOGS_BEFORE_VIDEO = 1;
export const FREE_RECORDINGS_BEFORE_VIDEO = 1;

/** api_usage_log endpoint that marks one of those free runs. */
const FREE_RUN_ENDPOINT = "free_tool_run";
/** And the same for the one free blog and the one free recording. A marker
 *  row, not a count of what exists, so deleting the blog or the take does not
 *  hand the free one back. */
const FREE_BLOG_ENDPOINT = "free_blog";
const FREE_RECORDING_ENDPOINT = "free_recording";

const TRIAL_MS = FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * True when a free-tier account should be blocked from trial-gated features
 * right now — either it has never generated its free video (never unlocked)
 * or more than 30 days have passed since it did (window closed). Paid tiers
 * are never locked.
 */
export function freeTrialLocked(
  firstVideoGeneratedAt: string | null | undefined,
  tier: string | null | undefined,
): boolean {
  if (tier && tier !== "free") return false;
  if (!firstVideoGeneratedAt) return true; // never unlocked — no video generated yet
  return Date.now() - new Date(firstVideoGeneratedAt).getTime() > TRIAL_MS; // window closed
}

/** Days left in the window, or null if it hasn't started (no video generated yet). */
export function freeTrialDaysLeft(firstVideoGeneratedAt: string | null | undefined): number | null {
  if (!firstVideoGeneratedAt) return null;
  const remainingMs = TRIAL_MS - (Date.now() - new Date(firstVideoGeneratedAt).getTime());
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

/**
 * One shared gate for every trial-limited route. Fetches just enough
 * profile to decide, and returns a ready-to-return 403 NextResponse if the
 * feature is locked, or null if the caller should proceed — so every route
 * makes the same one-line call instead of re-deriving the fetch-and-check
 * itself.
 */
/**
 * How a route treats an account that has not made its free video yet.
 *
 * "consume" — an AI tool: allowed while free runs remain, and spends one.
 * "allow"   — the image generator, which counts its own five and must not
 *             also burn a text run for the same press.
 * "block"   — the article that writes itself for a recording, which waits to
 *             be asked for before the video.
 * "recording" — camera recording and its uploads: allowed while the one free
 *             recording is unspent. Spent by the save route, not here, so
 *             asking for an upload address does not use it up.
 */
export type PreVideoMode = "consume" | "allow" | "block" | "recording";

async function marksUsed(userId: string, endpoint: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("api_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  return count ?? 0;
}

async function mark(userId: string, endpoint: string): Promise<void> {
  await createAdminClient().from("api_usage_log").insert({
    user_id: userId,
    api_provider: "sparkreels",
    endpoint,
    credits_used: 0,
    response_status: 200,
  });
}

/** How many of the free pre-video runs this account has spent. */
export const freeRunsUsed = (userId: string) => marksUsed(userId, FREE_RUN_ENDPOINT);
export const freeBlogsUsed = (userId: string) => marksUsed(userId, FREE_BLOG_ENDPOINT);
export const freeRecordingsUsed = (userId: string) => marksUsed(userId, FREE_RECORDING_ENDPOINT);

/** An account the pre-video allowances are for: free tier, no video made yet. */
export function isPreVideoAccount(p: {
  role?: string | null; subscription_tier?: string | null; first_video_generated_at?: string | null;
} | null | undefined): boolean {
  if (!p || p.role === "admin") return false;
  if (p.subscription_tier && p.subscription_tier !== "free") return false;
  return !p.first_video_generated_at;
}

/** Whether a pre-video account still has its one free blog. */
export async function freeBlogAvailable(userId: string): Promise<boolean> {
  return (await freeBlogsUsed(userId)) < FREE_BLOGS_BEFORE_VIDEO;
}

/** The free blog has been written. */
export const markFreeBlog = (userId: string) => mark(userId, FREE_BLOG_ENDPOINT);

/**
 * A camera recording was saved. Marks the free one as used when that is what
 * it was; does nothing for a paid account, an admin, or one inside its 30
 * days, where recordings are not counted.
 */
export async function noteRecordingSaved(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role, subscription_tier, first_video_generated_at")
    .eq("id", userId)
    .single();
  if (isPreVideoAccount(data as never)) await mark(userId, FREE_RECORDING_ENDPOINT);
}

/**
 * The gate for the camera routes.
 *
 * The "recording" gate, with one exception: a take that is already saved is
 * always let through. A recording is kept on the device until the server
 * confirms it, and a save whose reply was lost is retried with the same
 * recovery id. Once the one free recording is spent, that retry would be
 * refused by the very save it is asking about, and the person would be told
 * their recording failed when it is sitting in My Sparks.
 */
export async function cameraGateResponse(
  userId: string,
  recoveryKey?: string | null,
): Promise<NextResponse | null> {
  const gate = await freeTrialGateResponse(userId, { preVideo: "recording" });
  if (!gate || !recoveryKey) return gate;
  const { data } = await createAdminClient()
    .from("generated_videos")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", recoveryKey)
    .maybeSingle();
  return data ? null : gate;
}

export async function freeTrialGateResponse(
  userId: string,
  { preVideo = "consume" }: { preVideo?: PreVideoMode } = {},
): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role, subscription_tier, first_video_generated_at")
    .eq("id", userId)
    .single();

  const p = data as { role: string | null; subscription_tier: string | null; first_video_generated_at: string | null } | null;
  if (!p || p.role === "admin") return null;
  if (!freeTrialLocked(p.first_video_generated_at, p.subscription_tier)) return null;

  const notStarted = !p.first_video_generated_at;

  // The one free camera recording, before the free video.
  if (notStarted && preVideo === "recording") {
    if ((await freeRecordingsUsed(userId)) < FREE_RECORDINGS_BEFORE_VIDEO) return null;
    return NextResponse.json(
      {
        error: "You've used your free camera recording. Make your free video — it costs nothing and unlocks unlimited recordings for 30 days.",
        code: "free_recording_spent",
      },
      { status: 403 },
    );
  }

  // The window before the free video, where a few runs are allowed.
  if (notStarted && preVideo !== "block") {
    const used = await freeRunsUsed(userId);
    if (used < FREE_RUNS_BEFORE_VIDEO) {
      if (preVideo === "consume") {
        // Recorded here rather than in each route, so the count and the
        // decision can never disagree about what a run is.
        await admin.from("api_usage_log").insert({
          user_id: userId,
          api_provider: "sparkreels",
          endpoint: FREE_RUN_ENDPOINT,
          credits_used: 0,
          response_status: 200,
        });
      }
      return null;
    }
    return NextResponse.json(
      {
        error: `You've used your ${FREE_RUNS_BEFORE_VIDEO} free tries. Make your free video — it costs nothing and unlocks everything for 30 days.`,
        code: "free_runs_spent",
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error: notStarted
        ? "Generate your free video first to unlock 30 days of camera recording and AI Tools."
        : "Your 30-day free trial has ended. Pick a plan to keep using this.",
      code: notStarted ? "free_trial_not_started" : "free_trial_expired",
    },
    { status: 403 },
  );
}
