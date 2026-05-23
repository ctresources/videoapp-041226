"use client";

import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

export function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }

  return (
    <div className="mt-14 rounded-2xl overflow-hidden border border-slate-200 shadow-2xl max-w-3xl mx-auto">
      {/* Browser chrome bar */}
      <div className="bg-slate-100 px-4 py-2.5 flex items-center gap-2 border-b border-slate-200">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-slate-400 mx-auto pr-10">
          VoiceToVideos.AI — Platform Demo
        </span>
      </div>

      {/* Video — aspect ratio holds space before metadata loads */}
      <div
        className="relative group cursor-pointer bg-black aspect-video"
        onClick={toggle}
      >
        <video
          ref={videoRef}
          src="/demo.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />

        {/* Play/pause overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
            playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          }`}
        >
          <div className="bg-black/60 backdrop-blur-sm rounded-full p-4 border border-white/20">
            {playing ? (
              <Pause size={32} className="text-white" />
            ) : (
              <Play size={32} className="text-white fill-white" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
