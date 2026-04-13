"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock,
  PlayCircle, Camera, Music2, AtSign, Globe,
  Layers, X, ExternalLink, Plus, RefreshCw,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths,
} from "date-fns";
import Link from "next/link";
import toast from "react-hot-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduledPost {
  id: string;
  platform: string;
  scheduledAt: string;
  status: string;
  caption?: string;
  videoTitle?: string;
  videoUrl?: string;
  blotato_post_id?: string;
}

// ─── Platform helpers ─────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  youtube:   { label: "YouTube",   icon: PlayCircle, color: "text-red-600",    bg: "bg-red-50" },
  instagram: { label: "Instagram", icon: Camera,     color: "text-pink-600",   bg: "bg-pink-50" },
  tiktok:    { label: "TikTok",    icon: Music2,     color: "text-slate-800",  bg: "bg-slate-100" },
  linkedin:  { label: "LinkedIn",  icon: AtSign,     color: "text-blue-700",   bg: "bg-blue-50" },
  twitter:   { label: "Twitter/X", icon: AtSign,     color: "text-sky-500",    bg: "bg-sky-50" },
  facebook:  { label: "Facebook",  icon: Globe,      color: "text-blue-600",   bg: "bg-blue-50" },
  threads:   { label: "Threads",   icon: Layers,     color: "text-slate-700",  bg: "bg-slate-100" },
  bluesky:   { label: "Bluesky",   icon: Layers,     color: "text-sky-600",    bg: "bg-sky-50" },
  pinterest: { label: "Pinterest", icon: Layers,     color: "text-red-500",    bg: "bg-red-50" },
  google:    { label: "Google",    icon: Globe,      color: "text-orange-500", bg: "bg-orange-50" },
};

function getPlatform(p: string) {
  return PLATFORM_META[p.toLowerCase()] ?? {
    label: p, icon: Layers, color: "text-slate-500", bg: "bg-slate-100",
  };
}

// ─── Post pill shown on calendar day ─────────────────────────────────────────

function PostPill({ post, onClick }: { post: ScheduledPost; onClick: () => void }) {
  const meta = getPlatform(post.platform);
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate hover:opacity-80 transition-opacity ${meta.bg} ${meta.color}`}
    >
      <Icon size={9} className="shrink-0" />
      <span className="truncate">{post.videoTitle || meta.label}</span>
    </button>
  );
}

// ─── Post detail drawer ───────────────────────────────────────────────────────

function PostDrawer({ post, onClose, onCancel }: {
  post: ScheduledPost;
  onClose: () => void;
  onCancel: (id: string) => void;
}) {
  const meta = getPlatform(post.platform);
  const Icon = meta.icon;
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch("/api/social/schedule", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.blotato_post_id ?? post.id }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      toast.success("Post cancelled");
      onCancel(post.id);
      onClose();
    } catch {
      toast.error("Could not cancel post");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.bg}`}>
              <Icon size={18} className={meta.color} />
            </div>
            <div>
              <p className="font-semibold text-brand-text text-sm">{meta.label}</p>
              <p className="text-xs text-slate-400">
                {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Title */}
        {post.videoTitle && (
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">VIDEO</p>
            <p className="text-sm text-brand-text font-medium">{post.videoTitle}</p>
          </div>
        )}

        {/* Caption */}
        {post.caption && (
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">CAPTION</p>
            <p className="text-sm text-slate-600 line-clamp-4">{post.caption}</p>
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-slate-400" />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            post.status === "scheduled" ? "bg-blue-100 text-blue-700" :
            post.status === "posted"    ? "bg-green-100 text-green-700" :
            post.status === "failed"    ? "bg-red-100 text-red-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
          </span>
        </div>

        {/* Actions */}
        {post.status === "scheduled" && (
          <Button
            variant="danger"
            size="sm"
            loading={cancelling}
            onClick={handleCancel}
            className="w-full"
          >
            Cancel Scheduled Post
          </Button>
        )}
        {post.videoUrl && (
          <a href={post.videoUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="w-full gap-2">
              <ExternalLink size={14} /> View Video
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social/schedule");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts ?? []);
      }
    } catch {
      toast.error("Could not load scheduled posts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ─── Calendar grid computation ──────────────────────────────────────────

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd    = endOfWeek(monthEnd,   { weekStartsOn: 0 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function postsForDay(day: Date) {
    return posts.filter((p) => isSameDay(new Date(p.scheduledAt), day));
  }

  function handleCancelPost(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  // ─── Platform filter ────────────────────────────────────────────────────

  const allPlatforms = Array.from(new Set(posts.map((p) => p.platform)));
  const [activePlatforms, setActivePlatforms] = useState<Set<string>>(new Set());

  function togglePlatform(p: string) {
    setActivePlatforms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  const filteredPosts = activePlatforms.size === 0
    ? posts
    : posts.filter((p) => activePlatforms.has(p.platform));

  // ─── Stats strip ────────────────────────────────────────────────────────

  const thisMonthPosts = posts.filter((p) => {
    const d = new Date(p.scheduledAt);
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
  });

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-text flex items-center gap-2">
            <CalendarDays size={22} className="text-primary-500" />
            Content Calendar
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {thisMonthPosts.length} post{thisMonthPosts.length !== 1 ? "s" : ""} scheduled in{" "}
            {format(currentMonth, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchPosts()}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={15} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link href="/create">
            <Button size="sm" className="gap-2">
              <Plus size={14} /> New Video
            </Button>
          </Link>
        </div>
      </div>

      {/* Platform filter pills */}
      {allPlatforms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Filter:</span>
          {allPlatforms.map((p) => {
            const meta = getPlatform(p);
            const Icon = meta.icon;
            const active = activePlatforms.has(p);
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? `${meta.bg} ${meta.color} border-transparent`
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <Icon size={11} />
                {meta.label}
              </button>
            );
          })}
          {activePlatforms.size > 0 && (
            <button
              onClick={() => setActivePlatforms(new Set())}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Calendar card */}
      <Card className="p-0 overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <h2 className="font-semibold text-brand-text text-base">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <RefreshCw size={16} className="animate-spin" /> Loading posts…
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dayPosts = filteredPosts.filter((p) => isSameDay(new Date(p.scheduledAt), day));
              const inMonth  = isSameMonth(day, currentMonth);
              const today    = isToday(day);

              return (
                <div
                  key={idx}
                  className={`min-h-[90px] p-1.5 border-b border-r border-slate-100 ${
                    !inMonth ? "bg-slate-50/50" : ""
                  } ${idx % 7 === 0 ? "border-l" : ""}`}
                >
                  {/* Day number */}
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    today
                      ? "bg-primary-500 text-white"
                      : inMonth
                      ? "text-brand-text"
                      : "text-slate-300"
                  }`}>
                    {format(day, "d")}
                  </div>

                  {/* Post pills */}
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map((p) => (
                      <PostPill key={p.id} post={p} onClick={() => setSelectedPost(p)} />
                    ))}
                    {dayPosts.length > 3 && (
                      <p className="text-[10px] text-slate-400 pl-1">
                        +{dayPosts.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <div className="text-center py-12">
          <CalendarDays size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No scheduled posts yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Create a video and schedule it to see it appear here
          </p>
          <Link href="/create">
            <Button size="sm" className="mt-4 gap-2">
              <Plus size={14} /> Create Your First Video
            </Button>
          </Link>
        </div>
      )}

      {/* Post detail drawer */}
      {selectedPost && (
        <PostDrawer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onCancel={handleCancelPost}
        />
      )}
    </div>
  );
}
