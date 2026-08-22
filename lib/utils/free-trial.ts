import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Free-tier trial window — camera recording and every AI Tool are gated by
 * this, not by signup date. The clock starts when a free-tier user's first
 * video actually renders (profiles.first_video_generated_at, set once in
 * create-blog/route.ts), not at signup: someone who takes a week, or two
 * months, to get around to their free video isn't penalized for the delay,
 * and the clock simply never runs for someone who hasn't generated it yet.
 * Paid plans and admins are never gated.
 */
export const FREE_TRIAL_DAYS = 30;

const TRIAL_MS = FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;

export function freeTrialExpired(
  firstVideoGeneratedAt: string | null | undefined,
  tier: string | null | undefined,
): boolean {
  if (tier && tier !== "free") return false;
  if (!firstVideoGeneratedAt) return false; // clock hasn't started
  return Date.now() - new Date(firstVideoGeneratedAt).getTime() > TRIAL_MS;
}

/** Days left in the window, or null if the trial hasn't started (no video generated yet). */
export function freeTrialDaysLeft(firstVideoGeneratedAt: string | null | undefined): number | null {
  if (!firstVideoGeneratedAt) return null;
  const remainingMs = TRIAL_MS - (Date.now() - new Date(firstVideoGeneratedAt).getTime());
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

/**
 * One shared gate for every trial-limited route (camera recording, each AI
 * Tool). Fetches just enough profile to decide, and returns a ready-to-return
 * 403 NextResponse if the trial has expired, or null if the caller should
 * proceed — so every route makes the same one-line call instead of
 * re-deriving the fetch-and-check itself.
 */
export async function freeTrialGateResponse(userId: string): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role, subscription_tier, first_video_generated_at")
    .eq("id", userId)
    .single();

  const p = data as { role: string | null; subscription_tier: string | null; first_video_generated_at: string | null } | null;
  if (!p || p.role === "admin") return null;
  if (!freeTrialExpired(p.first_video_generated_at, p.subscription_tier)) return null;

  return NextResponse.json(
    { error: "Your 30-day free trial has ended. Pick a plan to keep using this.", code: "free_trial_expired" },
    { status: 403 },
  );
}
