"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PublishModal } from "@/components/social/PublishModal";
import { createClient } from "@/lib/supabase/client";
import { Plus, Video, Share2, Download, RefreshCw, Clock, CheckCircle, XCircle, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import toast from "react-hot-toast";

interface GeneratedVideo {
  id: string;
  video_url: string | null;
  video_type: string;
  render_provider: string;
  render_status: string;
  duration_seconds: number | null;
  created_at: string;
  project_id: string;
  projects?: { title: string } | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "warning" | "success" | "error"; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "default", icon: Clock },
  rendering: { label: "Rendering...", variant: "warning", icon: RefreshCw },
  completed: { label: "Ready", variant: "success", icon: CheckCircle },
  failed: { label: "Failed", variant: "error", icon: XCircle },
};

const typeLabel: Record<string, string> = {
  blog_long: "Blog Video",
  reel_9x16: "Reel / Short",
  youtube_16x9: "YouTube",
  short_1x1: "Square",
};

function VideosContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingVideo, setPublishingVideo] = useState<GeneratedVideo | null>(null);

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

  // Poll rendering videos every 10 seconds
  useEffect(() => {
    const hasRendering = videos.some((v) => v.render_status === "rendering" || v.render_status === "pending");
    if (!hasRendering) return;
    const interval = setInterval(loadVideos, 10000);
    return () => clearInterval(interval);
  }, [videos, loadVideos]);

  function handleCopyLink(videoUrl: string) {
    navigator.clipboard.writeText(videoUrl);
    toast.success("Video link copied!");
  }

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
      <div className="flex items-center justify-between mb-6">
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

            return (
              <Card
                key={video.id}
                padding="none"
                className={`overflow-hidden transition-all ${isHighlighted ? "ring-2 ring-primary-500" : ""}`}
              >
                {/* Thumbnail / preview */}
                <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative">
                  {video.render_status === "completed" && video.video_url ? (
                    <video
                      src={video.video_url}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      {video.render_status === "rendering" ? (
                        <>
                          <RefreshCw size={28} className="animate-spin text-primary-400" />
                          <span className="text-xs">Rendering...</span>
                        </>
                      ) : video.render_status === "failed" ? (
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
                      <StatusIcon size={13} className={video.render_status === "completed" ? "text-accent-500" : video.render_status === "failed" ? "text-red-400" : "text-yellow-500"} />
                      <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(video.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {video.render_status === "completed" && video.video_url && (
                    <div className="flex flex-col gap-2 mt-3">
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => setPublishingVideo(video)}
                      >
                        <Send size={13} /> Publish to Social
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => handleCopyLink(video.video_url!)}
                        >
                          <Share2 size={13} /> Copy Link
                        </Button>
                        <a href={video.video_url} download target="_blank" rel="noreferrer" className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full gap-1.5">
                            <Download size={13} /> Download
                          </Button>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
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
    </div>
  );
}

export default function VideosPage() {
  return (
    <Suspense fallback={<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-52" />)}</div>}>
      <VideosContent />
    </Suspense>
  );
}
