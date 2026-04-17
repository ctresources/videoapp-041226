"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PublishModal } from "@/components/social/PublishModal";
import { VideoPreviewModal } from "@/components/videos/VideoPreviewModal";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Video, Share2, Download, RefreshCw, Clock, CheckCircle,
  XCircle, Send, Pencil, Sparkles, Play, Trash2, AlertTriangle, Film,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import toast from "react-hot-toast";

interface GeneratedVideo {
  id: string;
  video_url: string | null;
  video_type: string;
  render_provider: string;
  render_status: string;
  render_job_id: string | null;
  duration_seconds: number | null;
  created_at: string;
  project_id: string;
  projects?: { title: string } | null;
}

interface RenderProgress {
  progressPct: number;   // 0–100
  status: string;
  url?: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "warning" | "success" | "error"; icon: React.ElementType }> = {
  pending:   { label: "In queue",     variant: "default",  icon: Clock },
  rendering: { label: "Processing…",  variant: "warning",  icon: RefreshCw },
  completed: { label: "Ready",        variant: "success",  icon: CheckCircle },
  failed:    { label: "Failed",       variant: "error",    icon: XCircle },
};

const typeLabel: Record<string, string> = {
  blog_long:    "Blog Video",
  reel_9x16:    "Reel / Short",
  youtube_16x9: "YouTube",
  short_1x1:    "Square",
};

const ESTIMATED_SECS: Record<string, number> = {
  reel_9x16:    900,
  short_1x1:    900,
  blog_long:    1200,
  youtube_16x9: 1500,
};

function useElapsedSeconds(startedAt: string, active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, active]);
  return elapsed;
}

function RenderProgressBar({ video }: { video: GeneratedVideo }) {
  const [progress, setProgress] = useState<RenderProgress>({ progressPct: 0, status: video.render_status });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useElapsedSeconds(video.created_at, progress.status === "rendering" || progress.status === "pending");
  const estimated = ESTIMATED_SECS[video.video_type] || 180;

  // Time-based fallback progress (fills over estimated duration)
  const timePct = Math.min(99, Math.round((elapsed / estimated) * 100));
  const displayPct = progress.progressPct > 0 ? progress.progressPct : timePct;
  const remaining = Math.max(0, estimated - elapsed);
  const remainingLabel = remaining >= 60
    ? `~${Math.ceil(remaining / 60)} min left`
    : `~${remaining}s left`;

  useEffect(() => {
    if (!video.render_job_id) return;
    if (video.render_status === "completed" || video.render_status === "failed") return;

    async function poll() {
      try {
        const res = await fetch(`/api/video/status?renderId=${video.render_job_id}`);
        if (!res.ok) return;
        const data = await res.json() as RenderProgress;
        setProgress(data);
        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Reload page to show final state
          window.location.reload();
        }
      } catch { /* silent */ }
    }

    poll();
    intervalRef.current = setInterval(poll, 6000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [video.render_job_id, video.render_status]);

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <RefreshCw size={11} className="animate-spin text-primary-500" />
          Rendering…
        </span>
        <span className="font-medium text-primary-600">{displayPct}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-1000"
          style={{ width: `${displayPct}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 text-right">{remainingLabel}</p>
    </div>
  );
}

function DeleteVideoModal({
  video,
  onClose,
  onConfirm,
  isDeleting,
}: {
  video: GeneratedVideo;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = typed.trim().toLowerCase() === "delete" && !isDeleting;
  const title = (video.projects as { title: string } | null)?.title || "Untitled Video";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, isDeleting]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient top accent */}
        <div className="h-1.5 bg-gradient-to-r from-red-500 via-rose-500 to-red-600" />

        <div className="p-6">
          {/* Icon header */}
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-brand-text">Delete this video?</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Video title card */}
          <div className="mb-5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-medium mb-1">
              Video
            </p>
            <p className="text-sm font-medium text-brand-text truncate">{title}</p>
          </div>

          {/* Type-to-confirm */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Type <span className="font-mono font-semibold text-red-600">delete</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="delete"
              autoFocus
              disabled={isDeleting}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={!canConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300 disabled:cursor-not-allowed gap-1.5"
            >
              {isDeleting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={14} /> Delete Video
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideosContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingVideo, setPublishingVideo] = useState<GeneratedVideo | null>(null);
  const [previewVideo, setPreviewVideo] = useState<GeneratedVideo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<GeneratedVideo | null>(null);

  async function handleDelete(videoId: string) {
    setDeletingId(videoId);
    try {
      const res = await fetch("/api/video/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Could not delete video");
      } else {
        toast.success("Video deleted");
        setVideos((prev) => prev.filter((v) => v.id !== videoId));
        setVideoToDelete(null);
      }
    } finally {
      setDeletingId(null);
    }
  }

  const loadVideos = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("generated_videos")
      .select("*, projects(title)")
      .order("created_at", { ascending: false })
      .limit(50);

    setVideos((data as unknown as GeneratedVideo[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  function handleCopyLink(videoUrl: string) {
    navigator.clipboard.writeText(videoUrl);
    toast.success("Video link copied!");
  }

  const renderingVideos = videos.filter(
    (v) => v.render_status === "rendering" || v.render_status === "pending"
  );
  const hasRendering = renderingVideos.length > 0;

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-brand-text">My Videos</h2>
          <p className="text-sm text-slate-500 mt-0.5">{videos.length} video{videos.length !== 1 ? "s" : ""} total</p>
        </div>
        <Link href="/create">
          <Button size="sm" className="gap-2">
            <Plus size={15} /> New Video
          </Button>
        </Link>
      </div>

      {/* "Create another while rendering" banner */}
      {hasRendering && (
        <div className="mb-5 flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-primary-500 shrink-0" />
            <p className="text-sm text-primary-800 font-medium">
              {renderingVideos.length === 1 ? "1 video is" : `${renderingVideos.length} videos are`} rendering in the background —
              {" "}<span className="text-primary-600">you can create another one right now!</span>
            </p>
          </div>
          <Link href="/create" className="shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5 text-primary-700 border-primary-300 hover:bg-primary-100">
              <Plus size={13} /> Create Another
            </Button>
          </Link>
        </div>
      )}

      {videos.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Video className="w-12 h-12 text-slate-300 mb-3" />
          <p className="font-semibold text-brand-text">No videos yet</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Create your first voice recording to generate a video</p>
          <Link href="/create">
            <Button className="gap-2"><Plus size={15} /> Create First Video</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => {
            const status = statusConfig[video.render_status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const isHighlighted = video.id === highlightId;
            const isRendering = video.render_status === "rendering" || video.render_status === "pending";

            return (
              <Card
                key={video.id}
                padding="none"
                className={`overflow-hidden transition-all ${isHighlighted ? "ring-2 ring-primary-500" : ""}`}
              >
                {/* Thumbnail / preview */}
                <div
                  className={`aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden ${video.render_status === "completed" && video.video_url ? "cursor-pointer group" : ""}`}
                  onClick={() => video.render_status === "completed" && video.video_url && setPreviewVideo(video)}
                >
                  {video.render_status === "completed" && video.video_url ? (
                    <>
                      <video
                        src={video.video_url}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                      />
                      {/* Play overlay on hover */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all">
                        <div className="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 flex items-center justify-center transition-all scale-75 group-hover:scale-100">
                          <Play size={22} className="text-transparent group-hover:text-slate-800 ml-1 transition-colors" fill="currentColor" />
                        </div>
                      </div>
                    </>
                  ) : isRendering ? (
                    <>
                      {/* Animated gradient placeholder */}
                      <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-slate-900 to-primary-800" />
                      {/* Shimmer overlay */}
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: "linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                          backgroundSize: "200% 100%",
                          animation: "shimmer 2.5s infinite",
                        }}
                      />
                      {/* Pulsing rings */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="absolute w-20 h-20 rounded-full border-2 border-primary-400/30 animate-ping" />
                        <div className="absolute w-16 h-16 rounded-full border-2 border-primary-300/40 animate-ping" style={{ animationDelay: "0.5s" }} />
                      </div>
                      {/* Center content */}
                      <div className="relative flex flex-col items-center gap-2 text-white z-10">
                        <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                          <Film size={24} className="text-primary-200" />
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                          <RefreshCw size={11} className="animate-spin text-primary-300" />
                          <span className="text-xs font-medium text-white">Generating…</span>
                        </div>
                      </div>
                      <style jsx>{`
                        @keyframes shimmer {
                          0% { background-position: 200% 0; }
                          100% { background-position: -200% 0; }
                        }
                      `}</style>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      {video.render_status === "failed" ? (
                        <XCircle size={28} className="text-red-400" />
                      ) : (
                        <Video size={28} />
                      )}
                    </div>
                  )}
                  {/* Type badge */}
                  <div className="absolute top-2 left-2">
                    <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-md">
                      {typeLabel[video.video_type] || video.video_type}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <p className="font-medium text-sm text-brand-text truncate mb-1">
                    {(video.projects as { title: string } | null)?.title || "Untitled Video"}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon
                        size={13}
                        className={
                          video.render_status === "completed" ? "text-accent-500" :
                          video.render_status === "failed" ? "text-red-400" :
                          "text-yellow-500"
                        }
                      />
                      <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(video.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Render progress bar */}
                  {isRendering && <RenderProgressBar video={video} />}

                  {/* Actions */}
                  {video.render_status === "completed" && video.video_url && (
                    <div className="flex flex-col gap-2 mt-3">
                      {/* Preview is the primary CTA — publish/download live inside the preview modal */}
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => setPreviewVideo(video)}
                      >
                        <Play size={13} fill="currentColor" /> Preview Video
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => setPublishingVideo(video)}
                        >
                          <Send size={13} /> Publish
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLink(video.video_url!)}
                          title="Copy link"
                        >
                          <Share2 size={13} />
                        </Button>
                        <a href={video.video_url} download target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" title="Download">
                            <Download size={13} />
                          </Button>
                        </a>
                      </div>
                      <Link href={`/editor/${video.id}`}>
                        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-slate-400 hover:text-slate-600">
                          <Pencil size={12} /> Edit & Re-render
                        </Button>
                      </Link>
                    </div>
                  )}

                  {/* Failed state */}
                  {video.render_status === "failed" && (
                    <div className="mt-3 flex gap-2">
                      <Link href="/create" className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5 text-red-600 border-red-200">
                          <Plus size={13} /> Try Again
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVideoToDelete(video)}
                        disabled={deletingId === video.id}
                        className="text-slate-400 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  )}

                  {/* Delete button for all non-rendering states */}
                  {!isRendering && video.render_status !== "failed" && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVideoToDelete(video)}
                        disabled={deletingId === video.id}
                        className="text-slate-300 hover:text-red-500 gap-1 text-xs"
                      >
                        <Trash2 size={11} />
                        {deletingId === video.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideo && previewVideo.video_url && (
        <VideoPreviewModal
          videoUrl={previewVideo.video_url}
          title={(previewVideo.projects as { title: string } | null)?.title || "Untitled Video"}
          videoType={previewVideo.video_type}
          onClose={() => setPreviewVideo(null)}
          onPublish={() => {
            setPreviewVideo(null);
            setPublishingVideo(previewVideo);
          }}
        />
      )}

      {/* Publish Modal */}
      {publishingVideo && (
        <PublishModal
          videoId={publishingVideo.id}
          videoTitle={(publishingVideo.projects as { title: string } | null)?.title || "Untitled Video"}
          onClose={() => setPublishingVideo(null)}
          onPublished={loadVideos}
        />
      )}

      {/* Delete Confirmation Modal */}
      {videoToDelete && (
        <DeleteVideoModal
          video={videoToDelete}
          isDeleting={deletingId === videoToDelete.id}
          onClose={() => setVideoToDelete(null)}
          onConfirm={() => handleDelete(videoToDelete.id)}
        />
      )}
    </div>
  );
}

export default function VideosPage() {
  return (
    <Suspense fallback={
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-52" />)}
      </div>
    }>
      <VideosContent />
    </Suspense>
  );
}
