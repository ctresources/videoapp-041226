import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Mic, Video, Plus, ArrowRight, CalendarDays, CheckCircle, Circle, Infinity, Film } from "lucide-react";
import { DraftQueue } from "@/components/dashboard/draft-queue";
import { FREE_RECORDINGS_BEFORE_VIDEO, freeRecordingsUsed, freeTrialLocked, freeTrialDaysLeft } from "@/lib/utils/free-trial";

/**
 * What the Dashboard had that Spark Insights did not, now at the top of Spark
 * Insights (2026-10-14, at the owner's ask: one page, called Spark Insights).
 * The Dashboard's own totals ("AI videos created", "posts published") were
 * left behind, since Insights already shows them, and so were the greeting
 * and its question.
 */

export async function DraftQueueWrapper({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("location_city, location_state")
    .eq("id", userId)
    .single();
  return (
    <DraftQueue
      city={profile?.location_city ?? undefined}
      state={profile?.location_state ?? undefined}
    />
  );
}

/** Videos left, camera recordings, and when it resets. */
export async function PlanBar({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, subscription_tier, current_period_end, role, first_video_generated_at")
    .eq("id", userId)
    .single();
  const profile = data as {
    credits_remaining: number; long_credits_remaining: number;
    purchased_short_videos: number; purchased_long_videos: number;
    subscription_tier: string; current_period_end: string | null;
    role: string | null; first_video_generated_at: string | null;
  } | null;

  const creditsLeft = (profile?.credits_remaining ?? 0) + (profile?.purchased_short_videos ?? 0);
  const longFormLeft = (profile?.long_credits_remaining ?? 0) + (profile?.purchased_long_videos ?? 0);
  const isAdmin = profile?.role === "admin";

  // What the camera routes will actually allow; see free-trial.ts.
  const trialLocked = !isAdmin && freeTrialLocked(profile?.first_video_generated_at, profile?.subscription_tier);
  const freeRecording = trialLocked && !profile?.first_video_generated_at
    ? (await freeRecordingsUsed(userId)) < FREE_RECORDINGS_BEFORE_VIDEO
    : false;
  const cameraLocked = trialLocked && !freeRecording;
  const trialDaysLeft = isAdmin ? null : freeTrialDaysLeft(profile?.first_video_generated_at);
  const onFreeTier = !["starter", "agent", "pro", "agency"].includes(profile?.subscription_tier ?? "free");
  const cameraLabel = isAdmin || !onFreeTier
    ? "∞ Camera Recordings"
    : freeRecording
      ? "1 Free Camera Recording"
      : cameraLocked
        ? (profile?.first_video_generated_at ? "Camera Recording Ended" : "Camera Unlocks With Your First Video")
        : `∞ Camera Recordings · ${trialDaysLeft} Day${trialDaysLeft === 1 ? "" : "s"} Left`;
  const videosLeftLabel = [
    `${creditsLeft} short video${creditsLeft !== 1 ? "s" : ""}`,
    longFormLeft > 0 ? `${longFormLeft} long video${longFormLeft !== 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(" · ") + " left";
  const periodEnd = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const pill = `text-xs font-medium px-2 py-0.5 rounded-full border ${cameraLocked ? "text-slate-500 bg-slate-50 border-slate-200" : "text-emerald-600 bg-emerald-50 border-emerald-200"}`;

  if (isAdmin) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm bg-spark-blue/10 border border-spark-blue/25">
        <div className="flex items-center gap-2 flex-wrap">
          <Infinity size={16} className="text-spark-blue" />
          <span className="font-semibold text-sm text-spark-blue">Admin-Unlimited</span>
          <span className={pill}>{cameraLabel}</span>
        </div>
        <span className="text-xs shrink-0 text-spark-blue">No limit on AI videos</span>
      </div>
    );
  }
  const tone = creditsLeft === 0 ? "red" : creditsLeft <= 1 ? "amber" : "blue";
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm ${
      tone === "red" ? "bg-red-50 border border-red-200" : tone === "amber" ? "bg-amber-50 border border-amber-200" : "bg-spark-blue/10 border border-spark-blue/20"
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Film size={15} className={tone === "red" ? "text-red-500" : tone === "amber" ? "text-amber-500" : "text-spark-blue"} />
        <span className={`font-semibold text-sm ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-spark-ink"}`}>
          {creditsLeft === 0 && longFormLeft === 0 ? "No AI Videos Remaining This Month" : videosLeftLabel}
        </span>
        <span className={pill}>{cameraLabel}</span>
      </div>
      <span className={`text-xs shrink-0 ${tone === "red" ? "text-red-500" : tone === "amber" ? "text-amber-500" : "text-spark-blue"}`}>
        {creditsLeft === 0
          ? <Link href="/settings/billing" className="underline font-medium">Upgrade Plan</Link>
          : periodEnd ? `Resets ${periodEnd}` : "Resets Monthly"}
      </span>
    </div>
  );
}

/** The setup checklist, until every step is done. */
export async function GettingStarted({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [profileResult, videoResult] = await Promise.all([
    supabase.from("profiles").select("heygen_voice_id, heygen_photo_id, youtube_channel_id").eq("id", userId).single(),
    supabase.from("generated_videos").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const profile = profileResult.data as {
    heygen_voice_id: string | null; heygen_photo_id: string | null; youtube_channel_id: string | null;
  } | null;
  const videoCount = videoResult.count ?? 0;

  const steps = [
    { label: "Create Your Account", done: true },
    { label: "Set Up Your Voice Clone", done: !!profile?.heygen_voice_id, href: "/settings" },
    // heygen_photo_id, not avatar_url: the tick has to mean what the render needs.
    { label: "Upload Your Avatar Photo", done: !!profile?.heygen_photo_id, href: "/settings" },
    { label: "Generate Your First Video", done: videoCount > 0, href: "/create" },
    { label: "Connect YouTube", done: !!profile?.youtube_channel_id, href: "/settings/social" },
  ];
  if (steps.every((s) => s.done)) return null;

  const completedCount = steps.filter((s) => s.done).length;
  const pct = Math.round((completedCount / steps.length) * 100);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-brand-text">Getting Started</p>
          <p className="text-xs text-slate-400">{completedCount} Of {steps.length} Complete</p>
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
                Set Up →
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Two ways straight on: make something, or see what's going out. */
export function QuickLinks() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="spark-banner-gradient rounded-2xl p-6 text-white">
        <h3 className="font-bold text-lg mb-3 text-spark-ink">Create a New Video</h3>
        <Link href="/create">
          <Button className="bg-white text-primary-600 hover:bg-primary-50 gap-2" size="md">
            <Mic size={16} /> Start Creating
          </Button>
        </Link>
      </div>
      <div className="spark-banner-gradient rounded-2xl p-6 text-white">
        <h3 className="font-bold text-lg mb-3 text-spark-ink">Content Calendar</h3>
        <Link href="/calendar">
          <Button className="bg-white text-primary-600 hover:bg-primary-50 gap-2" size="md">
            <CalendarDays size={16} /> View Calendar
          </Button>
        </Link>
      </div>
    </div>
  );
}

/** The five newest projects, to pick back up. */
export async function RecentProjects({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, title, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  const projects = data as Array<{ id: string; title: string; status: string; created_at: string }> | null;
  const statusVariant: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
    draft: "default", generating: "warning", ready: "success", posted: "info", error: "error",
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-brand-text">Recent Projects</h3>
        <Link href="/videos">
          <Button variant="ghost" size="sm" className="text-primary-500 gap-1">
            View All <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
      {!projects?.length ? (
        <div className="text-center py-10">
          <Mic className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No Videos Yet</p>
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
                <Badge variant={statusVariant[p.status] ?? "default"} className="shrink-0 ml-2">{p.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
