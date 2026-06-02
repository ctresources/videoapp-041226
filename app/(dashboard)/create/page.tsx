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
  Pause, AlertCircle, Film,
} from "lucide-react";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { ContentTemplates, ContentTemplate } from "@/components/create/content-templates";
import { ListingVideoForm } from "@/components/create/listing-video-form";
import { TopicRadar } from "@/components/create/topic-radar";

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

type Step = "input" | "uploading" | "transcribing" | "done";
type InputMode = "speak" | "upload" | "listing";

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

  const [inputMode, setInputMode] = useState<InputMode>("speak");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videosLeft, setVideosLeft] = useState<number | null>(null);
  const [videosTotal, setVideosTotal] = useState<number | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  const PLAN_VIDEOS: Record<string, number> = { free: 1, starter: 4, agent: 8, pro: 12 };

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
    // "record", "location", "speak", or no tab → unified "speak" tab
    if (topic) { setLocCustomTopic(topic); setInputMode("speak"); }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("location_city, location_state, credits_remaining, subscription_tier, current_period_end")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.location_city && !urlCity) setLocCity(data.location_city);
          if (data?.location_state && !urlState) setLocState(data.location_state);
          if (urlCity) setLocCity(urlCity);
          if (urlState) setLocState(urlState);

          if (data) {
            const tier = (data.subscription_tier as string) ?? "free";
            const total = PLAN_VIDEOS[tier] ?? 0;
            setVideosLeft(data.credits_remaining ?? 0);
            setVideosTotal(total);
            if (data.current_period_end) {
              const d = new Date(data.current_period_end as string);
              setPeriodEnd(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
            }
          }
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
        <h2 className="text-2xl font-bold text-brand-text">Create New Video</h2>
        <p className="text-slate-500 text-sm mt-1">
          Generate from a topic or record your voice — AI does the rest.
        </p>
      </div>

      {/* Videos remaining banner */}
      {videosLeft !== null && videosTotal !== null && (
        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl mb-5 text-sm ${
          videosLeft === 0
            ? "bg-red-50 border border-red-200"
            : videosLeft <= 1
            ? "bg-amber-50 border border-amber-200"
            : "bg-blue-50 border border-blue-100"
        }`}>
          <div className="flex items-center gap-2">
            <Film size={15} className={videosLeft === 0 ? "text-red-500" : videosLeft <= 1 ? "text-amber-500" : "text-blue-500"} />
            <span className={`font-semibold ${videosLeft === 0 ? "text-red-700" : videosLeft <= 1 ? "text-amber-700" : "text-blue-800"}`}>
              {videosLeft === 0
                ? "No videos remaining this month"
                : `${videosLeft} of ${videosTotal} videos left this month`}
            </span>
          </div>
          <span className={`text-xs shrink-0 ${videosLeft === 0 ? "text-red-500" : videosLeft <= 1 ? "text-amber-500" : "text-blue-500"}`}>
            {videosLeft === 0
              ? <a href="/billing" className="underline font-medium">Upgrade plan</a>
              : periodEnd ? `Resets ${periodEnd}` : "Resets monthly"}
          </span>
        </div>
      )}

      {/* Tab bar */}
      {step === "input" && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setInputMode("speak")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "speak"
                ? "bg-blue-900 text-white shadow-md"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
            }`}
          >
            <Mic size={14} /> Create
          </button>
          <button
            onClick={() => setInputMode("listing")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "listing"
                ? "bg-emerald-700 text-white shadow-md"
                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            }`}
          >
            <Building2 size={14} /> Listing
          </button>
          <button
            onClick={() => setInputMode("upload")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "upload"
                ? "bg-violet-700 text-white shadow-md"
                : "bg-violet-100 text-violet-700 hover:bg-violet-200"
            }`}
          >
            <Video size={14} /> Camera + Voice
          </button>
        </div>
      )}

      {/* ── Speak / Upload shared flow ── */}
      {(inputMode === "speak" || inputMode === "upload") && (
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
              {/* Upload Video/Voice mode */}
              {inputMode === "upload" && (
                <Card>
                  <CameraRecorder />

                  {/* OR divider */}
                  <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-4 bg-white text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        or upload a file
                      </span>
                    </div>
                  </div>

                  {/* File upload */}
                  <VoiceUploader onFileSelected={handleFileSelected} />
                  {readyToContinue && (
                    <div className="mt-6 pt-5 border-t border-slate-100">
                      <Button onClick={handleContinue} size="lg" className="w-full gap-2">
                        Transcribe &amp; Continue <ArrowRight size={16} />
                      </Button>
                    </div>
                  )}
                </Card>
              )}

              {/* Speak mode — unified card: topic + voice in one */}
              {inputMode === "speak" && (
                <Card>
                  {/* ── Section 1: Topic-based generation ── */}
                  <div>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                        <MapPin size={16} className="text-primary-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-brand-text">Generate a Script from Topic</p>
                        <p className="text-xs text-slate-400">Pick a topic — AI researches and writes your script</p>
                      </div>
                    </div>

                    {/* Topic Radar — AI-suggested topics for this market */}
                    <TopicRadar
                      city={locCity || undefined}
                      state={locState || undefined}
                      onSelect={(topic) => setLocCustomTopic(topic)}
                    />

                    {/* Topic input */}
                    <div className="mb-5">
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">
                        What&apos;s your topic? <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="loc-custom-topic"
                        type="text"
                        value={locCustomTopic}
                        onChange={(e) => setLocCustomTopic(e.target.value)}
                        placeholder="e.g. Market update, Why live here, New construction…"
                        className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
                      />
                      <FieldMic size="lg" onTranscript={(t) => setLocCustomTopic(t)} title="Hit the Mic — Speak Your Topic" />
                    </div>

                    {/* Templates toggle — prominent */}
                    <div className="mb-4">
                      <button
                        onClick={() => setShowTemplates((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 border-primary-300 bg-primary-50 hover:bg-primary-100 hover:border-primary-400 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">💡</span>
                          <div className="text-left">
                            <p className="text-sm font-bold text-brand-text">Need a topic idea? Browse templates</p>
                            <p className="text-xs text-primary-600 mt-0.5">
                              24 ready-to-use scripts · Market updates · Buyer &amp; seller tips · Community news
                            </p>
                          </div>
                        </div>
                        {showTemplates
                          ? <ChevronUp size={18} className="text-primary-500 shrink-0" />
                          : <ChevronDown size={18} className="text-primary-500 shrink-0" />}
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

                    {/* Compact location + options */}
                    <div className="bg-slate-50 rounded-xl p-3 mb-5 space-y-2">
                      {/* Row 1: City + State + ZIP */}
                      <div className="grid grid-cols-[1fr_80px_90px] gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                            City <span className="text-red-400">*</span>
                          </label>
                          <div className="flex items-center border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                            <input
                              type="text"
                              value={locCity}
                              onChange={(e) => setLocCity(e.target.value)}
                              placeholder="Blue Bell"
                              className="flex-1 text-xs px-2 py-1.5 bg-transparent focus:outline-none min-w-0"
                            />
                            <FieldMic onTranscript={(t) => setLocCity(t.split(/[\s,]+/)[0].trim())} title="Say your city" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                            State <span className="text-red-400">*</span>
                          </label>
                          <div className="flex items-center border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                            <input
                              type="text"
                              value={locState}
                              onChange={(e) => setLocState(e.target.value)}
                              placeholder="PA"
                              maxLength={2}
                              className="flex-1 text-xs px-2 py-1.5 bg-transparent focus:outline-none uppercase min-w-0"
                            />
                            <FieldMic onTranscript={(t) => setLocState(toStateAbbr(t))} title="Say your state" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">ZIP</label>
                          <input
                            type="text"
                            value={locZip}
                            onChange={(e) => setLocZip(e.target.value)}
                            placeholder="19422"
                            maxLength={10}
                            className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>

                      {/* Row 2: Audience + Style + CTA */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Audience</label>
                          <div className="relative">
                            <select
                              value={locAudience}
                              onChange={(e) => setLocAudience(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white appearance-none pr-5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Any</option>
                              <option value="Buyers">Buyers</option>
                              <option value="Sellers">Sellers</option>
                              <option value="Investors">Investors</option>
                              <option value="First-Time Buyers">First-Time</option>
                              <option value="Luxury">Luxury</option>
                              <option value="Mixed">Mixed</option>
                            </select>
                            <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Style</label>
                          <div className="relative">
                            <select
                              value={locTone}
                              onChange={(e) => setLocTone(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white appearance-none pr-5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Any</option>
                              <option value="Friendly">Friendly</option>
                              <option value="Modern">Modern</option>
                              <option value="Luxury">Luxury</option>
                              <option value="High-Energy">High-Energy</option>
                              <option value="Educational">Educational</option>
                            </select>
                            <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">CTA</label>
                          <div className="relative">
                            <select
                              value={locCta}
                              onChange={(e) => setLocCta(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white appearance-none pr-5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Default</option>
                              <option value="call">Call</option>
                              <option value="text">Text</option>
                              <option value="website">Website</option>
                              <option value="consultation">Consult</option>
                            </select>
                            <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
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
                  </div>

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
