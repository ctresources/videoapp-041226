"use client";

import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/lib/hooks/use-voice-recorder";
import { Mic, Pause, Play, Square, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob, durationSeconds: number) => void;
  maxSeconds?: number;
}

export function VoiceRecorder({ onRecordingComplete, maxSeconds = 300 }: VoiceRecorderProps) {
  const { state, seconds, audioBlob, audioUrl, amplitudes, start, pause, resume, stop, reset, error } =
    useVoiceRecorder();

  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";
  const isIdle = state === "idle";

  function handleUseRecording() {
    if (audioBlob) onRecordingComplete(audioBlob, seconds);
  }

  // Auto-stop at max duration
  if (seconds >= maxSeconds && isRecording) stop();

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Waveform visualizer */}
      <div className="w-full h-20 flex items-center justify-center gap-0.5 bg-slate-50 rounded-2xl px-4 overflow-hidden">
        {amplitudes.map((amp, i) => (
          <div
            key={i}
            className={cn(
              "w-1 rounded-full transition-all duration-75",
              isRecording ? "bg-primary-500" : isPaused ? "bg-slate-300" : "bg-slate-200"
            )}
            style={{ height: `${Math.max(4, amp * 0.7)}px` }}
          />
        ))}
      </div>

      {/* Timer */}
      <div className="flex flex-col items-center gap-1">
        <span className={cn(
          "text-4xl font-mono font-bold tabular-nums",
          isRecording ? "text-brand-text" : "text-slate-400"
        )}>
          {formatTime(seconds)}
        </span>
        {maxSeconds && (
          <span className="text-xs text-slate-400">
            Max {formatTime(maxSeconds)}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {isIdle && (
          <Button onClick={start} size="lg" className="gap-2 px-8">
            <Mic size={18} /> Start Recording
          </Button>
        )}

        {isRecording && (
          <>
            <Button onClick={pause} variant="outline" size="lg" className="gap-2">
              <Pause size={18} /> Pause
            </Button>
            <Button onClick={stop} variant="danger" size="lg" className="gap-2">
              <Square size={18} /> Stop
            </Button>
          </>
        )}

        {isPaused && (
          <>
            <Button onClick={resume} variant="primary" size="lg" className="gap-2">
              <Play size={18} /> Resume
            </Button>
            <Button onClick={stop} variant="danger" size="lg" className="gap-2">
              <Square size={18} /> Stop
            </Button>
          </>
        )}

        {isStopped && (
          <>
            <Button onClick={reset} variant="ghost" size="lg" className="gap-2">
              <RotateCcw size={16} /> Re-record
            </Button>
            <Button onClick={handleUseRecording} size="lg" className="gap-2 px-8">
              Use This Recording
            </Button>
          </>
        )}

        {state === "error" && (
          <Button onClick={reset} variant="outline" size="lg" className="gap-2">
            <RotateCcw size={16} /> Try Again
          </Button>
        )}
      </div>

      {/* Audio preview */}
      {isStopped && audioUrl && (
        <div className="w-full bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-2 font-medium">Preview your recording</p>
          <audio src={audioUrl} controls className="w-full h-9" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 w-full">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Recording in progress...
        </div>
      )}
    </div>
  );
}
