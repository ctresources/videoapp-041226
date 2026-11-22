import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAdminPerks } from "@/lib/utils/roles";
import { getAccessLevel, isAffiliateEligible } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import {
  FREE_BLOGS_BEFORE_VIDEO, FREE_IMAGES_BEFORE_VIDEO, FREE_RECORDINGS_BEFORE_VIDEO, FREE_RUNS_BEFORE_VIDEO,
  freeBlogsUsed, freeRecordingsUsed, freeRunsUsed, freeTrialLocked, isPreVideoAccount,
} from "@/lib/utils/free-trial";
import { CAMPAIGN_CALENDAR, hasFeature } from "@/lib/utils/feature-access";
import { IMAGE_MONTHLY_LIMIT, aiImagesUsedThisMonth } from "@/lib/utils/image-allowance";
import { videosPerMonth } from "@/lib/plan-limits";

/**
 * An account's allowance and access: videos left, plan, features, free-trial
 * state. The shared service behind GET /api/profile/allowance and the agent
 * layer's get_account (2026-11-22, moved out of the route unchanged so both
 * read the same numbers).
 *
 * `db` is whichever client the caller has: the route passes the user's
 * session client (as before); the agent layer passes the admin client, since
 * an AI client has no browser session. Both read only this user's rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function getAllowance(db: Db, userId: string, opts: { touchLastActive?: boolean } = {}) {
  const { data } = await db
    .from("profiles")
    .select(`${ALLOWANCE_SELECT}, subscription_tier, role, first_video_generated_at, last_seen_whats_new, current_period_end, last_active_at`)
    .eq("id", userId)
    .single();

  const profile = (data ?? {}) as Record<string, number | string | null>;

  // Opening the app counts as being back (2026-10-29): read by the account
  // cleanup job. Written at most once a day.
  if (opts.touchLastActive) {
    const seen = Date.parse(String(profile.last_active_at ?? "")) || 0;
    if (Date.now() - seen > 86_400_000) {
      await createAdminClient().from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId).then(() => {}, () => {});
    }
  }
  const isAdmin = hasAdminPerks(profile.role as string | null);
  /** The owner: Admin panel and owner-only tools. Staff get perks, not this. */
  const isRealAdmin = profile.role === "admin";
  const preVideo = isPreVideoAccount(profile as never);
  const tierAndRole = { subscription_tier: profile.subscription_tier as string | null, role: profile.role as string | null };

  // Grants live in feature_access, readable only by the service role, so
  // hasFeature uses the admin client whichever client `db` is.
  const [campaignCalendar, sparkPodcast, sparkreelsMode] = await Promise.all([
    hasFeature(userId, CAMPAIGN_CALENDAR),
    // Spark Podcast's switch (2026-10-30).
    hasFeature(userId, "spark_podcast"),
    // SparkReels mode (2026-11-01, lib/sparkreels-mode.ts).
    hasFeature(userId, "sparkreels_mode"),
  ]);
  // Quick Reels Templates: open to everyone since 2026-11-03.
  const videoTemplates = true;

  const imagesUsed = await aiImagesUsedThisMonth(db, userId);

  // Admins are genuinely uncapped (create-blog neither refuses nor charges
  // them), so report that as a flag rather than inventing a big number.
  return {
    unlimited: isAdmin,
    short: availableFor(profile as never, "short"),
    long: availableFor(profile as never, "long"),
    // For "Videos left this month: 2 of 7 · 1 bought" on AutoSparks (2026-10-24).
    shortPlanLeft: Number(profile.credits_remaining ?? 0),
    shortBought: Number(profile.purchased_short_videos ?? 0),
    shortPerMonth: videosPerMonth(profile.subscription_tier as string | null),
    tier: (profile.subscription_tier as string) ?? "free",
    isAdmin,
    isRealAdmin,
    isStaff: profile.role === "staff",
    // Free vs paid for the menu (lib/access.ts); the pages check again on the server.
    level: getAccessLevel(tierAndRole),
    // May use the Affiliate Program (paid, or canceled but paid through the period).
    affiliateEligible: isAffiliateEligible({ ...tierAndRole, current_period_end: profile.current_period_end as string | null }),
    // The newest What's New item this account has seen, for the menu's NEW dot.
    whatsNewSeen: (profile.last_seen_whats_new as string | null) ?? null,
    campaignCalendar,
    // Producer and up only (2026-10-30, the owner's call).
    sparkreelsMode,
    videoTemplates,
    sparkPodcast: sparkPodcast && ["producer", "influencer", "admin"].includes(getAccessLevel(tierAndRole)),
    // AI images made this calendar month, with the same ceiling the image route enforces.
    images: {
      used: imagesUsed,
      // Any paid plan has the hundred too (2026-11-06), as the image route does.
      limit: profile.first_video_generated_at || isAdmin || (!!profile.subscription_tier && profile.subscription_tier !== "free")
        ? IMAGE_MONTHLY_LIMIT
        : FREE_IMAGES_BEFORE_VIDEO,
    },
    // So the Create screen can mark the Blog post tile locked before it's picked.
    trialLocked: !isAdmin && freeTrialLocked(
      profile.first_video_generated_at as string | null,
      profile.subscription_tier as string | null,
    ),
    // Which lock it is: false when the free trial hasn't begun, true when it has.
    trialStarted: !!profile.first_video_generated_at,
    // Free tries left before the video; null once the video exists, or for an admin.
    freeRunsLeft: isAdmin || profile.first_video_generated_at
      ? null
      : Math.max(0, FREE_RUNS_BEFORE_VIDEO - (await freeRunsUsed(userId))),
    // The one free blog and camera recording before the free video; null where they don't apply.
    freeBlogLeft: preVideo
      ? Math.max(0, FREE_BLOGS_BEFORE_VIDEO - (await freeBlogsUsed(userId)))
      : null,
    freeRecordingLeft: preVideo
      ? Math.max(0, FREE_RECORDINGS_BEFORE_VIDEO - (await freeRecordingsUsed(userId)))
      : null,
  };
}

export type Allowance = Awaited<ReturnType<typeof getAllowance>>;
