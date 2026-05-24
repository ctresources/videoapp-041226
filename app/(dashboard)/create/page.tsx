"use client";

import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldMic } from "@/components/ui/field-mic";
import { useVoiceRecorder } from "@/lib/hooks/use-voice-recorder";
import {
  Mic, Upload, ArrowRight, CheckCircle, Loader2, FileText,
  MapPin, ChevronDown, ChevronUp, Building2, Video, Square,
  Pause, AlertCircle,
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
type InputMode = "record" | "upload" | "location" | "listing";
type RecordMode = "voice" | "camera";

const STATE_MAP: Record<string, string> = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
  "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
  "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS",
  "kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD","massachusetts":"MA",
  "michigan":"MI","minnesota":"MN","mississippi":"MS","missouri":"MO","montana":"MT",
  "nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",
  "ohio":"OH","oklahoma":"OK","oregon":"OR","pennsylvania":"PA","rhode island":"RI",
  "south carolina":"SC","south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT",
  "vermont":"VT","virginia":"VA","washington":"WA","west virginia":"WV",
  "wisconsin":"WI","wyoming":"WY","district of columbia":"DC",
};
function toStateAbbr(t: string) {
  const lower = t.trim().toLowerCase();
  return STATE_MAP[lower] || t.trim().slice(0, 2).toUpperCase();
}

function matchAudience(t: string): string {
  const s = t.toLowerCase();
  if (s.includes("first")) return "First-Time Buyers";
  if (s.includes("invest")) return "Investors";
  if (s.includes("sell")) return "Sellers";
  if (s.includes("luxury") || s.includes("luxur")) return "Luxury";
  if (s.includes("mix")) return "Mixed";
  if (s.includes("buy") || s.includes("buyer")) return "Buyers";
  return "";
}
function matchTone(t: string): string {
  const s = t.toLowerCase();
  if (s.includes("high") || s.includes("energy")) return "High-Energy";
  if (s.includes("educat")) return "Educational";
  if (s.includes("modern")) return "Modern";
  if (s.includes("luxury") || s.includes("luxur")) return "Luxury";
  if (s.includes("friend")) return "Friendly";
  return "";
}
function matchCta(t: string): string {
  const s = t.toLowerCase();
  if (s.includes("consult") || s.includes("schedul") || s.includes("meeting")) return "consultation";
  if (s.includes("website") || s.includes("site") || s.includes("online")) return "website";
  if (s.includes("text")) return "text";
  if (s.includes("call")) return "call";
  return "";
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

interface VoiceHeroProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
}

function VoiceHero({ onRecordingComplete }: VoiceHeroProps) {
  const { state, seconds, audioBlob, amplitudes, start, pause, resume, stop, error } =
    useVoiceRecorder();

  const isIdle = state === "idle" || state === "requesting";
  const isRecording = state === "recording";
  const isPaused = state === "paused";

  useEffect(() => {
    if (state === "stopped" && audioBlob) {
      onRecordingComplete(audioBlob, seconds);
    }
  }, [state]); // eslint-disable-line

  if (seconds >= 300 && isRecording) stop();

  return (
    <div className="flex flex-col items-center gap-6 py-4">
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
                  {state === "requesting" ? "…" : "Speak"}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {(isRecording || isPaused) && (
        <div className="text-center">
          <span className={`text-3xl font-mono font-bold tabular-nums ${isRecording ? "text-red-500" : "text-amber-500"}`}>
            {formatTime(seconds)}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            {isRecording ? "Recording — speak your video idea" : "Paused"}
          </p>
        </div>
      )}

      {isIdle && state !== "requesting" && (
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">Hit the mic. Talk about your market.</p>
          <p className="text-xs text-slate-400 mt-1">Speak for 60 seconds — we handle everything else.</p>
        </div>
      )}

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

      {isRecording && (
        <button
          onClick={pause}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Pause size={13} /> Pause
        </button>
      )}

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

      {state === "stopped" && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          <p className="text-sm text-slate-500">Processing your recording...</p>
        </div>
      )}

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

  const [inputMode, setInputMode] = useState<InputMode>("record");
  const [recordMode, setRecordMode] = useState<RecordMode>("voice");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

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

    if (tab === "location") setInputMode("record");
    if (tab === "upload") setInputMode("upload");
    if (tab === "listing") setInputMode("listing");
    if (topic) { setLocCustomTopic(topic); setInputMode("record"); }

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

      const uploadRes = await fetch("/api/voice/upload", {
        method: "POST",
        body: formData,
      });

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
    processAudio(blob, duration);
  }

  function handleFileSelected(file: File) {
    setUploadedFile(file);
  }

  async function handleContinue() {
    if (inputMode === "upload" && uploadedFile) {
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
    if (!locCity.trim() || !locState.trim()) {
      return toast.error("City and state are required");
    }
    if (!locCustomTopic.trim()) {
      return toast.error("Please describe your topic");
    }

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
          audience: locAudience || undefined,
          tone: locTone || undefined,
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

  const readyToContinue = step === "input" && inputMode === "upload" && !!uploadedFile;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">Speak, Stream, Share</h2>
        <p className="text-slate-500 text-sm mt-1">
          Hit the mic, talk about your market — we handle everything else.
        </p>
      </div>

      {/* Tab bar — 3 tabs */}
      {step === "input" && (
        <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setInputMode("record")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              inputMode === "record" || inputMode === "location" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
            }`}
          >
            <Mic size={14} /> Speak
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

      {/* ── Speak / Upload shared flow ── */}
      {(inputMode === "record" || inputMode === "upload") && (
        <>
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

          {/* Input step */}
          {step === "input" && (
            <>
              <Card>
                {inputMode === "record" ? (
                  <>
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
                  </>
                ) : (
                  <VoiceUploader onFileSelected={handleFileSelected} />
                )}

                {readyToContinue && (
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <Button onClick={handleContinue} size="lg" className="w-full gap-2">
                      Transcribe & Continue <ArrowRight size={16} />
                    </Button>
                  </div>
                )}
              </Card>

              {/* Script generator — secondary option on Speak tab */}
              {inputMode === "record" && recordMode === "voice" && (
                <Card className="mt-4">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                      <MapPin size={16} className="text-primary-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-brand-text">Or Generate a Script</p>
                      <p className="text-xs text-slate-400">Pick a topic — AI researches and writes your script</p>
                    </div>
                  </div>

                  {/* Location fields */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Location</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">
                          City <span className="text-red-400">*</span>
                        </label>
                        <div className="flex items-center border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                          <input
                            type="text"
                            value={locCity}
                            onChange={(e) => setLocCity(e.target.value)}
                            placeholder="Austin"
                            className="flex-1 text-sm px-3 py-2.5 bg-transparent focus:outline-none min-w-0"
                          />
                          <FieldMic onTranscript={(t) => setLocCity(t.split(/[\s,]+/)[0].trim())} title="Say your city" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">
                          State <span className="text-red-400">*</span>
                        </label>
                        <div className="flex items-center border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                          <input
                            type="text"
                            value={locState}
                            onChange={(e) => setLocState(e.target.value)}
                            placeholder="TX"
                            maxLength={2}
                            className="flex-1 text-sm px-3 py-2.5 bg-transparent focus:outline-none uppercase min-w-0"
                          />
                          <FieldMic onTranscript={(t) => setLocState(toStateAbbr(t))} title="Say your state" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">
                        ZIP Code <span className="text-slate-400">(optional)</span>
                      </label>
                      <div className="flex items-center border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                        <input
                          type="text"
                          value={locZip}
                          onChange={(e) => setLocZip(e.target.value)}
                          placeholder="78701"
                          maxLength={10}
                          className="flex-1 text-sm px-3 py-2.5 bg-transparent focus:outline-none min-w-0"
                        />
                        <FieldMic onTranscript={(t) => setLocZip(t.replace(/\D/g, "").slice(0, 10))} title="Say your ZIP code" />
                      </div>
                    </div>
                  </div>

                  {/* Audience + Tone (optional) */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">
                        Target Audience <span className="text-slate-400">(optional)</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <div className="relative flex-1">
                          <select
                            value={locAudience}
                            onChange={(e) => setLocAudience(e.target.value)}
                            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none pr-8"
                          >
                            <option value="">Any</option>
                            <option value="Buyers">Buyers</option>
                            <option value="Sellers">Sellers</option>
                            <option value="Investors">Investors</option>
                            <option value="First-Time Buyers">First-Time Buyers</option>
                            <option value="Luxury">Luxury</option>
                            <option value="Mixed">Mixed</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <FieldMic title='Say "buyers", "sellers", "investors"…' onTranscript={(t) => {
                          const v = matchAudience(t);
                          if (v) setLocAudience(v);
                        }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">
                        Brand Style <span className="text-slate-400">(optional)</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <div className="relative flex-1">
                          <select
                            value={locTone}
                            onChange={(e) => setLocTone(e.target.value)}
                            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none pr-8"
                          >
                            <option value="">Any</option>
                            <option value="Friendly">Friendly</option>
                            <option value="Modern">Modern</option>
                            <option value="Luxury">Luxury</option>
                            <option value="High-Energy">High-Energy</option>
                            <option value="Educational">Educational</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <FieldMic title='Say "friendly", "modern", "luxury"…' onTranscript={(t) => {
                          const v = matchTone(t);
                          if (v) setLocTone(v);
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* CTA Preference (optional) */}
                  <div className="mb-5">
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">
                      CTA Preference <span className="text-slate-400">(optional)</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <div className="relative flex-1">
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
                      <FieldMic title='Say "call", "text", "website", or "consultation"' onTranscript={(t) => {
                        const v = matchCta(t);
                        if (v) setLocCta(v);
                      }} />
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
                          <p className="text-sm font-semibold text-brand-text">Need a topic idea? Browse templates</p>
                          <p className="text-xs text-slate-400">
                            24 templates · Real Estate · Location · Events &amp; Community News
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

                  {/* Topic input */}
                  <div className="mb-5">
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">
                      What&apos;s your topic? <span className="text-red-400">*</span>
                    </label>
                    <div className="flex items-center border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                      <input
                        id="loc-custom-topic"
                        type="text"
                        value={locCustomTopic}
                        onChange={(e) => setLocCustomTopic(e.target.value)}
                        placeholder="e.g. Market update, Why live here, New construction… or tap 🎤"
                        className="flex-1 text-sm px-3 py-2.5 bg-transparent focus:outline-none min-w-0"
                      />
                      <FieldMic onTranscript={(t) => setLocCustomTopic(t)} title="Speak your topic" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Tap the 🎤 mic on any field to speak instead of type
                    </p>
                  </div>

                  {/* Info banner */}
                  <div className="mb-5 p-3 bg-primary-50 border border-primary-100 rounded-xl">
                    <p className="text-xs text-primary-700 leading-relaxed">
                      <strong>AI-powered research</strong> — searches trusted real estate data sources
                      in real time and returns a structured script ready for video production. Takes ~10–20 seconds.
                    </p>
                  </div>

                  <Button
                    onClick={handleGenerateLocationScript}
                    loading={locGenerating}
                    disabled={!locCity.trim() || !locState.trim() || !locCustomTopic.trim()}
                    size="lg"
                    className="w-full gap-2"
                  >
                    {locGenerating ? (
                      <>Researching {locCity || "location"}...</>
                    ) : (
                      <>Generate Location Script <ArrowRight size={16} /></>
                    )}
                  </Button>
                </Card>
              )}
            </>
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
        </>
      )}

      {/* ── Listing Video flow ── */}
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
