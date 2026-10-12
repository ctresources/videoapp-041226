import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SocialPublishError, postMetrics, profileUsername, uploadPostConfigured } from "@/lib/api/upload-post";
import { parseRef } from "@/lib/api/social-settle";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** The same starting line as the YouTube figures, so the two tell one story. */
const STATS_FROM = "2026-09-01";

/**
 * The platforms that report figures for a post. Google Business reports none
 * through the partner, so it is never asked.
 */
const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "x", "threads"];

/**
 * Posts looked up in one run. The partner allows 100 live lookups in five
 * minutes across the whole account; this leaves room for anything else that
 * asks during the same window.
 */
const PER_RUN = 80;
const AT_ONCE = 4;
/** Stop starting new lookups here, well inside maxDuration. */
const BUDGET_MS = 240_000;

interface PostRow {
  id: string;
  user_id: string;
  platform: string;
  platform_post_id: string | null;
  upload_request_id: string;
  posted_at: string | null;
}

/** The first of these names the platform actually reported, as a whole number. */
function figure(m: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = m[k];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return null;
}

/**
 * GET /api/cron/social-stats — daily Vercel Cron, beside the YouTube one.
 *
 * Reads views, likes, comments and shares for videos posted to the other
 * platforms and stores the latest figures in video_stats, one row per post,
 * overwritten each run.
 *
 * Each post is a live call to its platform, and those are rationed, so a run
 * takes the posts that have waited longest: never fetched first, then the
 * stalest. With more posts than one run covers, each is simply refreshed
 * every few days instead of daily.
 *
 * The platforms name their figures differently. "Views" is the platform's own
 * view count where it has one, and how many people the post reached where it
 * does not (Facebook). What each platform actually sent is kept in `metrics`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!uploadPostConfigured()) return NextResponse.json({ scanned: 0, skipped: "not configured" });

  const admin = createAdminClient();
  const { data } = await admin
    .from("social_posts")
    .select("id, user_id, platform, platform_post_id, upload_request_id, posted_at")
    .in("platform", PLATFORMS)
    .eq("post_status", "posted")
    .not("upload_request_id", "is", null)
    .gte("posted_at", STATS_FROM)
    .order("posted_at", { ascending: false })
    .limit(500);
  const posts = (data ?? []) as PostRow[];
  if (posts.length === 0) return NextResponse.json({ scanned: 0, updated: 0 });

  const { data: have } = await admin
    .from("video_stats")
    .select("social_post_id, fetched_at")
    .in("social_post_id", posts.map((p) => p.id));
  const fetchedAt = new Map(((have ?? []) as { social_post_id: string; fetched_at: string }[]).map((r) => [r.social_post_id, r.fetched_at]));

  // Never fetched first (newest of those first, as the query ordered them),
  // then whichever has gone longest without a look.
  const queue = [
    ...posts.filter((p) => !fetchedAt.has(p.id)),
    ...posts.filter((p) => fetchedAt.has(p.id)).sort((a, b) => fetchedAt.get(a.id)!.localeCompare(fetchedAt.get(b.id)!)),
  ].slice(0, PER_RUN);

  const started = Date.now();
  let updated = 0;
  let empty = 0;
  let failed = 0;
  let rationed = false;

  const one = async (p: PostRow) => {
    try {
      const ref = parseRef(p.upload_request_id);
      const found = await postMetrics({
        username: profileUsername(p.user_id),
        platform: p.platform,
        requestId: ref.requestId,
        platformPostId: p.platform_post_id ?? undefined,
      });
      const m = found?.metrics ?? {};
      const views = figure(m, "views", "video_views", "plays", "play_count", "impressions", "reach");
      const likes = figure(m, "likes", "like_count", "reactions");
      const comments = figure(m, "comments", "comment_count", "replies");
      const shares = figure(m, "shares", "share_count", "reposts", "retweets");

      if (views === null && likes === null && comments === null && shares === null) {
        empty += 1;
        // A post the platform gives no figures for (a personal LinkedIn
        // profile, say) is marked once, so it shows as a dash and stops
        // jumping the queue every day. Figures already held are never
        // replaced by this: one bad answer must not blank a good row.
        if (!fetchedAt.has(p.id)) {
          await admin.from("video_stats").upsert({
            social_post_id: p.id, user_id: p.user_id, platform: p.platform,
            platform_post_id: p.platform_post_id ?? found?.platformPostId ?? "",
            views: 0, likes: 0, comments: 0, shares: 0,
            metrics: { unavailable: true },
            fetched_at: new Date().toISOString(),
          }, { onConflict: "social_post_id" });
        }
        return;
      }

      const { error } = await admin.from("video_stats").upsert({
        social_post_id: p.id, user_id: p.user_id, platform: p.platform,
        platform_post_id: p.platform_post_id ?? found?.platformPostId ?? "",
        views: views ?? 0, likes: likes ?? 0, comments: comments ?? 0, shares: shares ?? 0,
        metrics: m,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "social_post_id" });
      if (error) throw new Error(error.message);
      updated += 1;
    } catch (err) {
      if (err instanceof SocialPublishError && err.status === 429) rationed = true;
      failed += 1;
      console.error(`[cron/social-stats] ${p.platform} post ${p.id}: ${err instanceof Error ? err.message : err}`);
    }
  };

  // A few at a time. Once the partner says "enough" or the clock runs down,
  // nothing new is started; whatever is left is first in line tomorrow.
  let next = 0;
  const worker = async () => {
    while (next < queue.length && !rationed && Date.now() - started < BUDGET_MS) {
      const p = queue[next];
      next += 1;
      await one(p);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));

  console.log(`[cron/social-stats] ${posts.length} posts, ${next} looked up, ${updated} updated, ${empty} without figures, ${failed} failed${rationed ? ", stopped at the lookup limit" : ""}`);
  return NextResponse.json({ scanned: posts.length, lookedUp: next, updated, empty, failed, rationed });
}
