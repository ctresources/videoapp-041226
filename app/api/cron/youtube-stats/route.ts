import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVideoStats, getValidAccessToken } from "@/lib/api/youtube";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Where this account's real publishing starts. Videos posted before it are left
 * alone: their numbers are history nobody is watching, and fetching them would
 * fill the table with rows that never change again.
 */
const STATS_FROM = "2026-09-01";

/** YouTube's own ceiling on the id parameter, and one unit of quota per call. */
const BATCH = 50;

interface PostRow {
  id: string;
  user_id: string;
  platform_post_id: string;
}

/**
 * GET /api/cron/youtube-stats — daily Vercel Cron.
 *
 * Reads views, likes and comments for every YouTube video published since
 * STATS_FROM and stores the latest figures. One row per post, overwritten each
 * run — the owner asked for current numbers, not a history.
 *
 * Grouped by user because the access token is per account: one token fetch and
 * one batched stats call each, however many videos they have published.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data } = await admin
    .from("social_posts")
    .select("id, user_id, platform_post_id")
    .eq("platform", "youtube")
    .eq("post_status", "posted")
    .not("platform_post_id", "is", null)
    .gte("posted_at", STATS_FROM);

  const posts = (data ?? []) as PostRow[];
  if (posts.length === 0) {
    return NextResponse.json({ scanned: 0, updated: 0, accounts: 0 });
  }

  const byUser = new Map<string, PostRow[]>();
  for (const p of posts) {
    const list = byUser.get(p.user_id) ?? [];
    list.push(p);
    byUser.set(p.user_id, list);
  }

  let updated = 0;
  const failures: string[] = [];

  // Array.from, not a bare for..of over the Map: this project's TS target
  // predates direct Map iteration, and without it the inferred row types below
  // collapse to any as well.
  for (const [userId, userPosts] of Array.from(byUser.entries())) {
    try {
      // Refreshes and decrypts as needed; throws when the channel was never
      // connected or the connection has been revoked.
      const accessToken = await getValidAccessToken(userId, admin);

      for (let i = 0; i < userPosts.length; i += BATCH) {
        const slice = userPosts.slice(i, i + BATCH);
        const stats = await fetchVideoStats(accessToken, slice.map((p) => p.platform_post_id));
        const byVideoId = new Map(stats.map((s) => [s.videoId, s]));

        // Only what YouTube actually returned. A deleted or private video is
        // absent from the response and keeps whatever figures it already had,
        // rather than being overwritten with zeros.
        const rows = slice
          .map((p) => {
            const s = byVideoId.get(p.platform_post_id);
            if (!s) return null;
            return {
              social_post_id: p.id,
              user_id: p.user_id,
              platform: "youtube",
              platform_post_id: p.platform_post_id,
              views: s.views,
              likes: s.likes,
              comments: s.comments,
              fetched_at: new Date().toISOString(),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (rows.length > 0) {
          const { error } = await admin
            .from("video_stats")
            .upsert(rows, { onConflict: "social_post_id" });
          if (error) throw new Error(error.message);
          updated += rows.length;
        }
      }
    } catch (err) {
      // One disconnected channel must not stop every other account's refresh.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/youtube-stats] user ${userId}: ${msg}`);
      failures.push(userId);
    }
  }

  console.log(`[cron/youtube-stats] ${posts.length} posts, ${updated} updated, ${failures.length} account(s) failed`);
  return NextResponse.json({
    scanned: posts.length,
    updated,
    accounts: byUser.size,
    failed: failures.length,
  });
}
