"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

/**
 * "From my YouTube" (2026-10-25, the owner's ask): the videos already on the
 * connected channel. Pick one and a Share Kit starts from its title and
 * description, so the LinkedIn, Facebook and Instagram posts can be written.
 */
type Video = { videoId: string; title: string; description: string; publishedAt: string; thumbnail: string };

export function YouTubePicker() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/social/youtube/videos")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Couldn't load your YouTube videos.");
        setVideos((d.videos ?? []) as Video[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your YouTube videos."));
  }, []);

  async function pick(v: Video) {
    setOpening(v.videoId);
    try {
      const res = await fetch("/api/social/youtube/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: v.videoId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't start from that video.");
      router.push(`/create/${d.projectId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start from that video.");
      setOpening(null);
    }
  }

  return (
    <div className="rounded-xl border border-spark-rule bg-white p-3">
      <p className="text-sm font-bold text-spark-ink-soft mb-1">From my YouTube</p>
      <p className="text-[12px] text-spark-ink-muted mb-3">
        A video already on your channel. Pick it and its LinkedIn, Facebook and Instagram posts are written from its title and description.
      </p>
      {!videos && !error && (
        <p className="flex items-center gap-2 text-[13px] text-spark-ink-muted"><Loader2 size={14} className="animate-spin" /> Loading your videos…</p>
      )}
      {error && <p className="text-[13px] text-amber-700">{error}</p>}
      {videos && videos.length === 0 && <p className="text-[13px] text-spark-ink-muted">No videos on your channel yet.</p>}
      {videos && videos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {videos.map((v) => (
            <li key={v.videoId}>
              <button
                type="button"
                onClick={() => void pick(v)}
                disabled={!!opening}
                className="flex w-full flex-col overflow-hidden rounded-lg border border-spark-rule text-left transition-colors hover:border-spark-amber disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {v.thumbnail ? <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video w-full bg-slate-100" />}
                <span className="line-clamp-2 px-2 py-1.5 text-[12px] font-semibold text-spark-ink">
                  {opening === v.videoId ? "Starting…" : v.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
