import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { BarChart2, Video, Share2, TrendingUp, Eye, Heart, MessageCircle, Clock } from "lucide-react";

async function getAnalyticsData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [videosRes, postsRes, profileRes, statsRes] = await Promise.all([
    supabase
      .from("generated_videos")
      .select("id, video_type, render_status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("social_posts")
      .select("id, platform, post_status, posted_at, created_at, video_title, platform_post_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("credits_remaining, subscription_tier, created_at")
      .eq("id", user.id)
      .single(),
    // The latest figures the daily cron pulled from YouTube. Read through the
    // caller's session, which RLS limits to their own rows.
    supabase
      .from("video_stats")
      .select("social_post_id, views, likes, comments, fetched_at")
      .eq("user_id", user.id),
  ]);

  return {
    videos: videosRes.data ?? [],
    posts: postsRes.data ?? [],
    profile: profileRes.data,
    stats: statsRes.data ?? [],
  };
}

function StatCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={22} className={color} />
      </div>
      <div>
        <p className="text-2xl font-bold text-brand-text">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();

  if (!data) {
    return <div className="text-slate-500 text-sm">Please log in to view analytics.</div>;
  }

  const { videos, posts, stats } = data;

  interface StatRow { social_post_id: string; views: number; likes: number; comments: number; fetched_at: string }
  interface PostRow { id: string; video_title: string | null; platform_post_id: string | null; posted_at: string | null; post_status: string }
  const statRows = stats as StatRow[];
  const totalViews = statRows.reduce((n, s) => n + s.views, 0);
  const totalLikes = statRows.reduce((n, s) => n + s.likes, 0);
  const totalComments = statRows.reduce((n, s) => n + s.comments, 0);
  const lastFetched = statRows.length
    ? new Date(Math.max(...statRows.map((s) => new Date(s.fetched_at).getTime())))
    : null;

  // Joined here rather than in the query: one row per post, newest numbers
  // first, so the table reads as "what is doing well" rather than a list.
  const postById = new Map((posts as PostRow[]).map((p) => [p.id, p]));
  const ranked = statRows
    .map((s) => ({ stat: s, post: postById.get(s.social_post_id) }))
    .filter((r): r is { stat: StatRow; post: PostRow } => !!r.post)
    .sort((a, b) => b.stat.views - a.stat.views);

  const completedVideos = videos.filter((v: { render_status: string }) => v.render_status === "completed").length;
  const publishedPosts  = posts.filter((p: { post_status: string }) => p.post_status === "posted").length;
  const scheduledPosts  = posts.filter((p: { post_status: string }) => p.post_status === "scheduled").length;

  // Posts by platform
  const platformCounts: Record<string, number> = {};
  for (const p of posts as { platform: string }[]) {
    platformCounts[p.platform] = (platformCounts[p.platform] ?? 0) + 1;
  }
  const topPlatforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Videos by type
  const typeCounts: Record<string, number> = {};
  for (const v of videos as { video_type: string }[]) {
    typeCounts[v.video_type] = (typeCounts[v.video_type] ?? 0) + 1;
  }

  // Last 30 days activity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentVideos = videos.filter((v: { created_at: string }) => new Date(v.created_at) > thirtyDaysAgo).length;
  const recentPosts  = posts.filter((p: { created_at: string }) => new Date(p.created_at) > thirtyDaysAgo).length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-text flex items-center gap-2">
          <BarChart2 size={22} className="text-primary-500" />
          Spark Insights
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          What you&apos;ve made, and where it&apos;s been posted
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Videos Created"   value={videos.length}    sub={`${recentVideos} in the last 30 days`}  icon={Video}     color="text-primary-500"   bg="bg-primary-50" />
        <StatCard label="Posts Published"  value={publishedPosts}   sub={`${recentPosts} in the last 30 days`}   icon={Share2}    color="text-green-600"     bg="bg-green-50" />
        <StatCard label="Scheduled Posts"  value={scheduledPosts}   sub="waiting to go out"                     icon={Clock}     color="text-spark-blue"      bg="bg-spark-blue/10" />
        <StatCard label="Videos Rendered"  value={completedVideos}  sub="completed"                     icon={TrendingUp} color="text-spark-amber"   bg="bg-spark-amber-tint" />
      </div>

      {/* Platform breakdown */}
      {topPlatforms.length > 0 && (
        <Card>
          <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
            <Share2 size={16} className="text-slate-400" />
            Posts by Platform
          </h3>
          <div className="space-y-3">
            {topPlatforms.map(([platform, count]) => {
              const pct = Math.round((count / posts.length) * 100);
              return (
                <div key={platform}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-brand-text capitalize">{platform}</span>
                    <span className="text-sm text-slate-500">{count} post{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Video type breakdown */}
      {Object.keys(typeCounts).length > 0 && (
        <Card>
          <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
            <Video size={16} className="text-slate-400" />
            Videos by Type
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-brand-text">{count}</p>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">{type.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* YouTube performance — real numbers, refreshed daily by the cron. */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-semibold text-brand-text flex items-center gap-2">
            <Eye size={16} className="text-slate-400" />
            YouTube Performance
          </h3>
          <span className="text-xs text-slate-400 ml-auto">
            {lastFetched
              ? `Updated ${lastFetched.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : "Not fetched yet"}
          </span>
        </div>

        {statRows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Numbers appear the day after a video publishes to your connected channel. Videos
            published before September aren&apos;t counted.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {([
                ["Views", totalViews, Eye, "text-primary-500"],
                ["Likes", totalLikes, Heart, "text-spark-amber"],
                ["Comments", totalComments, MessageCircle, "text-green-600"],
              ] as [string, number, React.ElementType, string][]).map(([label, value, Icon, color]) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3">
                  <Icon size={14} className={`${color} mb-1`} />
                  <p className="text-xl font-bold text-brand-text tabular-nums">{value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    <th className="text-left font-medium pb-2">Video</th>
                    <th className="text-right font-medium pb-2">Views</th>
                    <th className="text-right font-medium pb-2">Likes</th>
                    <th className="text-right font-medium pb-2">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(({ stat, post }) => (
                    <tr key={stat.social_post_id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-700">
                        {post.platform_post_id ? (
                          <a
                            href={`https://www.youtube.com/watch?v=${post.platform_post_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary-600 hover:underline"
                          >
                            {post.video_title || "Untitled video"}
                          </a>
                        ) : (
                          post.video_title || "Untitled video"
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{stat.views.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{stat.likes.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{stat.comments.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
