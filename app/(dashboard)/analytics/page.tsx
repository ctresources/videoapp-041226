import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { BarChart2, Video, Share2, TrendingUp, Eye, Heart, MessageCircle, Clock } from "lucide-react";

async function getAnalyticsData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [videosRes, postsRes, profileRes] = await Promise.all([
    supabase
      .from("generated_videos")
      .select("id, video_type, render_status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("social_posts")
      .select("id, platform, post_status, posted_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("credits_remaining, subscription_tier, created_at")
      .eq("id", user.id)
      .single(),
  ]);

  return {
    videos: videosRes.data ?? [],
    posts: postsRes.data ?? [],
    profile: profileRes.data,
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

  const { videos, posts } = data;

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
          Analytics
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Your content performance at a glance
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Videos Created"   value={videos.length}    sub={`${recentVideos} this month`}  icon={Video}     color="text-primary-500"   bg="bg-primary-50" />
        <StatCard label="Posts Published"  value={publishedPosts}   sub={`${recentPosts} this month`}   icon={Share2}    color="text-green-600"     bg="bg-green-50" />
        <StatCard label="Scheduled Posts"  value={scheduledPosts}   sub="coming up"                     icon={Clock}     color="text-blue-500"      bg="bg-blue-50" />
        <StatCard label="Videos Rendered"  value={completedVideos}  sub="completed"                     icon={TrendingUp} color="text-purple-500"   bg="bg-purple-50" />
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

      {/* Coming soon: social metrics */}
      <Card className="border-dashed border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex gap-2">
            <Eye size={16} className="text-slate-300" />
            <Heart size={16} className="text-slate-300" />
            <MessageCircle size={16} className="text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-400">Social Performance Metrics</h3>
          <span className="text-xs bg-primary-100 text-primary-600 font-semibold px-2 py-0.5 rounded-full ml-auto">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Views, likes, comments, shares, and click-through rates from YouTube, Instagram, TikTok,
          and LinkedIn — pulled automatically from your connected platforms via Blotato.
        </p>
      </Card>
    </div>
  );
}
