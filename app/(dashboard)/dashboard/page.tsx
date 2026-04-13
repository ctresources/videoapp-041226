import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Mic, Video, Share2, TrendingUp, Plus, ArrowRight, CalendarDays, CheckCircle, Circle } from "lucide-react";
import { Suspense } from "react";
import { TrendingTopics } from "@/components/dashboard/trending-topics";

async function DashboardStats() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [videosResult, postsResult, profileResult] = await Promise.all([
    supabase.from("generated_videos").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
    supabase.from("social_posts").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("post_status", "posted"),
    supabase.from("profiles").select("full_name, credits_remaining, subscription_tier, location_city, location_state").eq("id", user!.id).single(),
  ]);

  const videoCount = videosResult.count;
  const postCount = postsResult.count;
  const profile = profileResult.data as {
    full_name: string | null;
    credits_remaining: number;
    subscription_tier: string;
    location_city: string | null;
    location_state: string | null;
  } | null;

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

      {/* Trending Topics widget — client component, uses user's saved city/state */}
      <Card className="mb-6">
        <TrendingTopics
          city={profile?.location_city ?? undefined}
          state={profile?.location_state ?? undefined}
        />
      </Card>
    </>
  );
}

async function GettingStarted() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [profileResult, videoResult, socialResult] = await Promise.all([
    supabase.from("profiles").select("voice_clone_id, heygen_photo_id, avatar_url, onboarding_done").eq("id", user!.id).single(),
    supabase.from("generated_videos").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
    supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("is_active", true),
  ]);

  const profile = profileResult.data as { voice_clone_id: string | null; heygen_photo_id: string | null; avatar_url: string | null; onboarding_done: boolean } | null;
  const videoCount = videoResult.count ?? 0;
  const socialCount = socialResult.count ?? 0;

  const steps = [
    { label: "Create your account", done: true },
    { label: "Set up your voice clone", done: !!profile?.voice_clone_id, href: "/settings" },
    { label: "Upload your avatar photo", done: !!profile?.avatar_url, href: "/settings" },
    { label: "Generate your first video", done: videoCount > 0, href: "/create" },
    { label: "Connect a social account", done: socialCount > 0, href: "/settings/social" },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null; // Hide once complete

  const completedCount = steps.filter((s) => s.done).length;
  const pct = Math.round((completedCount / steps.length) * 100);

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-brand-text">Getting Started</p>
          <p className="text-xs text-slate-400">{completedCount} of {steps.length} complete</p>
        </div>
        <span className="text-xs font-bold text-primary-500">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4">
        <div className="h-1.5 bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-col gap-2">
        {steps.map(({ label, done, href }) => (
          <div key={label} className={`flex items-center gap-3 text-sm ${done ? "text-slate-400" : "text-brand-text"}`}>
            {done
              ? <CheckCircle size={16} className="text-accent-500 shrink-0" />
              : <Circle size={16} className="text-slate-300 shrink-0" />}
            <span className={done ? "line-through" : ""}>{label}</span>
            {!done && href && (
              <Link href={href} className="ml-auto text-xs text-primary-500 hover:underline shrink-0">
                Set up →
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
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

      <Suspense fallback={null}>
        <GettingStarted />
      </Suspense>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-2xl p-6 text-white">
          <h3 className="font-bold text-lg mb-1">Create a New Video</h3>
          <p className="text-primary-100 text-sm mb-4">
            Record your voice or pick a template — we handle the rest.
          </p>
          <Link href="/create">
            <Button className="bg-white text-primary-600 hover:bg-primary-50 gap-2" size="md">
              <Mic size={16} /> Start Creating
            </Button>
          </Link>
        </div>
        <div className="bg-gradient-to-r from-teal-500 to-accent-500 rounded-2xl p-6 text-white">
          <h3 className="font-bold text-lg mb-1">Content Calendar</h3>
          <p className="text-teal-100 text-sm mb-4">
            View and manage all your scheduled posts across every platform.
          </p>
          <Link href="/calendar">
            <Button className="bg-white text-teal-600 hover:bg-teal-50 gap-2" size="md">
              <CalendarDays size={16} /> View Calendar
            </Button>
          </Link>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-64" />}>
        <RecentProjects />
      </Suspense>
    </div>
  );
}
