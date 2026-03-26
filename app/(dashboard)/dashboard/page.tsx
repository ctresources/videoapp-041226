import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Mic, Video, Share2, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { Suspense } from "react";

async function DashboardStats() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [videosResult, postsResult, profileResult] = await Promise.all([
    supabase.from("generated_videos").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
    supabase.from("social_posts").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("post_status", "posted"),
    supabase.from("profiles").select("full_name, credits_remaining, subscription_tier").eq("id", user!.id).single(),
  ]);

  const videoCount = videosResult.count;
  const postCount = postsResult.count;
  const profile = profileResult.data as { full_name: string | null; credits_remaining: number; subscription_tier: string } | null;

  const stats = [
    { label: "Videos Created", value: videoCount ?? 0, icon: Video, color: "text-primary-500", bg: "bg-primary-50" },
    { label: "Posts Published", value: postCount ?? 0, icon: Share2, color: "text-accent-500", bg: "bg-teal-50" },
    { label: "Credits Left", value: profile?.credits_remaining ?? 0, icon: TrendingUp, color: "text-secondary-500", bg: "bg-purple-50" },
  ];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">
          Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! 👋
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Ready to create your next viral video?
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-text">{value}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

async function RecentProjects() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: projectsData } = await supabase
    .from("projects")
    .select("id, title, status, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const projects = projectsData as Array<{ id: string; title: string; status: string; created_at: string }> | null;

  const statusVariant: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
    draft: "default",
    generating: "warning",
    ready: "success",
    posted: "info",
    error: "error",
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-brand-text">Recent Projects</h3>
        <Link href="/videos">
          <Button variant="ghost" size="sm" className="text-primary-500 gap-1">
            View all <ArrowRight size={14} />
          </Button>
        </Link>
      </div>

      {!projects?.length ? (
        <div className="text-center py-10">
          <Mic className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No videos yet</p>
          <p className="text-slate-400 text-xs mt-1">Record your first voice to get started</p>
          <Link href="/create">
            <Button size="sm" className="mt-4 gap-2">
              <Plus size={14} /> Create First Video
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/create/${p.id}`}>
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                    <Video size={16} className="text-primary-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-text truncate">{p.title}</p>
                    <p className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <Badge variant={statusVariant[p.status] ?? "default"} className="shrink-0 ml-2">
                  {p.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <Suspense fallback={
        <div className="space-y-4 mb-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      }>
        <DashboardStats />
      </Suspense>

      {/* Quick action */}
      <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-2xl p-6 mb-6 text-white">
        <h3 className="font-bold text-xl mb-1">Start Your First Video Blog</h3>
        <p className="text-primary-100 text-sm mb-4">
          Speak for 2 minutes. We'll turn it into a full video with script, SEO, and social posts.
        </p>
        <Link href="/create">
          <Button className="bg-white text-primary-600 hover:bg-primary-50 gap-2" size="md">
            <Mic size={16} /> Record My Voice
          </Button>
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-64" />}>
        <RecentProjects />
      </Suspense>
    </div>
  );
}
