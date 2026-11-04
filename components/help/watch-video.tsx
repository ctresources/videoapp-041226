"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import type { HowToVideo } from "@/lib/help/how-to-videos";
import { HOW_TO_SECTION_VIDEOS } from "@/lib/help/how-to-section-videos";

/**
 * A sub-section's own button (2026-11-03): the same "▶ Watch video 0:28",
 * placed beside a paragraph's heading on How It Works. Nothing when that
 * section has no video yet.
 */
export function SectionVideo({ id }: { id: string }) {
  const video = HOW_TO_SECTION_VIDEOS[id];
  if (!video) return null;
  return <span className="mx-1.5 inline-block align-middle"><WatchVideo video={video} /></span>;
}

/**
 * "▶ Watch video 0:32" beside a How It Works step title (2026-11-01, the
 * owner's mockup). Opens the step's how-to video over the page; Close, Escape
 * or a tap outside returns to the same spot.
 */
export function WatchVideo({ video }: { video: HowToVideo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const length = `${Math.floor(video.seconds / 60)}:${String(video.seconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", onKey);
    ref.current?.play().catch(() => {});
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-spark-amber px-3 py-1 text-[13.5px] font-bold text-white hover:brightness-110">
        <Play size={13} fill="currentColor" /> Watch video <span className="font-semibold opacity-85">{length}</span>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`${video.title} video`}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,13,11,0.72)] p-4">
          <div className="w-full max-w-[900px] overflow-hidden rounded-2xl bg-[#0f0d0b] shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-2.5 px-4 py-3 text-white">
              <b className="truncate text-[15px]">{video.title}</b>
              <span className="shrink-0 text-[13px] text-[#cdbf9f]">{video.step > 0 ? `Step ${video.step} · ` : ""}{length}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="ml-auto flex shrink-0 items-center gap-1 rounded-[10px] bg-[#2a2219] px-3 py-1.5 text-[14px] font-semibold">
                <X size={14} /> Close
              </button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are burned in */}
            <video ref={ref} src={video.src} poster={video.poster} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
          </div>
        </div>
      )}
    </>
  );
}
