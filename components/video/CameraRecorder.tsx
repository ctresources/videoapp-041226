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
  Lightbulb,
  Megaphone,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { resolveCta } from "@/lib/utils/default-cta";
import { uploadCameraRecording } from "@/lib/utils/camera-upload";
import { BrandedComposite } from "@/lib/utils/branded-recorder";
import { VoiceFollower, LiveTranscriber, isVoiceFollowSupported, followWordInContainer } from "@/lib/utils/voice-follow";
import { PublishModal } from "@/components/social/PublishModal";
import { FieldMic } from "@/components/ui/field-mic";
import { TopicRadar } from "@/components/create/topic-radar";

type CamStep = "script" | "camera" | "done";

const SPEED_OPTIONS = [
  { label: "Slow", px: 12 },
  { label: "Medium", px: 24 },
  { label: "Fast", px: 42 },
];

// YouTube requires phone verification to upload videos longer than 15 minutes,
// so recordings are capped at 15:00 to keep every video publishable.
const MAX_RECORD_SECONDS = 15 * 60;
const WARN_RECORD_SECONDS = 13 * 60;

// Royalty-free music beds for Branded Look (same Mixkit tracks as the editor)
const MUSIC_OPTIONS = [
  { id: "none",      label: "No Music",   url: null as string | null },
  { id: "calm",      label: "Calm Piano", url: "https://assets.mixkit.co/music/download/mixkit-soft-piano-ballad-1590.mp3" },
  { id: "corporate", label: "Upbeat",     url: "https://assets.mixkit.co/music/download/mixkit-corporate-motivational-254.mp3" },
  { id: "inspiring", label: "Inspiring",  url: "https://assets.mixkit.co/music/download/mixkit-serene-view-443.mp3" },
];

// End card duration appended after Stop in Branded Look
const END_CARD_MS = 3200;

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function CameraRecorder({ city, state, initialScript }: { city?: string; state?: string; initialScript?: string } = {}) {
  const [step, setStep] = useState<CamStep>("script");
  const [script, setScript] = useState(initialScript ?? "");

  useEffect(() => {
    if (initialScript) setScript(initialScript);
  }, [initialScript]);
  const [showSpark, setShowSpark] = useState(false);
  const [sparkTopic, setSparkTopic] = useState("");
  const [sparking, setSparking] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  // "flow" = teleprompter follows the reader's voice; "auto" = constant speed
  const [scrollMode, setScrollMode] = useState<"auto" | "flow">("auto");
  const [flowSupported, setFlowSupported] = useState(false);
  const followerRef = useRef<VoiceFollower | null>(null);
  // Branded Look — opt-in record-time compositing (logo, name bar, captions,
  // music, end card). Off = the plain recording path runs untouched.
  const [brandedLook, setBrandedLook] = useState(false);
  const [brandedSupported, setBrandedSupported] = useState(false);
  const [liveCaptions, setLiveCaptions] = useState(true);
  const [musicId, setMusicId] = useState("none");
  const [brandedActive, setBrandedActive] = useState(false);
  const compositeRef = useRef<BrandedComposite | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const stoppingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState("Camera Recording");
  const [showPublish, setShowPublish] = useState(false);
  const [ctaProfile, setCtaProfile] = useState<{
    full_name: string | null; company_name: string | null;
    location_city: string | null; location_state: string | null;
    default_cta: string | null; market_years: string | null;
    avatar_url: string | null; logo_url: string | null;
    license_number: string | null; phone: string | null;
  } | null>(null);

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

  // Default to Flow when the browser supports it — it's the better experience
  useEffect(() => {
    if (isVoiceFollowSupported()) {
      setFlowSupported(true);
      setScrollMode("flow");
    }
    setBrandedSupported(BrandedComposite.isSupported());
  }, []);

  // Load the user's default CTA + profile details for the "Add Channel CTA" button
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("full_name, company_name, location_city, location_state, default_cta, market_years, avatar_url, logo_url, license_number, phone")
          .eq("id", user.id)
          .single();
        if (data) setCtaProfile(data as typeof ctaProfile);
      } catch { /* CTA button simply stays hidden */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addChannelCta() {
    const cta = resolveCta(ctaProfile?.default_cta, {
      city: city || ctaProfile?.location_city,
      state: state || ctaProfile?.location_state,
      name: ctaProfile?.full_name,
      company: ctaProfile?.company_name,
      years: ctaProfile?.market_years,
    });
    setScript((s) => (s.trim() ? `${s.trimEnd()}\n\n${cta}` : cta));
    toast.success("Channel CTA added to the end of your script!");
  }

  // Auto-stop at the 15-minute cap so the video stays YouTube-publishable.
  // Branded Look appends a ~3s end card, so it stops early enough to fit.
  useEffect(() => {
    const cap = brandedActive ? MAX_RECORD_SECONDS - Math.ceil(END_CARD_MS / 1000) - 1 : MAX_RECORD_SECONDS;
    if (isRecording && seconds >= cap) {
      stopRecording();
      toast("15-minute limit reached — your recording has been saved.", { icon: "⏱️" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, isRecording, brandedActive]);

  async function openCamera() {
    setCamError(null);
    try {
      // Ask for 1080p at 60fps — browsers gracefully fall back to the best the camera supports
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Branded Look: route the camera through the compositing canvas so the
      // preview shows exactly what gets recorded. Any failure falls back to
      // the plain path — the recording itself is never blocked.
      let previewStream: MediaStream = stream;
      if (brandedLook && brandedSupported) {
        try {
          const music = MUSIC_OPTIONS.find((m) => m.id === musicId)?.url ?? null;
          const composite = new BrandedComposite(
            {
              name: ctaProfile?.full_name,
              brokerage: ctaProfile?.company_name,
              license: ctaProfile?.license_number,
              phone: ctaProfile?.phone,
              city: city || ctaProfile?.location_city,
              state: state || ctaProfile?.location_state,
              logoUrl: ctaProfile?.logo_url,
              headshotUrl: ctaProfile?.avatar_url,
            },
            music,
          );
          previewStream = await composite.init(stream);
          compositeRef.current = composite;
          setBrandedActive(true);
        } catch (err) {
          console.warn("[camera] Branded Look unavailable, recording plain:", err);
          compositeRef.current = null;
          setBrandedActive(false);
          toast("Branded Look unavailable on this device — recording without overlays.", { icon: "🎬" });
        }
      } else {
        setBrandedActive(false);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = previewStream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
      setStep("camera");
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    compositeRef.current?.destroy();
    compositeRef.current = null;
    setBrandedActive(false);
    transcriberRef.current?.stop();
    transcriberRef.current = null;
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
    // Branded Look records the composited canvas stream; plain mode records
    // the raw camera stream exactly as before.
    const sourceStream = compositeRef.current?.stream ?? streamRef.current;
    if (!sourceStream) return;
    chunksRef.current = [];
    scrollPosRef.current = 0;
    if (teleRef.current) teleRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });

    const mimeType =
      ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ) || "";

    const recorder = new MediaRecorder(sourceStream, mimeType ? { mimeType } : {});
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
    compositeRef.current?.startMusic();
    startPrompter();
  }

  // Starts the scroll engine for the current mode: Flow (voice-follow) with
  // automatic fallback to constant-speed auto-scroll if recognition dies.
  // When Branded Look live captions are on, the same recognizer also feeds
  // the burned-in caption overlay (only one recognizer ever runs).
  function startPrompter() {
    const wantCaptions = brandedActive && liveCaptions && flowSupported;
    const feedCaption = wantCaptions
      ? (text: string) => compositeRef.current?.setCaption(text)
      : undefined;

    if (scrollMode === "flow" && flowSupported) {
      followerRef.current?.stop();
      const follower = new VoiceFollower(
        script,
        (i) => followWordInContainer(teleRef.current, i),
        () => {
          followerRef.current = null;
          toast("Voice-follow unavailable — switching to auto-scroll.", { icon: "🎚️" });
          setScrollMode("auto");
          startScroll();
        },
        feedCaption,
      );
      followerRef.current = follower;
      follower.start();
    } else {
      startScroll();
      if (wantCaptions) {
        transcriberRef.current?.stop();
        const transcriber = new LiveTranscriber(
          (text) => compositeRef.current?.setCaption(text),
          () => { transcriberRef.current = null; },
        );
        transcriberRef.current = transcriber;
        transcriber.start();
      }
    }
  }

  function stopPrompter() {
    stopScroll();
    followerRef.current?.stop();
    followerRef.current = null;
    transcriberRef.current?.stop();
    transcriberRef.current = null;
  }

  function pauseRecording() {
    recorderRef.current?.pause();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopScroll();
    followerRef.current?.pause();
    transcriberRef.current?.pause();
    compositeRef.current?.pauseMusic();
    setIsPaused(true);
  }

  function resumeRecording() {
    recorderRef.current?.resume();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    if (followerRef.current) followerRef.current.resume();
    else if (scrollMode === "auto") startScroll();
    transcriberRef.current?.resume();
    compositeRef.current?.startMusic();
    setIsPaused(false);
  }

  function stopRecording() {
    if (stoppingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopPrompter();
    setIsRecording(false);
    setIsPaused(false);

    // Branded Look: show the branded end card for ~3s before finalizing —
    // music keeps playing underneath, then recorder.onstop tears everything down.
    if (brandedActive && compositeRef.current) {
      stoppingRef.current = true;
      compositeRef.current.beginEndCard(END_CARD_MS);
      setTimeout(() => {
        stoppingRef.current = false;
        recorderRef.current?.stop();
      }, END_CARD_MS + 150);
    } else {
      recorderRef.current?.stop();
    }
  }

  function handleReset() {
    closeCamera();
    stopPrompter();
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

  async function handleSpark() {
    if (!sparkTopic.trim()) return;
    setSparking(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: sparkTopic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setScript(data.script);
      setShowSpark(false);
      setSparkTopic("");
      toast.success("Script ready!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setSparking(false);
    }
  }

  async function handleSaveForSocial() {
    if (!videoBlob) return;
    setSaving(true);
    try {
      const title = script.split(/\n/)[0].slice(0, 100).trim() || "Camera Recording";
      const { videoId, title: savedName } = await uploadCameraRecording(videoBlob, { title });
      setSavedVideoId(videoId);
      setSavedTitle(savedName);
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
      followerRef.current?.stop();
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
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-brand-text">Your Script</label>
            <div className="flex items-center gap-3">
              <button
                onClick={addChannelCta}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-sm transition-colors"
                title="Append your subscribe & contact CTA to the script"
              >
                <Megaphone size={15} />
                Add Channel CTA
              </button>
              <button
                onClick={() => setShowSpark((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <Sparkles size={12} />
                {showSpark ? "Hide" : "Spark with AI"}
              </button>
            </div>
          </div>

          {showSpark && (
            <div className="mb-3 p-3 bg-primary-50 border border-primary-100 rounded-xl">
              <TopicRadar city={city} state={state} onSelect={(t) => setSparkTopic(t)} />
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={sparkTopic}
                  onChange={(e) => setSparkTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !sparking && handleSpark()}
                  placeholder="What do you want to speak about?"
                  className="flex-1 text-sm px-3 py-2 border border-primary-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                />
                <Button
                  size="sm"
                  onClick={handleSpark}
                  disabled={!sparkTopic.trim() || sparking}
                  className="gap-1.5 shrink-0"
                >
                  {sparking ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  {sparking ? "Sparking..." : "Spark It"}
                </Button>
              </div>
            </div>
          )}

          <div className="relative">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Type your script, or tap the mic to speak it…"
              className="w-full h-36 text-sm px-3 py-3 pr-14 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
            />
            <div className="absolute bottom-2 right-2">
              <FieldMic
                size="md"
                onTranscript={(t) => setScript((s) => s ? `${s} ${t}` : t)}
                title="Hit the Mic — Speak Your Script"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1 mb-2">
            {script.trim().split(/\s+/).filter(Boolean).length} words
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Teleprompter Mode
          </p>
          {flowSupported && (
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setScrollMode("flow")}
                className={cn(
                  "flex-1 py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all",
                  scrollMode === "flow"
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                🎙 Flow — Follows Your Voice
              </button>
              <button
                onClick={() => setScrollMode("auto")}
                className={cn(
                  "flex-1 py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all",
                  scrollMode === "auto"
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                Auto — Constant Speed
              </button>
            </div>
          )}
          {scrollMode === "flow" && flowSupported ? (
            <p className="text-xs text-slate-400">
              The Teleprompter Listens And Scrolls At Your Pace — Pause To Think And It Waits For You
            </p>
          ) : (
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
          )}
        </div>

        {/* Branded Look — record-time overlays baked into the file */}
        {brandedSupported && (
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl">
            <label className="flex items-center justify-between cursor-pointer select-none">
              <span className="text-sm font-semibold text-brand-text">✨ Branded Look</span>
              <div
                onClick={(e) => { e.preventDefault(); setBrandedLook((v) => !v); }}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors",
                  brandedLook ? "bg-indigo-500" : "bg-slate-300",
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                  brandedLook ? "left-[18px]" : "left-0.5",
                )} />
              </div>
            </label>
            <p className="text-xs text-slate-500 mt-1">
              Burns your logo, name bar, and a 3-second branded end card into the recording — no editing needed.
            </p>
            {brandedLook && (
              <div className="mt-3 flex flex-col gap-2.5">
                {flowSupported && (
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={liveCaptions}
                      onChange={(e) => setLiveCaptions(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4 mt-0.5 shrink-0"
                    />
                    <span className="text-xs text-slate-600">
                      <strong>Live captions</strong> — burned in as you speak.{" "}
                      <span className="text-slate-400">~95% accuracy; a misheard word is permanent.</span>
                    </span>
                  </label>
                )}
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Music Bed <span className="font-normal text-slate-400">(mixed softly under your voice — permanent)</span></p>
                  <div className="flex gap-2">
                    {MUSIC_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMusicId(m.id)}
                        className={cn(
                          "flex-1 py-1.5 px-1 rounded-lg text-xs font-medium border transition-all",
                          musicId === m.id
                            ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                            : "border-slate-200 text-slate-500 hover:border-slate-300",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  What you see in the camera preview is exactly what gets recorded — overlays can&apos;t be removed afterwards.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tips for best video */}
        <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-xl">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Lightbulb size={13} className="text-emerald-500" /> Tips For Best Video
          </p>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc pl-4">
            <li>Film in <strong>1080p (Full HD) or higher at 60 fps</strong> — set this in your phone&apos;s camera settings before recording</li>
            <li>The <strong>back camera</strong> is much sharper than the selfie camera — use it when you don&apos;t need the teleprompter (or have someone film you)</li>
            <li>Face a window or light source — never sit with a bright light behind you</li>
            <li>Keep the camera at eye level and record in a quiet room</li>
            <li><strong>8–15 minutes</strong> is YouTube&apos;s algorithm sweet spot — and 8+ minutes unlocks mid-roll ads</li>
            <li>End with a subscribe CTA — tap <strong>Add Channel CTA</strong> above to drop yours into the script so the teleprompter reads it for you</li>
          </ul>
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
        {!script.trim() ? (
          <p className="text-xs text-slate-400 text-center -mt-3">
            Speak Or Spark A Script To Continue
          </p>
        ) : (
          <p className="text-xs text-slate-400 text-center -mt-3">
            8–15 Min Is YouTube&apos;s Sweet Spot — 8+ Min Unlocks Mid-Roll Ads · 15 Min Max
          </p>
        )}
      </div>
    );
  }

  // ── Camera step (preview + recording) ─────────────────────────────────────
  if (step === "camera") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Teleprompter pinned to the very top (right under the device lens) so
            you read while looking at the camera. Shown once recording starts. */}
        {isRecording && (
          <div
            ref={teleRef}
            className="shrink-0 h-40 sm:h-44 bg-black/85 backdrop-blur-sm px-5 py-4 overflow-hidden select-none border-b border-white/10"
          >
            <p className="text-white text-xl sm:text-2xl leading-9 font-semibold whitespace-pre-wrap text-center">
              {/* Words carry data-w indices so Flow mode can scroll to and highlight the reader's position */}
              {(() => {
                let w = 0;
                return script.split(/(\s+)/).map((part, i) =>
                  /\S/.test(part) ? <span key={i} data-w={w++}>{part}</span> : part,
                );
              })()}
            </p>
            <div className="h-40" />
          </div>
        )}

        {/* Camera preview fills the remaining space — as large as possible */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            // Branded preview shows the composited canvas (unmirrored, WYSIWYG);
            // plain preview mirrors like a selfie camera.
            className={cn("w-full h-full object-cover", !brandedActive && "[transform:scaleX(-1)]")}
          />
          {isRecording && !isPaused && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span
                className={cn(
                  "text-xs font-medium font-mono",
                  seconds >= WARN_RECORD_SECONDS ? "text-amber-400" : "text-white",
                )}
              >
                {formatTime(seconds)} / 15:00
              </span>
            </div>
          )}
          {isPaused && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Pause size={11} className="text-yellow-400" />
              <span className="text-white text-xs font-medium">{formatTime(seconds)}</span>
            </div>
          )}

          {/* Pre-record hint, centered over the live camera */}
          {!isRecording && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3">
              <Video size={15} className="text-primary-300 shrink-0" />
              <p className="text-xs text-white/90">
                Camera Is Live. Press{" "}
                <strong>Start Recording</strong> —{" "}
                {scrollMode === "flow" && flowSupported
                  ? <>The Teleprompter Will <strong>Follow Your Voice</strong> As You Read.</>
                  : <>The Teleprompter Will Scroll Automatically.</>}{" "}
                Record Up To <strong>15 Minutes</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Bottom control bar */}
        <div className="shrink-0 flex flex-col gap-2 bg-black/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Speed control while paused (auto mode only — Flow paces itself) */}
          {isPaused && scrollMode === "auto" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60 shrink-0">Speed:</span>
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => setSpeedIdx(i)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    speedIdx === i
                      ? "border-primary-400 bg-primary-500/20 text-primary-200"
                      : "border-white/20 text-white/60",
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
                <Button onClick={handleReset} variant="ghost" size="lg" className="gap-2 flex-1 text-white hover:bg-white/10">
                  <RotateCcw size={15} /> Back
                </Button>
                <Button onClick={startRecording} size="lg" className="gap-2 flex-[2]">
                  <Video size={17} /> Start Recording
                </Button>
              </>
            )}
            {isRecording && !isPaused && (
              <>
                <Button onClick={pauseRecording} variant="outline" size="lg" className="gap-2 flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20">
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
