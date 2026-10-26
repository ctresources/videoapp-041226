"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { X, Play } from "lucide-react";
import { ThumbnailEditButton } from "@/components/social/thumbnail-edit-button";

interface Notice {
  videoId: string;
  projectId: string | null;
  title: string;
  thumbnail: string | null;
}

/** A soft two-note chime. Browsers may block it before a tap; that's fine. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1318.5].forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      o.type = "sine";
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* no sound is fine */ }
}

/**
 * Sparklee says "Your video is ready!" on whatever page you're on
 * (2026-10-26, usability sweep #9). Checks every 20 seconds while a video is
 * being made, every 2 minutes otherwise, and only while the tab is open.
 * Once shown, the follow-up email is skipped.
 */
export function VideoReadyPopup({ preview }: { /** Shown as is, nothing checked (screenshots). */ preview?: Notice } = {}) {
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice | null>(preview ?? null);
  const seen = useRef(new Set<string>());
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (preview) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function markSeen(id: string) {
      seen.current.add(id);
      await fetch("/api/video/ready-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id }),
      }).catch(() => {});
    }

    async function check() {
      let rendering = false;
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch("/api/video/ready-notices");
          if (r.ok) {
            const d = (await r.json()) as { notices: Notice[]; rendering: boolean };
            rendering = d.rendering;
            const next = d.notices.find((n) => !seen.current.has(n.videoId));
            if (next) {
              void markSeen(next.videoId);
              // The editor for this very video already says it's ready.
              const onItsEditor = !!next.projectId && pathRef.current.startsWith(`/create/${next.projectId}`);
              if (!onItsEditor) {
                setNotice(next);
                chime();
              }
            }
          }
        } catch { /* try again next time */ }
      }
      if (!stopped) timer = setTimeout(check, rendering ? 20_000 : 120_000);
    }

    timer = setTimeout(check, 4_000);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [preview]);

  if (!notice) return null;
  const watchHref = `/videos?highlight=${notice.videoId}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-spark-rule bg-white p-3 shadow-[0_14px_30px_-14px_rgba(15,23,42,0.35)]"
    >
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-spark-amber-tint ring-2 ring-spark-amber/60 animate-pulse">
          <Image src="/sparklee.webp" alt="" width={40} height={40} className="h-full w-full" unoptimized />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-spark-ink">Your video is ready!</p>
          <p className="truncate text-sm text-spark-ink-soft">{notice.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={watchHref}
              onClick={() => setNotice(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Play size={12} /> Watch
            </Link>
            {notice.projectId && (
              <ThumbnailEditButton
                projectId={notice.projectId}
                className="rounded-lg border border-spark-amber/40 bg-spark-amber-tint px-3 py-1.5 text-xs font-semibold text-spark-ink"
                onDone={() => setNotice(null)}
              />
            )}
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={() => setNotice(null)} className="text-spark-ink-faint hover:text-spark-ink">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
