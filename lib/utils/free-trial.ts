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

/** api_usage_log endpoint that marks one of those free runs. */
const FREE_RUN_ENDPOINT = "free_tool_run";

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
 * "block"   — camera recording and its uploads, which stay behind the video.
 */
export type PreVideoMode = "consume" | "allow" | "block";

/** How many of the free pre-video runs this account has spent. */
export async function freeRunsUsed(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("api_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("endpoint", FREE_RUN_ENDPOINT);
  return count ?? 0;
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
