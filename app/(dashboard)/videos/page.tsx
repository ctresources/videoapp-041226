"use client";

import { Badge } from "@/components/ui/badge";
import { SparkleeNotes } from "@/components/videos/sparklee-notes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PublishModal } from "@/components/social/PublishModal";
import { isReviewRequest } from "@/lib/utils/review-request";
import { VideoPreviewModal } from "@/components/videos/VideoPreviewModal";
import { TranslateModal } from "@/components/videos/TranslateModal";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { isHeygenUrl, posterFrameUrl, downloadAsset } from "@/lib/utils/video-url";
import {
  Plus, Video, Share2, Download, RefreshCw, Clock, CheckCircle,
  XCircle, Send, Pencil, Sparkles, Play, Trash2, AlertTriangle, Film, Globe, Camera, FileText, Mail, Home,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import toast from "react-hot-toast";
import { projectThumbnailUrl } from "@/lib/utils/thumbnail-url";
import { RenderQueueNotice } from "@/components/videos/render-queue-notice";
import { AutopilotBanner } from "@/components/autopilot/autopilot-banner";
import { videoStatus, type PostRow } from "@/lib/utils/video-status";
import { VideoStatusLine } from "@/components/ui/video-status-line";
import { ThumbnailEditButton } from "@/components/social/thumbnail-edit-button";
import { OlderList, splitRecent, type OlderItem } from "@/components/videos/older-list";
import { partnerPlatform } from "@/lib/utils/social-platforms";

interface DraftProject {
  id: string;
  title: string;
  status: string;
  created_at: string;
  /** Read for one thing: whether an article was written. A project with a
   *  finished blog and no video is not an unfinished video — see hasArticle. */
  ai_script: { blog_body?: string } | null;
}

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
  /**
   * post_processed is written only after b-roll, music and captions are
   * composited — work that runs AFTER the row is marked completed. Its absence
   * on a completed video with extras is what "still finishing" means; there is
   * no separate flag for it.
   */
  metadata?: {
    render_error?: string;
    credit_kind?: "short" | "long";
    post_processed?: boolean;
    music_url?: string;
    photo_urls?: string[];
    stock_clip_urls?: string[];
    /** Photos attached to a camera take, for Record again (2026-10-21). */
    camera_photos?: string[];
  } | null;
  projects?: {
    title: string;
    ai_script?: { hook?: string; script?: string; cta?: string; blog_body?: string; kind?: string } | null;
    /** A real saved PNG, when one has been made. Cheaper than a frame of video
     *  by orders of magnitude — see CardPoster. */
    thumbnail_url?: string | null;
    /** For the thumbnail editor: the words and style it was last built with. */
    seo_data?: Record<string, unknown> | null;
  } | null;
  source_video_id?: string | null;
  translation_language?: string | null;
}

interface RenderProgress {
  progressPct: number;   // 0–100
  status: string;
  url?: string | null;
}

/**
 * How many videos the library loads.
 *
 * Was 200, on the reasoning that a working agent passes 50 within months and
 * should not hit a wall. True, but every completed row without a saved
 * thumbnail brings a media element with it, and a hundred of those hung the
 * tab outright (Chrome's RESULT_CODE_HUNG). Sixty is still a year of steady
 * work on one screen, and the poster below caps what any of it costs.
 *
 * 120 since 2026-10-29: only the last 10 days are big cards now; older ones
 * are one line with a small image (components/videos/older-list), no player.
 */
const VIDEO_PAGE_SIZE = 120;

const statusConfig: Record<string, { label: string; variant: "default" | "warning" | "success" | "error"; icon: React.ElementType }> = {
  pending:   { label: "In queue",     variant: "default",  icon: Clock },
  rendering: { label: "Rendering…",   variant: "warning",  icon: RefreshCw },
  storing:   { label: "Finalizing…",  variant: "warning",  icon: RefreshCw },
  completed: { label: "Ready",        variant: "success",  icon: CheckCircle },
  failed:    { label: "Failed",       variant: "error",    icon: XCircle },
};

const typeLabel: Record<string, string> = {
  blog_long:    "YouTube (16:9)",
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

/**
 * The still on a video card.
 *
 * Every completed card used to mount `<video preload="metadata">` to show a
 * frame. One is nothing; a hundred is a hundred open connections and a hundred
 * decoders, and the tab stops responding — which is exactly what happened at
 * 102 videos.
 *
 * Two things fix it. A saved thumbnail is an ordinary image and is used
 * whenever one exists, which is most of the time now that publishing writes
 * one. Where none exists the media element is still the only way to see a
 * frame, so it is mounted only while the card is near the viewport and taken
 * down again when it leaves: live decoders are capped at what is on screen,
 * whatever the size of the library.
 *
 * Deliberately NOT the derived /api/thumbnail address, which renders a card
 * server-side on request. Swapping a hundred media elements for a hundred
 * server renders moves the cost rather than removing it.
 */
function CardPoster({ video, alt }: { video: GeneratedVideo; alt: string }) {
  const saved = video.projects?.thumbnail_url || null;
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (saved || near) return;
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (old browser, jsdom) means falling back to the
    // old behaviour rather than showing nothing.
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setNear(e.isIntersecting)),
      // A screen's margin either way, so a card is ready by the time it
      // arrives rather than popping in under the cursor.
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [saved, near]);

  if (saved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={saved} alt={alt} loading="lazy" decoding="async" className="w-full h-full object-cover" />
    );
  }

  return (
    <div ref={ref} className="w-full h-full">
      {near && video.video_url ? (
        <video
          src={posterFrameUrl(video.video_url)}
          className="w-full h-full object-cover"
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
      )}
    </div>
  );
}

function RenderProgressBar({ video }: { video: GeneratedVideo }) {
  const [progress, setProgress] = useState<RenderProgress>({ progressPct: 0, status: video.render_status });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useElapsedSeconds(video.created_at, progress.status === "rendering" || progress.status === "pending");
  const estimated = ESTIMATED_SECS[video.video_type] || 180;

  // Time-based fallback progress (fills over estimated duration)
  const timePct = Math.min(99, Math.round((elapsed / estimated) * 100));
  /**
   * Never goes backwards.
   *
   * The status route returns a constant 50% for anything mid-render, and this
   * preferred the reported figure whenever it was above zero — so the bar
   * filled toward 99% on the time estimate, the first poll landed, and it
   * snapped back to 50 and sat there for the rest of the render under the
   * words "AI is creating your video". Taking the higher of the two keeps the
   * reported value useful when it is genuinely ahead, without ever rewinding.
   */
  const displayPct = Math.max(progress.progressPct || 0, timePct);

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
          // Skip reload if user is mid-delete — would dismiss the confirm modal
          if (!document.body.hasAttribute("data-video-deleting")) {
            window.location.reload();
          }
        }
      } catch { /* silent */ }
    }

    poll();
    intervalRef.current = setInterval(poll, 6000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [video.render_job_id, video.render_status]);

  return (
    <div className="mt-3 space-y-1.5">
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <RefreshCw size={11} className="animate-spin text-primary-500" />
        AI is creating your video…
      </span>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full animate-pulse"
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * One confirmation for several videos or articles (2026-10-17). The same
 * type-"delete" check the single video delete has, said once for the lot.
 */
function BatchDeleteModal({ count, kind, onClose, onConfirm, isDeleting }: {
  count: number;
  kind: "videos" | "blogs";
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = typed.trim().toLowerCase() === "delete" && !isDeleting;
  const noun = kind === "videos" ? (count === 1 ? "video" : "videos") : (count === 1 ? "article" : "articles");

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
        <div className="h-1.5 bg-gradient-to-r from-red-500 via-rose-500 to-red-600" />
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-brand-text">Delete {count} {noun}?</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {kind === "videos"
                  ? "This removes them from SparkReels and cannot be undone. Anywhere you already published them — YouTube included — is untouched."
                  : "This removes them and the articles written for them from SparkReels, and cannot be undone. Anywhere you already posted them is untouched."}
              </p>
            </div>
          </div>
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isDeleting} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={!canConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300 disabled:cursor-not-allowed gap-1.5"
            >
              {isDeleting ? (
                <><RefreshCw size={14} className="animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 size={14} /> Delete {count} {noun}</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The bar under a list while ticking cards to delete. */
function BatchBar({ count, noun, total, onSelectAll, onCancel, onDelete }: {
  count: number; noun: string; total: number;
  onSelectAll: () => void; onCancel: () => void; onDelete: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-spark-ink px-4 py-2.5 text-[14px] text-[#f3e6cf]">
      <span className="flex-1">
        {count === 0 ? `Tick the ${noun}s to delete` : `${count} ${noun}${count === 1 ? "" : "s"} selected`}
      </span>
      {count < total && (
        <button type="button" onClick={onSelectAll} className="text-[13px] font-semibold underline underline-offset-2 hover:text-white">
          Select all
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[10px] border border-white/25 px-3 py-1.5 text-[13px] font-semibold text-[#f3e6cf] hover:bg-white/10"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={count === 0}
        onClick={onDelete}
        className="flex items-center gap-1.5 rounded-[10px] bg-red-600 px-3.5 py-1.5 text-[13px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
      >
        <Trash2 size={13} /> Delete {count || ""}
      </button>
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
              {/* Says what survives and what doesn't. Deleting used to take
                  the publish record with it, so Analytics' count dropped
                  while the video was still live on YouTube — and the dialog
                  mentioned none of that. */}
              <p className="text-sm text-slate-500 mt-0.5">
                This removes it from SparkReels and cannot be undone. Anywhere you already
                published it — YouTube included — is untouched, and stays in your published count.
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
  const router = useRouter();
  const highlightId = searchParams.get("highlight");
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  /** Where each video has gone, and the AutoSparks cards that will post them (2026-10-26). */
  const [postsByVideo, setPostsByVideo] = useState<Record<string, PostRow[]>>({});
  const [autoByProject, setAutoByProject] = useState<Record<string, { slotAt: string; platforms: string[] }>>({});
  /** Per video: how many people it was emailed to, and when last (2026-10-29). */
  const [emailed, setEmailed] = useState<Record<string, { people: number; last: string }>>({});
  useEffect(() => {
    fetch("/api/video-email/history").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.history) setEmailed(d.history);
    }).catch(() => {});
  }, []);
  const [drafts, setDrafts] = useState<DraftProject[]>([]);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Picking blog posts for a newsletter (2026-10-15, the owner's mock): 2 to
  // 5 of them, in the order they were ticked.
  // The agent's saved listings, for the Seller updates section (2026-10-15).
  const [sellerListings, setSellerListings] = useState<
    { id: string; address: string; seller_names: string | null; listed_on: string | null; last_update_at: string | null }[] | null
  >(null);
  useEffect(() => {
    fetch("/api/seller-listings")
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((d) => setSellerListings(d.listings ?? []))
      .catch(() => setSellerListings([]));
  }, []);
  const [pickingPosts, setPickingPosts] = useState(false);
  const [pickedPosts, setPickedPosts] = useState<string[]>([]);
  const togglePost = (id: string) =>
    setPickedPosts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id)
        : prev.length >= 5 ? (toast.error("A newsletter takes up to 5 posts."), prev)
        : [...prev, id]);

  // The two halves of the drafts list, counted once and used in both the
  // header line and the sections below it.
  const articleCount = drafts.filter((d) => !!d.ai_script?.blog_body?.trim()).length;
  const draftCount = drafts.length - articleCount;

  async function handleDeleteDraft(draft: DraftProject) {
    // Names what is actually being thrown away. "Delete the draft" understated
    // it for a project holding a finished thousand-word article.
    const isArticle = !!draft.ai_script?.blog_body?.trim();
    const label = draft.title || (isArticle ? "Untitled Article" : "Untitled Draft");
    const what = isArticle
      ? `Delete "${label}" and the article written for it? This cannot be undone.`
      : `Delete the draft "${label}"? This cannot be undone.`;
    if (!confirm(what)) return;
    setDeletingDraftId(draft.id);
    try {
      const res = await fetch("/api/project/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: draft.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not delete draft");
      } else {
        toast.success("Draft deleted");
        setDrafts((prev) => prev.filter((x) => x.id !== draft.id));
      }
    } finally {
      setDeletingDraftId(null);
    }
  }
  const [publishingVideo, setPublishingVideo] = useState<GeneratedVideo | null>(null);
  /** Posts a platform refused after they were sent, not yet dealt with. */
  const [unposted, setUnposted] = useState<{
    id: string; platform: string; title: string | null; reason: string | null; videoId: string | null;
  }[]>([]);
  // Read on arrival and again whenever the Publish window closes, since a
  // retry from there is what clears one.
  useEffect(() => {
    if (publishingVideo) return;
    fetch("/api/social/attention")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.posts) setUnposted(d.posts); })
      .catch(() => { /* the note simply does not appear */ });
  }, [publishingVideo]);

  function dismissUnposted(id: string) {
    setUnposted((prev) => prev.filter((p) => p.id !== id));
    fetch("/api/social/attention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => { /* it comes back on the next visit, which is the safe way to fail */ });
  }
  const [previewVideo, setPreviewVideo] = useState<GeneratedVideo | null>(null);
  const [translatingVideo, setTranslatingVideo] = useState<GeneratedVideo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<GeneratedVideo | null>(null);

  /**
   * Batch delete (2026-10-17): Select on the Videos or Blog posts heading,
   * tick cards, then Delete and one type-"delete" confirmation for them all.
   * One list at a time, and never while posts are being picked for a
   * newsletter, so ticking for one can't delete for the other.
   */
  const [selecting, setSelecting] = useState<"videos" | "blogs" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const toggleSelected = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const stopSelecting = () => { setSelecting(null); setSelected([]); setBatchConfirm(false); };

  async function handleBatchDelete() {
    if (!selecting || selected.length === 0) return;
    const kind = selecting;
    setBatchDeleting(true);
    if (kind === "videos") document.body.setAttribute("data-video-deleting", "1");
    const done: string[] = [];
    const failed: string[] = [];
    try {
      // One at a time: the same routes the single deletes use, and a failure
      // in the middle costs only that one.
      for (const id of selected) {
        const res = await fetch(kind === "videos" ? "/api/video/delete" : "/api/project/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "videos" ? { videoId: id } : { projectId: id }),
        }).catch(() => null);
        if (res?.ok) done.push(id); else failed.push(id);
      }
    } finally {
      if (kind === "videos") {
        setVideos((prev) => prev.filter((v) => !done.includes(v.id)));
        document.body.removeAttribute("data-video-deleting");
      } else {
        setDrafts((prev) => prev.filter((d) => !done.includes(d.id)));
      }
      setBatchDeleting(false);
    }
    const noun = kind === "videos" ? "video" : "article";
    if (done.length) toast.success(`${done.length} ${noun}${done.length === 1 ? "" : "s"} deleted`);
    if (failed.length) {
      const names = failed.map((id) =>
        kind === "videos"
          ? (videos.find((v) => v.id === id)?.projects as { title?: string } | null)?.title || "Untitled video"
          : drafts.find((d) => d.id === id)?.title || "Untitled article",
      );
      toast.error(`Couldn't delete: ${names.join(", ")}. Try those again.`, { duration: 8000 });
      setSelected(failed);
      setBatchConfirm(false);
    } else {
      stopSelecting();
    }
  }

  async function handleDelete(videoId: string) {
    setDeletingId(videoId);
    document.body.setAttribute("data-video-deleting", "1");
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
      document.body.removeAttribute("data-video-deleting");
    }
  }

  const loadVideos = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("generated_videos")
      .select("*, projects(title, seo_data, ai_script, thumbnail_url)")
      .order("created_at", { ascending: false })
      .limit(VIDEO_PAGE_SIZE);

    const videos = (data as unknown as GeneratedVideo[]) || [];
    setVideos(videos);

    // Projects with no video against them. Two different things live here and
    // used to be shown as one: an unfinished video, and a finished blog post.
    // ai_script comes back so they can be told apart.
    const { data: draftData } = await supabase
      .from("projects")
      .select("id, title, status, created_at, ai_script")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(60);
    const videoProjectIds = new Set(videos.map((v) => v.project_id));
    setDrafts(((draftData as DraftProject[]) || []).filter((d) => !videoProjectIds.has(d.id)));

    // The status line on each card: real posts, and approved cards still to post.
    const ids = videos.map((v) => v.id);
    const projectIds = Array.from(videoProjectIds).filter(Boolean);
    if (ids.length) {
      const [{ data: postRows }, { data: autoRows }] = await Promise.all([
        supabase.from("social_posts").select("video_id, platform, post_status, scheduled_at").in("video_id", ids),
        supabase.from("autopilot_drafts").select("project_id, slot_at, setup").in("project_id", projectIds).eq("status", "approved").is("posted_at", null),
      ]);
      const byVideo: Record<string, PostRow[]> = {};
      for (const p of (postRows ?? []) as (PostRow & { video_id: string })[]) (byVideo[p.video_id] ??= []).push(p);
      setPostsByVideo(byVideo);
      const byProject: Record<string, { slotAt: string; platforms: string[] }> = {};
      for (const a of (autoRows ?? []) as { project_id: string; slot_at: string; setup: { platforms?: string[] } | null }[]) {
        byProject[a.project_id] = { slotAt: a.slot_at, platforms: a.setup?.platforms ?? [] };
      }
      setAutoByProject(byProject);
    }

    setLoading(false);

    // Silently re-store any completed videos still on HeyGen CDN URLs (expired or not)
    const expired = videos.filter(
      (v) => v.render_status === "completed" && v.video_url && isHeygenUrl(v.video_url)
    );
    for (const v of expired) {
      fetch("/api/video/refresh-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: v.id }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.videoUrl) {
            setVideos((prev) =>
              prev.map((vid) => vid.id === v.id ? { ...vid, video_url: d.videoUrl } : vid)
            );
          }
        })
        .catch(() => {/* silent — keep showing old URL */});
    }
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  function handleCopyLink(videoUrl: string) {
    navigator.clipboard.writeText(videoUrl);
    toast.success("Video link copied!");
  }

  const renderingVideos = videos.filter(
    (v) => v.render_status === "rendering" || v.render_status === "pending" || v.render_status === "storing"
  );
  const hasRendering = renderingVideos.length > 0;

  /**
   * Big cards for the last 10 days, one line each for the rest (2026-10-29,
   * the owner's pick). A video still being made, or the one just opened by
   * link, always stays big.
   */
  const [recentVideos, olderVideos] = splitRecent(
    videos,
    (v) => v.created_at,
    (v) => v.id === highlightId || v.render_status === "rendering" || v.render_status === "pending" || v.render_status === "storing",
  );
  const blogItems = drafts.filter((d) => !!d.ai_script?.blog_body?.trim());
  const [recentBlogs, olderBlogs] = splitRecent(blogItems, (d) => d.created_at);
  const postedOn = (id: string) => Array.from(new Set(
    (postsByVideo[id] ?? []).filter((p) => p.post_status === "posted")
      .map((p) => (p.platform === "youtube" ? "YouTube" : partnerPlatform(p.platform)?.label ?? p.platform)),
  ));
  const olderVideoItems: OlderItem[] = olderVideos.map((v) => {
    const on = postedOn(v.id);
    const ready = v.render_status === "completed" && !!v.video_url;
    return {
      id: v.id,
      title: (v.projects as { title?: string } | null)?.title || "Untitled Video",
      at: v.created_at,
      thumbUrl: (v.projects as { thumbnail_url?: string | null } | null)?.thumbnail_url ?? null,
      chip: ready ? (on.length ? { text: `Posted · ${on.join(", ")}`, ok: true } : { text: "Not posted", ok: false })
        : v.render_status === "failed" ? { text: "Couldn't be made", ok: false } : null,
      notPosted: ready && on.length === 0,
      actions: (
        <>
          {ready && (
            <Button size="sm" className="gap-1" onClick={() => setPreviewVideo(v)}><Play size={12} /> Watch</Button>
          )}
          {v.project_id && (
            <Link href={`/create/${v.project_id}`} className="hidden sm:block">
              <Button size="sm" variant="outline">Edit &amp; remake</Button>
            </Link>
          )}
          <Button size="sm" variant="ghost" title="Delete" onClick={() => setVideoToDelete(v)}
            disabled={deletingId === v.id} className="text-slate-300 hover:text-red-500">
            <Trash2 size={13} />
          </Button>
        </>
      ),
    };
  });
  const olderBlogItems: OlderItem[] = olderBlogs.map((d) => ({
    id: d.id,
    title: d.title || "Untitled Article",
    at: d.created_at,
    actions: (
      <>
        <Link href={`/create/${d.id}?step=5`}><Button size="sm" className="gap-1"><FileText size={12} /> Open</Button></Link>
        <Button size="sm" variant="ghost" title="Delete" onClick={() => handleDeleteDraft(d)}
          disabled={deletingDraftId === d.id} className="text-slate-300 hover:text-red-500">
          {deletingDraftId === d.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </Button>
      </>
    ),
  }));

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  return (
    /**
     * A width, at last.
     *
     * This page had none: three columns across whatever the window happened to
     * be. On a wide monitor each card grew to fill a third of it, and zooming
     * out made it worse rather than better — browser zoom widens the CSS
     * viewport, so the three columns simply took twice as much room each.
     *
     * Capped here and given a fourth column below, so a card stays the size of
     * a card and the extra width buys more of them instead.
     */
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-brand-text">My Sparks</h2>
          {/* Counts what is actually on the page. It said "N videos" over a
              list that also holds articles and drafts, so the number never
              matched what you could see.

              "total" over a query capped at 50: a user with 60 videos was told
              they had 50, and the ten oldest were unreachable. */}
          <p className="text-sm text-slate-500 mt-0.5">
            {[
              `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
              articleCount > 0 ? `${articleCount} blog post${articleCount !== 1 ? "s" : ""}` : "",
              draftCount > 0 ? `${draftCount} draft${draftCount !== 1 ? "s" : ""}` : "",
            ].filter(Boolean).join(" · ")}
            {videos.length >= VIDEO_PAGE_SIZE ? " — showing your most recent" : ""}
          </p>
        </div>
        {/* "New Video" named one of the three things this page holds, on the
            one button that leads to all of them. */}
        <Link href="/create">
          <Button size="sm" className="gap-2">
            <Plus size={15} /> Create
          </Button>
        </Link>
      </div>

      {/* Videos waiting in line to start, and any that could not. */}
      <RenderQueueNotice />

      {/* Sparklee's Fixed for you / Needs you notes (2026-10-26). */}
      <SparkleeNotes />

      {/* A post that did not go out. A platform can refuse one minutes after
          it was sent, when the Publish window is long closed, and until this
          nothing said so: the agent could reasonably believe it had posted. */}
      {unposted.length > 0 && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <AlertTriangle size={15} className="shrink-0" />
            {unposted.length === 1 ? "A post didn't go out" : `${unposted.length} posts didn't go out`}
          </p>
          <ul className="mt-2 space-y-2">
            {unposted.slice(0, 4).map((p) => {
              const video = p.videoId ? videos.find((v) => v.id === p.videoId) : undefined;
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-red-900">
                      <span className="font-semibold">{p.platform}</span>
                      {p.title ? <span className="text-red-800"> · {p.title}</span> : null}
                    </p>
                    {p.reason && <p className="text-[13px] text-red-700">{p.reason}</p>}
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    {/reconnect|expired|connection|log ?in again|permission/i.test(p.reason ?? "") && (
                      <Link
                        href="/settings/social"
                        className="rounded-lg bg-spark-amber px-2.5 py-1 text-[13px] font-semibold text-white"
                      >
                        Reconnect {p.platform}
                      </Link>
                    )}
                    {video && (
                      <button
                        type="button"
                        onClick={() => setPublishingVideo(video)}
                        className="text-[13px] font-semibold text-red-800 underline hover:text-red-950"
                      >
                        Open Publish
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => dismissUnposted(p.id)}
                      className="text-[13px] font-medium text-red-700 hover:text-red-900"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {unposted.length > 4 && (
            <p className="mt-2 text-[13px] text-red-700">And {unposted.length - 4} more.</p>
          )}
        </div>
      )}

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

      {/* Two sections, not one.
          A project with no video against it used to be filed as a "Draft —
          Not Generated Yet", told it was unfinished, and offered "Continue
          Editing". For fifteen of them that was wrong: they hold a finished
          thousand-word article, written free alongside the script, and there
          was never a video to generate. Calling a finished thing unfinished is
          how it stays unread. */}
      {[
        {
          key: "blogs",
          items: drafts.filter((d) => !!d.ai_script?.blog_body?.trim()),
          heading: "Blog posts — written, no video",
          badge: "Article",
          accent: "border-t-emerald-400",
          iconClass: "text-emerald-500",
          note: "article ready to paste into your site",
          cta: "Open the article",
          href: (id: string) => `/create/${id}?step=5`,
          deleteTitle: "Delete this project and its article",
        },
        {
          key: "drafts",
          items: drafts.filter((d) => !d.ai_script?.blog_body?.trim()),
          heading: "Drafts — script saved, video not generated",
          badge: "Draft",
          accent: "border-t-amber-400",
          iconClass: "text-amber-500",
          note: "video not generated",
          cta: "Continue editing",
          href: (id: string) => `/create/${id}`,
          deleteTitle: "Delete draft",
        },
      ].filter((s) => s.items.length > 0).map((s) => (
        <div key={s.key} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            {s.key === "blogs"
              ? <FileText size={15} className={s.iconClass} />
              : <Pencil size={15} className={s.iconClass} />}
            <h3 className="font-semibold text-brand-text">{s.heading}</h3>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {s.items.length}
            </span>
            {s.key === "blogs" && !pickingPosts && selecting !== "blogs" && (
              <div className="ml-auto flex items-center gap-1.5">
                {s.items.length >= 2 && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { stopSelecting(); setPickingPosts(true); setPickedPosts([]); }}>
                    <Mail size={13} /> Make a newsletter
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSelecting("blogs"); setSelected([]); }}>
                  <ListChecks size={13} /> Select
                </Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {(s.key === "blogs" ? recentBlogs : s.items).map((d) => {
              const deletePicking = s.key === "blogs" && selecting === "blogs";
              const picking = (s.key === "blogs" && pickingPosts) || deletePicking;
              const picked = deletePicking ? selected.includes(d.id) : picking && pickedPosts.includes(d.id);
              return (
              <Card
                key={d.id}
                padding="sm"
                className={`border-t-2 ${s.accent} ${picking ? "cursor-pointer" : ""} ${picked ? "ring-2 ring-[#A3660F]" : ""}`}
                onClick={picking ? () => (deletePicking ? toggleSelected(d.id) : togglePost(d.id)) : undefined}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <p className="font-medium text-[13px] leading-snug text-brand-text line-clamp-2">
                    {d.title || (s.key === "blogs" ? "Untitled Article" : "Untitled Draft")}
                  </p>
                  {picking ? (
                    <span
                      role="checkbox"
                      aria-checked={picked}
                      aria-label={deletePicking ? `Select ${d.title || "this post"} to delete` : `Use ${d.title || "this post"} in the newsletter`}
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[12px] text-white ${
                        picked ? "border-[#A3660F] bg-[#A3660F]" : "border-[#d9c6a8] bg-white"
                      }`}
                    >
                      {picked && "✓"}
                    </span>
                  ) : (
                    <Badge variant={s.key === "blogs" ? "default" : "warning"} className="text-xs shrink-0">
                      {s.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mb-2">
                  Saved {new Date(d.created_at).toLocaleDateString()} · {s.note}
                </p>
                <div className="flex gap-1.5" onClick={picking ? (e) => e.stopPropagation() : undefined}>
                  <Link href={s.href(d.id)} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full gap-1.5">
                      {s.key === "blogs" ? <FileText size={12} /> : <Pencil size={12} />} {s.cta}
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteDraft(d)}
                    disabled={deletingDraftId === d.id}
                    className="text-slate-300 hover:text-red-500 shrink-0"
                    title={s.deleteTitle}
                  >
                    {deletingDraftId === d.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>
          {s.key === "blogs" && (
            <OlderList
              kind="blogs"
              items={olderBlogItems}
              checking={selecting === "blogs" || pickingPosts}
              isChecked={(id) => (selecting === "blogs" ? selected.includes(id) : pickedPosts.includes(id))}
              onCheck={(id) => (selecting === "blogs" ? toggleSelected(id) : togglePost(id))}
              onStartSelect={() => { setPickingPosts(false); setPickedPosts([]); setSelecting("blogs"); setSelected([]); }}
            />
          )}
          {s.key === "blogs" && selecting === "blogs" && (
            <BatchBar
              count={selected.length}
              noun="article"
              total={s.items.length}
              onSelectAll={() => setSelected(s.items.map((d) => d.id))}
              onCancel={stopSelecting}
              onDelete={() => setBatchConfirm(true)}
            />
          )}
          {s.key === "blogs" && pickingPosts && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-spark-ink px-4 py-2.5 text-[14px] text-[#f3e6cf]">
              <span className="flex-1">
                {pickedPosts.length === 0 ? "Tick 2 to 5 posts" : `${pickedPosts.length} post${pickedPosts.length === 1 ? "" : "s"} picked`}
              </span>
              <button
                type="button"
                onClick={() => { setPickingPosts(false); setPickedPosts([]); }}
                className="rounded-[10px] border border-white/25 px-3 py-1.5 text-[13px] font-semibold text-[#f3e6cf] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pickedPosts.length < 2}
                onClick={() => router.push(`/newsletter?posts=${pickedPosts.join(",")}`)}
                className="spark-cta-gradient rounded-[10px] px-3.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                Make the newsletter →
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Seller updates: each saved listing and a way into this week's
          email, which is written in Spark Tools' Seller Update tab
          (the owner's mock, 2026-10-15). */}
      {sellerListings !== null && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Home size={15} className="text-amber-500" />
            <h3 className="font-semibold text-brand-text">Seller updates</h3>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{sellerListings.length}</span>
            <Link href="/tools?tab=seller&new=1" className="ml-auto">
              <Button size="sm" variant="outline" className="gap-1.5"><Plus size={13} /> Add a listing</Button>
            </Link>
          </div>
          {sellerListings.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {sellerListings.map((l) => (
                <Card key={l.id} padding="sm" className="border-t-2 border-t-amber-400">
                  <p className="font-medium text-[13px] leading-snug text-brand-text line-clamp-2">
                    {l.address}{l.seller_names ? <span className="font-normal text-slate-500"> · {l.seller_names}</span> : null}
                  </p>
                  <p className="text-[11px] text-slate-400 mb-2 mt-1">
                    {l.listed_on ? `Listed ${new Date(`${l.listed_on}T12:00:00`).toLocaleDateString()}` : "List date not set"}
                    {" · "}
                    {l.last_update_at ? `last update ${new Date(l.last_update_at).toLocaleDateString()}` : "no update yet"}
                  </p>
                  <Link href={`/tools?tab=seller&listing=${l.id}`}>
                    {/* "New update", not "This week's": updates go out any day (2026-10-15). */}
                    <Button size="sm" className="w-full">New update</Button>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {videos.length === 0 && drafts.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Video className="w-12 h-12 text-slate-300 mb-3" />
          {/* Not "No videos yet" any more: a blog post lands here too, and it
              is the one thing on this page you can have without spending
              anything — worth saying to someone looking at an empty screen. */}
          <p className="font-semibold text-brand-text">Nothing here yet</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">
            Film a video yourself, let SparkReels render one — or write a blog post, which costs
            nothing from your plan.
          </p>
          <Link href="/create">
            <Button className="gap-2"><Plus size={15} /> Make something</Button>
          </Link>
        </Card>
      ) : (
        <>
        {/* Named, like the two sections above it. Blog posts and Drafts each
            got a heading when they were split apart, which left the videos as
            a bare grid under two labelled lists — so it read as the drafts
            spilling downwards rather than as the third thing on the page. */}
        <div className="flex items-center gap-2 mb-2">
          <Film size={15} className="text-spark-amber" />
          <h3 className="font-semibold text-brand-text">Videos — rendered and recorded</h3>
          <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {videos.length}
          </span>
          {selecting !== "videos" && videos.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1.5"
              onClick={() => { setPickingPosts(false); setPickedPosts([]); setSelecting("videos"); setSelected([]); }}
            >
              <ListChecks size={13} /> Select
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {recentVideos.map((video) => {
            const status = statusConfig[video.render_status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const isHighlighted = video.id === highlightId;
            const isRendering = video.render_status === "rendering" || video.render_status === "pending" || video.render_status === "storing";
            const hookText = (video.projects as { title: string; ai_script?: { hook?: string } | null } | null)?.ai_script?.hook;

            // Split hook at narrative break (em-dash or colon) for two-line thumbnail effect
            let hookTopLine = "";
            let hookBottomLine = hookText || "";
            if (hookText) {
              const dashIdx = hookText.indexOf(" — ");
              const colonIdx = hookText.indexOf(": ");
              if (dashIdx > 0 && dashIdx < 55) {
                hookTopLine = hookText.slice(0, dashIdx);
                hookBottomLine = hookText.slice(dashIdx + 3);
              } else if (colonIdx > 0 && colonIdx < 40) {
                hookTopLine = hookText.slice(0, colonIdx);
                hookBottomLine = hookText.slice(colonIdx + 2);
              }
            }

            return (
              <Card
                key={video.id}
                padding="none"
                className={`relative overflow-hidden transition-all ${
                  selecting === "videos" && selected.includes(video.id)
                    ? "ring-2 ring-[#A3660F]"
                    : isHighlighted ? "ring-2 ring-primary-500" : ""
                }`}
              >
                {selecting === "videos" && (
                  <button
                    type="button"
                    onClick={() => toggleSelected(video.id)}
                    aria-pressed={selected.includes(video.id)}
                    aria-label={`Select ${(video.projects as { title?: string } | null)?.title || "this video"} to delete`}
                    className="absolute inset-0 z-20 cursor-pointer bg-white/0 hover:bg-white/10"
                  >
                    <span
                      className={`absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-[1.5px] text-[13px] text-white shadow ${
                        selected.includes(video.id) ? "border-[#A3660F] bg-[#A3660F]" : "border-[#d9c6a8] bg-white"
                      }`}
                    >
                      {selected.includes(video.id) && "✓"}
                    </span>
                  </button>
                )}
                {/* Thumbnail / preview */}
                <div
                  className={`aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden ${video.render_status === "completed" && video.video_url ? "cursor-pointer group" : ""}`}
                  onClick={() => video.render_status === "completed" && video.video_url && setPreviewVideo(video)}
                >
                  {video.render_status === "completed" && video.video_url ? (
                    <>
                      <CardPoster video={video} alt={video.projects?.title || "Video"} />
                      {/* Play overlay on hover */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all">
                        <div className="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 flex items-center justify-center transition-all scale-75 group-hover:scale-100">
                          <Play size={22} className="text-transparent group-hover:text-slate-800 ml-1 transition-colors" fill="currentColor" />
                        </div>
                      </div>
                      {/* Hook text — YouTube thumbnail stop-scroll style */}
                      {hookText && (
                        <div className="absolute inset-0 pointer-events-none group-hover:opacity-0 transition-opacity duration-300">
                          {/* Deep gradient anchored at bottom */}
                          <div
                            className="absolute bottom-0 left-0 right-0 h-[65%]"
                            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.82) 35%, rgba(0,0,0,0.35) 65%, transparent 100%)" }}
                          />
                          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
                            {hookTopLine && (
                              <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-wider mb-1 line-clamp-1 drop-shadow-md">
                                {hookTopLine}
                              </p>
                            )}
                            <p
                              className="text-white font-black text-[15px] leading-tight line-clamp-2"
                              style={{ textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.8)" }}
                            >
                              {hookBottomLine}
                            </p>
                          </div>
                        </div>
                      )}
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
                          <span className="text-xs font-medium text-white">Rendering…</span>
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
                    <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                      {video.translation_language && <Globe size={11} />}
                      {video.translation_language || typeLabel[video.video_type] || video.video_type}
                    </span>
                  </div>
                </div>

                <div className="p-2.5">
                  <p className="font-medium text-sm text-brand-text truncate mb-1">
                    {(video.projects as { title: string } | null)?.title || "Untitled Video"}
                  </p>

                  {/* Completed, but the extras have not landed yet.
                      The row is marked completed before b-roll, music and
                      captions are composited, so what plays right now is the
                      bare presenter — and a card that just says Ready is how
                      someone ends up publishing that version. */}
                  {video.render_status === "completed"
                    && !video.metadata?.post_processed
                    && (!!video.metadata?.music_url
                        || (video.metadata?.photo_urls?.length ?? 0) > 0
                        || (video.metadata?.stock_clip_urls?.length ?? 0) > 0) && (
                    <p className="mb-2 rounded-lg bg-spark-amber/5 px-2 py-1.5 text-[11px] leading-[1.4] text-amber-700">
                      Still adding your b-roll, music and captions — give it a few minutes
                      and refresh before you publish.
                    </p>
                  )}

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
                    {/* Date and time (2026-10-29, the owner's ask), so a video
                        can be placed before or after a change. */}
                    <span className="text-xs text-slate-400">
                      {new Date(video.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Draft → Made → Approved/Scheduled → Posted, the same as on
                      AutoSparks and in Publish (2026-10-26). */}
                  <div className="mt-2">
                    <VideoStatusLine
                      compact
                      status={videoStatus({
                        hasVideo: true,
                        ready: video.render_status === "completed" && !!video.video_url,
                        failed: video.render_status === "failed",
                        autoPost: (video.project_id && autoByProject[video.project_id]) || null,
                        posts: postsByVideo[video.id] ?? [],
                      })}
                    />
                  </div>

                  {/* Render progress bar */}
                  {isRendering && <RenderProgressBar video={video} />}

                  {/* The article this video was written alongside.
                      Outside the completed branch on purpose. The article is
                      finished the moment the script is — it is saved with it —
                      while the render takes another twenty minutes, so the one
                      time somebody most wants the words is exactly when this
                      card has nothing on it but a progress bar. It is also the
                      only way to reach them: the Blog posts list above skips
                      any project that has a video, by design, which left an
                      article belonging to a video with no button anywhere. */}
                  {video.project_id && video.projects?.ai_script?.blog_body?.trim() && (
                    <Link href={`/create/${video.project_id}?step=5`} className="mt-2 block">
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <FileText size={13} /> Open the article
                      </Button>
                    </Link>
                  )}

                  {/* Actions */}
                  {video.render_status === "completed" && video.video_url && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      {/* Preview is the primary CTA — publish/download live inside the preview modal */}
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => setPreviewVideo(video)}
                      >
                        <Play size={13} fill="currentColor" /> Preview Video
                      </Button>
                      {/* The one thumbnail editor (2026-10-26). */}
                      {video.project_id && (
                        <ThumbnailEditButton
                          projectId={video.project_id}
                          seo={video.projects?.seo_data ?? null}
                          photos={video.metadata?.photo_urls ?? []}
                          onDone={() => void loadVideos()}
                          className="w-full"
                        />
                      )}
                      {/* Emailed (2026-10-29, the owner's ask). */}
                      {emailed[video.id] && (
                        <p className="text-[12px] font-medium text-spark-ink-muted">
                          ✉ Emailed to {emailed[video.id].people} · {new Date(emailed[video.id].last).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {/* A video an approved AutoSparks card will post is changed
                            there, not published here (2026-10-26). */}
                        {video.project_id && autoByProject[video.project_id] ? (
                          <Link href="/autosparks" className="flex-1">
                            <Button variant="outline" size="sm" className="w-full gap-1.5">Open on AutoSparks</Button>
                          </Link>
                        ) : isReviewRequest(video.projects?.ai_script) ? (
                          // A Google review request is a personal ask to past
                          // clients, not a post (2026-10-29, the owner's call):
                          // no Publish to social accounts. It is emailed.
                          null
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => setPublishingVideo(video)}
                          >
                            <Send size={13} /> Publish
                          </Button>
                        )}
                        {/* Email it: to up to ten BoldTrail contacts, or copy
                            and paste (2026-10-15, the owner's mock). */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 gap-1.5 bg-orange-600 text-white hover:bg-orange-700"
                          onClick={() => router.push(`/video-email?video=${video.id}`)}
                        >
                          <Mail size={13} /> Email it
                        </Button>
                        {!video.translation_language && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTranslatingVideo(video)}
                            title="Translate to another language"
                          >
                            <Globe size={13} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLink(video.video_url!)}
                          title="Copy link"
                        >
                          <Share2 size={13} />
                        </Button>
                        {/* A cross-origin <a download> is ignored — the file
                            just opened in a tab. And the extension follows the
                            real container, so a WebM camera recording stops
                            being saved as .mp4. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Download"
                          onClick={async () => {
                            try {
                              await downloadAsset(video.video_url!, video.projects?.title || "video");
                              toast.success("Video downloaded");
                            } catch {
                              window.open(video.video_url!, "_blank");
                            }
                          }}
                        >
                          <Download size={13} />
                        </Button>
                      </div>

                      {/* Back into the flow that made this. A finished video
                          used to be a dead end: the only way to change
                          anything was to start again from a blank brief and
                          retype the whole thing. */}
                      {video.project_id && video.projects?.ai_script?.script && (
                        video.render_provider === "camera" ? (
                          /* Straight back to the camera tab, which is where
                             this was recorded — the recorder that composites
                             the photos, the branding and the music.
                             ?record=1 sent it to the editor's Video setup
                             step instead: format, avatar looks, music beds,
                             none of which apply to a take you read yourself,
                             and the teleprompter another scroll below that.
                             Same sessionStorage handoff the editor's own
                             "Record on Camera" button uses. */
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-1.5"
                            onClick={() => {
                              const s = video.projects?.ai_script;
                              const combined = [s?.hook, s?.script, s?.cta]
                                .map((t) => (t ?? "").trim())
                                .filter(Boolean)
                                .join("\n\n");
                              try {
                                sessionStorage.setItem("camera-record-script", combined);
                                // The take's photos too (2026-10-21): the
                                // camera tab already takes this handoff.
                                const photos = video.metadata?.camera_photos ?? [];
                                if (photos.length) sessionStorage.setItem("camera-record-photos", JSON.stringify(photos));
                              } catch { /* sessionStorage unavailable */ }
                              router.push("/create?tab=camera");
                            }}
                          >
                            <Camera size={13} /> Record again
                          </Button>
                        ) : (
                          <Link href={`/create/${video.project_id}`}>
                            <Button variant="outline" size="sm" className="w-full gap-1.5">
                              <RefreshCw size={13} /> Edit &amp; remake
                            </Button>
                          </Link>
                        )
                      )}
                    </div>
                  )}

                  {/* Failed state */}
                  {video.render_status === "failed" && (
                    <div className="mt-3 space-y-2">
                      {video.metadata?.render_error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5 break-words">
                          {video.metadata.render_error}
                        </p>
                      )}
                    <div className="flex gap-2">
                      {/* Back to the project that failed, not a blank brief —
                          the script survived the render, and starting over
                          meant retyping it. */}
                      <Link
                        href={
                          video.project_id && video.projects?.ai_script?.script
                            ? `/create/${video.project_id}`
                            : "/create"
                        }
                        className="flex-1"
                      >
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
        <OlderList
          kind="videos"
          items={olderVideoItems}
          checking={selecting === "videos"}
          isChecked={(id) => selected.includes(id)}
          onCheck={toggleSelected}
          onStartSelect={() => { setPickingPosts(false); setPickedPosts([]); setSelecting("videos"); setSelected([]); }}
        />
        {selecting === "videos" && (
          <BatchBar
            count={selected.length}
            noun="video"
            total={videos.length}
            onSelectAll={() => setSelected(videos.map((v) => v.id))}
            onCancel={stopSelecting}
            onDelete={() => setBatchConfirm(true)}
          />
        )}
        </>
      )}

      {/* Video Preview Modal */}
      {previewVideo && previewVideo.video_url && (
        <VideoPreviewModal
          videoUrl={previewVideo.video_url}
          title={(previewVideo.projects as { title: string } | null)?.title || "Untitled Video"}
          videoType={previewVideo.video_type}
          videoId={previewVideo.id}
          onClose={() => setPreviewVideo(null)}
          onPublish={() => {
            setPreviewVideo(null);
            setPublishingVideo(previewVideo);
          }}
        />
      )}

      {/* Publish Modal */}
      {publishingVideo && (() => {
        const proj = publishingVideo.projects as {
          title: string;
          thumbnail_url?: string | null;
          ai_script?: { hook?: string; script?: string; description?: string; hashtags?: string[] } | null;
          seo_data?: { youtube_title?: string; youtube_description?: string; thumbnail_url?: string; hashtags?: string[] } | null;
        } | null;
        // The hashtags the share kit shows. They were generated with the
        // script, written to the project, displayed on step 5 as chips — and
        // then never reached the post, because Publish was the one screen that
        // didn't read them. seo_data first: the Tools page rewrites them there.
        const tags = proj?.seo_data?.hashtags?.length
          ? proj.seo_data.hashtags
          : proj?.ai_script?.hashtags ?? [];
        // The SEO step can time out during script generation, leaving
        // youtube_description empty — fall back to the script's own
        // description, then hook + script, so publish never starts blank.
        const fallbackDescription =
          proj?.seo_data?.youtube_description ||
          proj?.ai_script?.description ||
          [proj?.ai_script?.hook, proj?.ai_script?.script].filter(Boolean).join("\n\n").slice(0, 4900) ||
          "";
        /**
         * A dub carries the SOURCE project, so these project-derived defaults
         * are in the wrong language for it. Passing nothing lets the modal
         * resolve its own from /api/social/publish-defaults, which prefers the
         * translated copy stored on the video row.
         */
        if (publishingVideo.translation_language) {
          return (
            <PublishModal
              videoId={publishingVideo.id}
              videoTitle=""
              onClose={() => setPublishingVideo(null)}
              onPublished={loadVideos}
            />
          );
        }

        return (
          <PublishModal
            videoId={publishingVideo.id}
            videoTitle={proj?.seo_data?.youtube_title || proj?.title || "Untitled Video"}
            defaultDescription={fallbackDescription}
            // The short social blurb, which is what ai_script.description is
            // written to be ("2-sentence social media description"). The long
            // youtube_description above is right for YouTube and far too long
            // for an Instagram caption, so the two fields get the two texts
            // rather than one text twice.
            defaultCaption={proj?.ai_script?.description || ""}
            defaultTags={tags}
            // A real uploaded PNG first; the generated card is the fallback,
            // and its address is derived from the project id rather than read
            // back out of seo_data — see projectThumbnailUrl.
            thumbnailUrl={
              proj?.thumbnail_url
              || (publishingVideo.project_id ? projectThumbnailUrl(publishingVideo.project_id) : undefined)
            }
            onClose={() => setPublishingVideo(null)}
            onPublished={loadVideos}
          />
        );
      })()}

      {/* Translate Modal */}
      {translatingVideo && (
        <TranslateModal
          videoId={translatingVideo.id}
          videoTitle={(translatingVideo.projects as { title: string } | null)?.title || "Untitled Video"}
          // Mirrors the fallback in /api/video/translate: rows predating
          // credit_kind were charged the short allowance.
          videoKind={translatingVideo.metadata?.credit_kind === "long" ? "long" : "short"}
          onClose={() => setTranslatingVideo(null)}
          onSubmitted={() => {
            setTranslatingVideo(null);
            loadVideos();
          }}
        />
      )}

      {batchConfirm && selecting && selected.length > 0 && (
        <BatchDeleteModal
          count={selected.length}
          kind={selecting}
          isDeleting={batchDeleting}
          onClose={() => setBatchConfirm(false)}
          onConfirm={() => void handleBatchDelete()}
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
    <>
    {/* Autopilot drafts waiting (2026-10-21). */}
    <AutopilotBanner />
    <Suspense fallback={
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-52" />)}
      </div>
    }>
      <VideosContent />
    </Suspense>
    </>
  );
}
