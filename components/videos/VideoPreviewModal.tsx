"use client";

import { Button } from "@/components/ui/button";
import { X, Download, Send, Maximize2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface VideoPreviewModalProps {
  videoUrl: string;
  title: string;
  videoType: string;
  onClose: () => void;
  onPublish: () => void;
}

const typeLabel: Record<string, string> = {
  blog_long:    "Blog Video (16:9)",
  reel_9x16:    "Reel / Short (9:16)",
  youtube_16x9: "YouTube (16:9)",
  short_1x1:    "Square (1:1)",
};

export function VideoPreviewModal({ videoUrl, title, videoType, onClose, onPublish }: VideoPreviewModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-play when opened
  useEffect(() => {
    videoRef.current?.play().catch(() => {/* autoplay blocked — user must click play */});
  }, []);

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  }

  function toggleFullscreen() {
    if (!videoRef.current) return;
    if (!fullscreen) {
      videoRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setFullscreen(!fullscreen);
  }

  const isPortrait = videoType === "reel_9x16";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full ${isPortrait ? "max-w-sm" : "max-w-4xl"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-semibold text-brand-text text-sm truncate max-w-xs">{title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{typeLabel[videoType] || videoType}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-3 shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Video player */}
        <div className={`relative bg-black flex items-center justify-center ${isPortrait ? "aspect-[9/16]" : "aspect-video"}`}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full h-full object-contain"
            playsInline
          />

          {/* Overlay controls */}
          <div className="absolute top-3 right-3 flex gap-1.5">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors"
              title="Fullscreen"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 flex gap-3 shrink-0 border-t border-slate-100">
          <Button className="flex-1 gap-2" onClick={onPublish}>
            <Send size={14} /> Publish to Social
          </Button>
          <a href={videoUrl} download target="_blank" rel="noreferrer" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <Download size={14} /> Download
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
