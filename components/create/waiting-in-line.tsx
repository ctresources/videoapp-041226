"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * The editor's last step while a video waits in line (lib/video/render-queue).
 *
 * HeyGen was running its ten jobs when Spark Video was pressed, so the video
 * is waiting its turn rather than being turned away. This watches its place
 * and hands over to the usual rendering screen the moment it starts.
 */
export function WaitingInLine({
  projectId,
  queueId,
  position,
  onStarted,
  onGone,
}: {
  projectId: string;
  queueId: string;
  position: number;
  onStarted: (videoId: string, renderJobId: string | null) => void;
  /** Taken out of line, or it could not start. The editor goes back a step. */
  onGone: () => void;
}) {
  const [place, setPlace] = useState(position);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    let stop = false;
    async function check() {
      try {
        const res = await fetch(`/api/video/queue?projectId=${encodeURIComponent(projectId)}`);
        const data = await res.json().catch(() => ({}));
        const item = data?.item as {
          id: string; status: string; position: number | null;
          videoId: string | null; renderJobId: string | null; error: string | null;
        } | null;
        if (stop || done.current || !item || item.id !== queueId) return;
        if (item.status === "started" && item.videoId) {
          done.current = true;
          toast.success("Your video has started.");
          onStarted(item.videoId, item.renderJobId);
        } else if (item.status === "failed") {
          done.current = true;
          toast.error(item.error || "Your video couldn't start. Press Spark Video to try again.");
          onGone();
        } else if (item.status === "cancelled") {
          done.current = true;
          onGone();
        } else if (item.position) {
          setPlace(item.position);
        }
      } catch { /* checked again shortly */ }
    }
    const id = setInterval(check, 15_000);
    void check();
    return () => { stop = true; clearInterval(id); };
  }, [projectId, queueId, onStarted, onGone]);

  async function leave() {
    setLeaving(true);
    try {
      await fetch("/api/video/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: queueId }),
      });
      done.current = true;
      onGone();
    } catch {
      toast.error("Couldn't take it out of line. Try again.");
      setLeaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-spark-amber bg-spark-amber-tint p-5">
      <p className="flex items-center gap-2 text-[17px] font-bold text-spark-ink">
        <Clock size={18} className="text-[#A3660F]" aria-hidden />
        You&apos;re in line{place > 1 ? ` (number ${place})` : ""}
      </p>
      <p className="mt-1.5 text-[14px] leading-[1.5] text-spark-ink-soft">
        Lots of videos are being made right now. Yours starts on its own in a few minutes, and
        nothing is charged until it does. You can close this page; it will show in My Sparks.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[13px] text-spark-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Waiting for a free slot
        </span>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="text-[13px] font-semibold text-spark-ink-muted hover:text-red-600 disabled:opacity-50"
        >
          Take it out of line
        </button>
      </div>
    </div>
  );
}
