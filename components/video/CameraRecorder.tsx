"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Square,
  RotateCcw,
  Download,
  Play,
  Pause,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronRight,
  Video,
  Share2,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils/cn";
import { PublishModal } from "@/components/social/PublishModal";

type CamStep = "script" | "camera" | "done";

const SPEED_OPTIONS = [
  { label: "Slow", px: 18 },
  { label: "Medium", px: 36 },
  { label: "Fast", px: 58 },
];

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function CameraRecorder() {
  const [step, setStep] = useState<CamStep>("script");
  const [script, setScript] = useState("");
  const [speedIdx, setSpeedIdx] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showAiGen, setShowAiGen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState("Camera Recording");
  const [showPublish, setShowPublish] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const teleRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const speedRef = useRef(SPEED_OPTIONS[1].px);

  useEffect(() => {
    speedRef.current = SPEED_OPTIONS[speedIdx].px;
  }, [speedIdx]);

  async function openCamera() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStep("camera");
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      setCamError(
        msg.includes("permission") || msg.includes("notallowed") || msg.includes("denied")
          ? "Camera or microphone access was denied. Please allow access in your browser settings and try again."
          : "Could not access your camera. Make sure it is not in use by another application.",
      );
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function startScroll() {
    if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
    scrollTimerRef.current = setInterval(() => {
      if (!teleRef.current) return;
      scrollPosRef.current += speedRef.current / 30;
      teleRef.current.scrollTop = scrollPosRef.current;
    }, 33);
  }

  function stopScroll() {
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    scrollPosRef.current = 0;
    if (teleRef.current) teleRef.current.scrollTop = 0;

    const mimeType =
      ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ) || "";

    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      closeCamera();
      setStep("done");
    };

    recorder.start(200);
    recorderRef.current = recorder;
    setIsRecording(true);
    setIsPaused(false);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    startScroll();
  }

  function pauseRecording() {
    recorderRef.current?.pause();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopScroll();
    setIsPaused(true);
  }

  function resumeRecording() {
    recorderRef.current?.resume();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    startScroll();
    setIsPaused(false);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopScroll();
    setIsRecording(false);
    setIsPaused(false);
  }

  function handleReset() {
    closeCamera();
    stopScroll();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoBlob(null);
    setIsRecording(false);
    setIsPaused(false);
    setSeconds(0);
    scrollPosRef.current = 0;
    setCamError(null);
    setStep("script");
  }

  function handleDownload() {
    if (!videoUrl || !videoBlob) return;
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `my-video-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Download started!");
  }

  async function handleGenerateScript() {
    if (!genTopic.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: genTopic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setScript(data.script);
      setShowAiGen(false);
      setGenTopic("");
      toast.success("Script ready!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveForSocial() {
    if (!videoBlob) return;
    setSaving(true);
    try {
      const title = script.split(/\n/)[0].slice(0, 100).trim() || "Camera Recording";
      const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("video", videoBlob, `recording.${ext}`);
      fd.append("title", title);
      const res = await fetch("/api/video/save-camera-recording", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSavedVideoId(data.videoId);
      setSavedTitle(data.title);
      setShowPublish(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      closeCamera();
      stopScroll();
      if (timerRef.current) clearInterval(timerRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Script step ─────────────────────────────────────────────────────────────
  if (step === "script") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Your Script
            </label>
            <button
              onClick={() => setShowAiGen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              <Sparkles size={12} />
              Generate with AI
            </button>
          </div>

          {showAiGen && (
            <div className="mb-3 p-3 bg-primary-50 border border-primary-100 rounded-xl">
              <p className="text-xs font-medium text-primary-700 mb-2">
                What topic should the script cover?
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerateScript()}
                  placeholder="e.g. Why now is a great time to sell in Austin, TX"
                  className="flex-1 text-sm px-3 py-2 border border-primary-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                />
                <Button
                  size="sm"
                  onClick={handleGenerateScript}
                  disabled={!genTopic.trim() || generating}
                  className="gap-1.5 shrink-0"
                >
                  {generating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  {generating ? "Writing..." : "Generate"}
                </Button>
              </div>
              <p className="text-xs text-primary-600/70 mt-1.5">
                AI will write a 2–3 minute teleprompter script for you
              </p>
            </div>
          )}

          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Type or paste your script here. It will scroll automatically while you record."
            className="w-full h-44 text-sm px-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
          />
          <p className="text-xs text-slate-400 mt-1">
            {script.trim().split(/\s+/).filter(Boolean).length} words
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Teleprompter Speed
          </p>
          <div className="flex gap-2">
            {SPEED_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setSpeedIdx(i)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all",
                  speedIdx === i
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {camError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{camError}</p>
          </div>
        )}

        <Button
          onClick={openCamera}
          size="lg"
          className="w-full gap-2"
          disabled={!script.trim()}
        >
          <Camera size={18} /> Open Camera
        </Button>
        {!script.trim() && (
          <p className="text-xs text-slate-400 text-center -mt-3">
            Enter or generate a script to continue
          </p>
        )}
      </div>
    );
  }

  // ── Camera step (preview + recording) ─────────────────────────────────────
  if (step === "camera") {
    return (
      <div className="flex flex-col gap-3">
        {/* Camera preview */}
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover [transform:scaleX(-1)]"
          />
          {isRecording && !isPaused && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-medium font-mono">{formatTime(seconds)}</span>
            </div>
          )}
          {isPaused && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Pause size={11} className="text-yellow-400" />
              <span className="text-white text-xs font-medium">{formatTime(seconds)}</span>
            </div>
          )}
        </div>

        {/* Teleprompter (only while recording) */}
        {isRecording && (
          <div
            ref={teleRef}
            className="h-28 bg-slate-900 rounded-xl px-5 py-3 overflow-hidden select-none"
          >
            <p className="text-white text-base leading-8 font-medium whitespace-pre-wrap">
              {script}
            </p>
            {/* Trailing space so last words scroll to the top */}
            <div className="h-24" />
          </div>
        )}

        {/* Pre-record hint */}
        {!isRecording && (
          <div className="flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
            <Video size={15} className="text-primary-500 shrink-0" />
            <p className="text-xs text-primary-700">
              Camera is live. Press{" "}
              <strong>Start Recording</strong> — the teleprompter will scroll automatically.
            </p>
          </div>
        )}

        {/* Speed control while paused */}
        {isPaused && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">Speed:</span>
            {SPEED_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setSpeedIdx(i)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  speedIdx === i
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-slate-200 text-slate-500",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!isRecording && (
            <>
              <Button onClick={handleReset} variant="ghost" size="lg" className="gap-2 flex-1">
                <RotateCcw size={15} /> Back
              </Button>
              <Button onClick={startRecording} size="lg" className="gap-2 flex-[2]">
                <Video size={17} /> Start Recording
              </Button>
            </>
          )}
          {isRecording && !isPaused && (
            <>
              <Button onClick={pauseRecording} variant="outline" size="lg" className="gap-2 flex-1">
                <Pause size={17} /> Pause
              </Button>
              <Button onClick={stopRecording} variant="danger" size="lg" className="gap-2 flex-1">
                <Square size={17} /> Stop
              </Button>
            </>
          )}
          {isPaused && (
            <>
              <Button onClick={resumeRecording} variant="primary" size="lg" className="gap-2 flex-1">
                <Play size={17} /> Resume
              </Button>
              <Button onClick={stopRecording} variant="danger" size="lg" className="gap-2 flex-1">
                <Square size={17} /> Stop
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Done step ──────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video">
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-brand-text">Recording complete</p>
          <span className="text-xs text-slate-400 font-mono">{formatTime(seconds)}</span>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleDownload} variant="outline" size="lg" className="gap-2">
            <Download size={16} /> Download
          </Button>
          <Button
            onClick={handleSaveForSocial}
            loading={saving}
            size="lg"
            className="gap-2"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Uploading...</>
            ) : (
              <><Share2 size={16} /> Upload to Social</>
            )}
          </Button>
        </div>

        <Button onClick={handleReset} variant="ghost" size="sm" className="gap-1.5 text-slate-400">
          <RotateCcw size={13} /> Re-record
        </Button>
      </div>

      {showPublish && savedVideoId && (
        <PublishModal
          videoId={savedVideoId}
          videoTitle={savedTitle}
          onClose={() => setShowPublish(false)}
          onPublished={() => setShowPublish(false)}
        />
      )}
    </>
  );
}
