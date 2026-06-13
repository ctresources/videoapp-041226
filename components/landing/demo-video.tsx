"use client";

import { useRef, useState } from "react";
import { Play, Pause, AlertCircle } from "lucide-react";

export function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  function toggle() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch((e) => {
        console.error("Video play failed:", e);
        setErrored(true);
      });
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
          SparkReels — Platform Demo
        </span>
      </div>

      {/* Video */}
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          src="/demo.mp4"
          autoPlay
          muted
          loop
          playsInline
          controls={errored}
          preload="auto"
          className="absolute inset-0 w-full h-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setErrored(true)}
        />

        {/* Custom overlay — hidden once errored (native controls take over) */}
        {!errored && (
          <div
            className={`absolute inset-0 flex items-center justify-center cursor-pointer transition-opacity duration-200 ${
              playing ? "opacity-0 hover:opacity-100" : "opacity-100"
            }`}
            onClick={toggle}
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-4 border border-white/20">
              {playing ? (
                <Pause size={32} className="text-white" />
              ) : (
                <Play size={32} className="text-white fill-white" />
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {errored && !playing && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
            <AlertCircle size={12} />
            Use controls below to play
          </div>
        )}
      </div>
    </div>
  );
}

