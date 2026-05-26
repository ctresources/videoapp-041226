"use client";

import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVoiceRecorder } from "@/lib/hooks/use-voice-recorder";
import {
  Mic, Upload, ArrowRight, CheckCircle, Loader2, FileText,
  MapPin, ChevronDown, ChevronUp, Building2, Video, Square,
  Pause, RotateCcw, AlertCircle,
} from "lucide-react";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { ContentTemplates, ContentTemplate } from "@/components/create/content-templates";
import { ListingVideoForm } from "@/components/create/listing-video-form";

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

type Step = "input" | "uploading" | "transcribing" | "done";
type InputMode = "create" | "upload" | "listing";
type RecordMode = "voice" | "camera";

// ─── Inline voice-to-topic mic ─────────────────────────────────────────────

function TopicMicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { state, audioBlob, start, stop, reset, error } = useVoiceRecorder();
  const [busy, setBusy] = useState(false);

  const isRecording = state === "recording" || state === "requesting";

  async function handleStop() {
    stop();
  }

  useEffect(() => {
    if (state === "stopped" && audioBlob && !busy) {
      setBusy(true);
      const form = new FormData();
      form.append("audio", audioBlob, `topic.${audioBlob.type.includes("mp4") ? "mp4" : "webm"}`);
      fetch("/api/voice/quick-transcribe", { method: "POST", body: form })
        .then((r) => r.json())
        .then((d) => {
          if (d.transcript) onTranscript(d.transcript.trim());
          else toast.error("Could not understand audio — please try again");
        })
        .catch(() => toast.error("Transcription failed"))
        .finally(() => { setBusy(false); reset(); });
    }
  }, [state, audioBlob]); // eslint-disable-line

  if (error) {
    return (
      <button
        type="button"
        onClick={reset}
        title={error}
        className="p-2 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
      >
        <Mic size={16} />
      </button>
    );
  }

  if (busy) {
    return (
      <div className="p-2" title="Transcribing…">
        <Loader2 size={16} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (isRecording) {
    return (
      <button
        type="button"
        onClick={handleStop}
        title="Stop recording"
        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors animate-pulse"
      >
        <Square size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Speak your topic"
      className="p-2 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-primary-50 transition-colors"
    >
      <Mic size={16} />
    </button>
  );
}

// ─── Hero voice recorder ─────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

interface VoiceHeroProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
}

function VoiceHero({ onRecordingComplete }: VoiceHeroProps) {
  const { state, seconds, audioBlob, audioUrl, amplitudes, start, pause, resume, stop, reset, error } =
    useVoiceRecorder();

  const isIdle = state === "idle" || state === "requesting";
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  function handleUse() {
    if (audioBlob) onRecordingComplete(audioBlob, seconds);
  }

  if (seconds >= 300 && isRecording) stop();

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Big mic button */}
      {(isIdle || isRecording || isPaused) && (
        <div className="relative flex items-center justify-center">
          {isRecording && (
            <>
              <div className="absolute w-40 h-40 rounded-full bg-red-100 animate-ping opacity-30" />
              <div className="absolute w-32 h-32 rounded-full bg-red-50 animate-pulse" />
            </>
          )}
          <button
            onClick={isRecording ? stop : isPaused ? stop : start}
            className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1 shadow-lg transition-all duration-200 ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 text-white scale-105"
                : isPaused
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-primary-600 hover:bg-primary-700 text-white hover:scale-105"
            }`}
          >
            {isRecording ? (
              <>
                <Square size={32} fill="white" />
                <span className="text-xs font-semibold">Stop</span>
              </>
            ) : isPaused ? (
              <>
                <Mic size={32} />
                <span className="text-xs font-semibold">Paused</span>
              </>
            ) : (
              <>
                <Mic size={36} />
                <span className="text-xs font-semibold mt-0.5">
                  {state === "requesting" ? "…" : "Record"}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Timer */}
      {(isRecording || isPaused) && (
        <div className="text-center">
          <span className={`text-3xl font-mono font-bold tabular-nums ${isRecording ? "text-red-500" : "text-amber-500"}`}>
            {formatTime(seconds)}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            {isRecording ? "Recording in progress — speak your video idea" : "Paused"}
          </p>
        </div>
      )}

      {/* Idle label */}
      {isIdle && state !== "requesting" && (
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">Tap to start speaking</p>
          <p className="text-xs text-slate-400 mt-1">Describe your topic, location, and key points</p>
        </div>
      )}

      {/* Waveform */}
      {isRecording && (
        <div className="w-full h-14 flex items-center justify-center gap-0.5 bg-red-50 rounded-2xl px-4 overflow-hidden">
          {amplitudes.map((amp, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-red-400 transition-all duration-75"
              style={{ height: `${Math.max(3, amp * 0.6)}px` }}
            />
          ))}
        </div>
      )}

      {/* Pause button */}
      {isRecording && (
        <button
          onClick={pause}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Pause size={13} /> Pause
        </button>
      )}

      {/* Resume/Stop while paused */}
      {isPaused && (
        <div className="flex items-center gap-3">
          <button
            onClick={resume}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            <Mic size={13} /> Resume
          </button>
          <span className="text-slate-300">·</span>
          <button
            onClick={stop}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <Square size={12} /> Stop
          </button>
        </div>
      )}

      {/* Stopped — preview + use */}
      {isStopped && (
        <div className="w-full flex flex-col gap-4">
          <div className="text-center">
            <p className="text-sm font-semibold text-brand-text">{formatTime(seconds)} recorded</p>
            <p className="text-xs text-slate-400 mt-0.5">Listen back or use this recording</p>
          </div>
          {audioUrl && <audio src={audioUrl} controls className="w-full h-10" />}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={14} /> Re-record
            </button>
            <Button onClick={handleUse} size="sm" className="flex-1 gap-1.5">
              Use Recording <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 w-full">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [inputMode, setInputMode] = useState<InputMode>("create");
  const [recordMode, setRecordMode] = useState<RecordMode>("voice");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<{ blob: Blob; duration: number } | null>(null);

  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [locZip, setLocZip] = useState("");
  const [locCustomTopic, setLocCustomTopic] = useState("");
  const [locAudience, setLocAudience] = useState("");
  const [locTone, setLocTone] = useState("");
  const [locCta, setLocCta] = useState("");
  const [locGenerating, setLocGenerating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const topic = searchParams.get("topic");
    const urlCity = searchParams.get("city");
    const urlState = searchParams.get("state");

    if (tab === "upload") setInputMode("upload");
    else if (tab === "listing") setInputMode("listing");
    // "record", "location", or no tab → unified "create" tab
    if (topic) { setLocCustomTopic(topic); setInputMode("create"); }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("location_city, location_state")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.location_city && !urlCity) setLocCity(data.location_city);
          if (data?.location_state && !urlState) setLocState(data.location_state);
          if (urlCity) setLocCity(urlCity);
          if (urlState) setLocState(urlState);
        });
    });
  }, []); // eslint-disable-line

  async function processAudio(blob: Blob, durationSeconds: number, title = "New Recording") {
    setStep("uploading");
    try {
      const formData = new FormData();
      formData.append("audio", blob, `recording.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      formData.append("title", title);
      formData.append("duration", String(durationSeconds));

      const uploadRes = await fetch("/api/voice/upload", { method: "POST", body: formData });
      const uploadBody = await safeJson(uploadRes);
      if (!uploadRes.ok) throw new Error((uploadBody.error as string) || `Upload failed (${uploadRes.status})`);
      const { recording, signedUrl } = uploadBody as { recording: { id: string }; signedUrl: string };
      setRecordingId(recording.id);

      setStep("transcribing");
      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id, signedUrl }),
      });
      const transcribeBody = await safeJson(transcribeRes);
      if (!transcribeRes.ok) throw new Error((transcribeBody.error as string) || `Transcription failed (${transcribeRes.status})`);
      const { transcript: text } = transcribeBody as { transcript: string };
      setTranscript(text);
      setStep("done");
      toast.success("Voice transcribed! Review and generate your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    }
  }

  function handleRecordingComplete(blob: Blob, duration: number) {
    setUploadedBlob({ blob, duration });
  }

  function handleFileSelected(file: File) {
    setUploadedFile(file);
  }

  async function handleContinue() {
    if (inputMode === "create" && uploadedBlob) {
      await processAudio(uploadedBlob.blob, uploadedBlob.duration);
    } else if (inputMode === "upload" && uploadedFile) {
      await processAudio(uploadedFile, 0, uploadedFile.name.replace(/\.[^/.]+$/, ""));
    }
  }

  async function handleGenerateVideo() {
    if (!recordingId) return;
    router.push(`/create/${recordingId}?source=recording`);
  }

  function handleTemplateSelect(template: ContentTemplate) {
    setLocCustomTopic(template.topic);
    setShowTemplates(false);
    setTimeout(() => {
      document.getElementById("loc-custom-topic")?.focus();
    }, 100);
  }

  async function handleGenerateLocationScript() {
    if (!locCity.trim() || !locState.trim()) return toast.error("City and state are required");
    if (!locCustomTopic.trim()) return toast.error("Please describe your topic");
    if (!locAudience) return toast.error("Please select a target audience");
    if (!locTone) return toast.error("Please select a brand style");

    setLocGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-location-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoType: "custom",
          city: locCity.trim(),
          state: locState.trim(),
          zip: locZip.trim() || undefined,
          customTopic: locCustomTopic.trim(),
          audience: locAudience,
          tone: locTone,
          ctaPreference: locCta || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || `Script generation failed (${res.status})`);
      toast.success("Location script ready!");
      const project = data.project as { id: string };
      router.push(`/create/${project.id}?source=location`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLocGenerating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">Create New Video</h2>
        <p className="text-slate-500 text-sm mt-1">
          Generate from a topic or record your voice — AI does the rest.
        </p>
      </div>

      {/* Tab bar */}
      {step === "input" && (
        <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setInputMode("create")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              inputMode === "create" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
            }`}
          >
            <Mic size={14} /> Create
          </button>
          <button
            onClick={() => setInputMode("upload")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              inputMode === "upload" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
            }`}
          >
            <Upload size={14} /> Upload
          </button>
          <button
            onClick={() => setInputMode("listing")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              inputMode === "listing" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
            }`}
          >
            <Building2 size={14} /> Listing
          </button>
        </div>
      )}

      {/* Progress steps */}
      {step !== "input" && (
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: "input", label: "Voice Input" },
            { key: "uploading", label: "Uploading" },
            { key: "transcribing", label: "Transcribing" },
            { key: "done", label: "Ready" },
          ].map(({ key, label }, i, arr) => {
            const steps: Step[] = ["input", "uploading", "transcribing", "done"];
            const currentIdx = steps.indexOf(step);
            const thisIdx = steps.indexOf(key as Step);
            const isActive = thisIdx === currentIdx;
            const isDone = thisIdx < currentIdx;
            return (
              <div key={key} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 text-xs font-medium ${
                  isActive ? "text-primary-500" : isDone ? "text-accent-500" : "text-slate-300"
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    isActive ? "bg-primary-500 text-white" : isDone ? "bg-accent-500 text-white" : "bg-slate-200 text-slate-400"
                  }`}>
                    {isDone ? <CheckCircle size={12} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < arr.length - 1 && <div className={`flex-1 h-px w-8 ${isDone ? "bg-accent-500" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Uploading */}
      {step === "uploading" && (
        <Card className="flex flex-col items-center py-12 gap-4 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
          <div>
            <p className="font-semibold text-brand-text">Uploading your recording...</p>
            <p className="text-sm text-slate-400 mt-1">Securely storing your audio file</p>
          </div>
          <Skeleton className="h-2 w-48 mt-2" />
        </Card>
      )}

      {/* Transcribing */}
      {step === "transcribing" && (
        <Card className="flex flex-col items-center py-12 gap-4 text-center">
          <div className="w-16 h-16 bg-secondary-500/10 rounded-2xl flex items-center justify-center">
            <FileText className="w-8 h-8 text-secondary-500 animate-pulse" />
          </div>
          <div>
            <p className="font-semibold text-brand-text">Transcribing your voice...</p>
            <p className="text-sm text-slate-400 mt-1">Converting your voice to text</p>
          </div>
          <Skeleton className="h-2 w-40 mt-2" />
        </Card>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-accent-500" />
              <h3 className="font-semibold text-brand-text">Transcript Ready</h3>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 max-h-56 overflow-y-auto">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {transcript || "No transcript generated. Please try again."}
              </p>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {transcript.split(" ").length} words · Review before generating your video
            </p>
          </Card>
          <Button onClick={handleGenerateVideo} size="lg" className="w-full gap-2">
            Generate My Video <ArrowRight size={16} />
          </Button>
        </div>
      )}

      {/* ── Unified Create card ── */}
      {inputMode === "create" && step === "input" && (
        <Card>
          {/* Section 1: Topic-based generation */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
                <MapPin size={13} className="text-primary-500" />
              </div>
              <p className="text-sm font-bold text-brand-text">Generate Script from Topic</p>
              <span className="text-xs text-slate-400 ml-auto hidden sm:block">AI researches in real time</span>
            </div>

            {/* Topic input with inline mic */}
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500 block mb-1.5">
                What&apos;s your video about? <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-1 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                <input
                  id="loc-custom-topic"
                  type="text"
                  value={locCustomTopic}
                  onChange={(e) => setLocCustomTopic(e.target.value)}
                  placeholder="e.g. Market update, Why live here, New construction…  or tap 🎤"
                  className="flex-1 text-sm px-3 py-2.5 bg-transparent focus:outline-none rounded-xl"
                />
                <TopicMicButton onTranscript={(t) => setLocCustomTopic(t)} />
              </div>
              <p className="text-xs text-slate-400 mt-1">Type your topic or tap the mic to speak it</p>
            </div>

            {/* Location */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  City <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={locCity}
                  onChange={(e) => setLocCity(e.target.value)}
                  placeholder="Austin"
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  State <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={locState}
                  onChange={(e) => setLocState(e.target.value)}
                  placeholder="TX"
                  maxLength={2}
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  ZIP <span className="text-slate-400 text-[10px]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={locZip}
                  onChange={(e) => setLocZip(e.target.value)}
                  placeholder="78701"
                  maxLength={10}
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Audience + Tone */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  Target Audience <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={locAudience}
                    onChange={(e) => setLocAudience(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none pr-8"
                  >
                    <option value="">Select...</option>
                    <option value="Buyers">Buyers</option>
                    <option value="Sellers">Sellers</option>
                    <option value="Investors">Investors</option>
                    <option value="First-Time Buyers">First-Time Buyers</option>
                    <option value="Luxury">Luxury</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  Brand Style <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={locTone}
                    onChange={(e) => setLocTone(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none pr-8"
                  >
                    <option value="">Select...</option>
                    <option value="Friendly">Friendly</option>
                    <option value="Modern">Modern</option>
                    <option value="Luxury">Luxury</option>
                    <option value="High-Energy">High-Energy</option>
                    <option value="Educational">Educational</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* CTA Preference */}
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 block mb-1.5">
                CTA Preference <span className="text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <select
                  value={locCta}
                  onChange={(e) => setLocCta(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none pr-8"
                >
                  <option value="">Call or Text Today (default)</option>
                  <option value="call">Call Today</option>
                  <option value="text">Text Today</option>
                  <option value="website">Visit Website</option>
                  <option value="consultation">Schedule a Consultation</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Templates toggle */}
            <div className="mb-5">
              <button
                onClick={() => setShowTemplates((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-dashed border-primary-200 hover:border-primary-400 hover:bg-primary-50/40 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">💡</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-brand-text">Browse Templates</p>
                    <p className="text-xs text-slate-400">
                      24 templates · Real Estate · Location · Events
                      {locCity && locState ? ` · ${locCity}, ${locState.toUpperCase()}` : ""}
                    </p>
                  </div>
                </div>
                {showTemplates
                  ? <ChevronUp size={16} className="text-slate-400 group-hover:text-primary-500 transition-colors" />
                  : <ChevronDown size={16} className="text-slate-400 group-hover:text-primary-500 transition-colors" />}
              </button>
              {showTemplates && (
                <div className="mt-3">
                  <ContentTemplates
                    onSelect={handleTemplateSelect}
                    city={locCity}
                    state={locState}
                  />
                </div>
              )}
            </div>

            <Button
              onClick={handleGenerateLocationScript}
              loading={locGenerating}
              disabled={!locCity.trim() || !locState.trim() || !locCustomTopic.trim() || !locAudience || !locTone}
              size="lg"
              className="w-full gap-2"
            >
              {locGenerating
                ? <>Researching {locCity || "location"}...</>
                : <>Generate Script <ArrowRight size={16} /></>}
            </Button>
          </div>

          {/* OR divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-white text-xs font-semibold text-slate-400 uppercase tracking-wide">
                or record your voice
              </span>
            </div>
          </div>

          {/* Section 2: Voice recording */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                <Mic size={13} className="text-red-500" />
              </div>
              <p className="text-sm font-bold text-brand-text">Record a Voice Memo</p>
              <span className="text-xs text-slate-400 ml-auto hidden sm:block">Speak for 30–60 seconds</span>
            </div>

            {/* Voice / Camera sub-toggle */}
            <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setRecordMode("voice")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  recordMode === "voice" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
                }`}
              >
                <Mic size={13} /> Voice Only
              </button>
              <button
                onClick={() => setRecordMode("camera")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  recordMode === "camera" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
                }`}
              >
                <Video size={13} /> Camera + Teleprompter
              </button>
            </div>

            {recordMode === "voice" ? (
              <VoiceHero onRecordingComplete={handleRecordingComplete} />
            ) : (
              <CameraRecorder />
            )}

            {uploadedBlob && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <Button onClick={handleContinue} size="lg" className="w-full gap-2">
                  Transcribe &amp; Continue <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Upload mode ── */}
      {inputMode === "upload" && step === "input" && (
        <Card>
          <VoiceUploader onFileSelected={handleFileSelected} />
          {uploadedFile && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <Button onClick={handleContinue} size="lg" className="w-full gap-2">
                Transcribe &amp; Continue <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Listing mode ── */}
      {inputMode === "listing" && (
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Building2 size={16} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-text">MLS Listing Auto-Video</p>
              <p className="text-xs text-slate-400">Import from Zillow, Realtor.com, Redfin + more</p>
            </div>
          </div>
          <ListingVideoForm />
        </Card>
      )}
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto h-64 animate-pulse bg-slate-100 rounded-2xl" />}>
      <CreatePageInner />
    </Suspense>
  );
}
