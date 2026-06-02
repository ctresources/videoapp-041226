"use client";

import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldMic } from "@/components/ui/field-mic";
import {
  Mic, ArrowRight, CheckCircle, Loader2, FileText,
  Building2, Video, Square, Pause, AlertCircle, Film,
  ChevronDown, ChevronUp, Sparkles, Pencil, LayoutGrid,
} from "lucide-react";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { ListingVideoForm } from "@/components/create/listing-video-form";
import { TopicRadar } from "@/components/create/topic-radar";
import { ContentTemplates } from "@/components/create/content-templates";

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

type Step = "input" | "uploading" | "transcribing" | "done";
type InputMode = "script" | "camera" | "listing";

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

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [inputMode, setInputMode] = useState<InputMode>("script");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videosLeft, setVideosLeft] = useState<number | null>(null);
  const [videosTotal, setVideosTotal] = useState<number | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  const PLAN_VIDEOS: Record<string, number> = { free: 1, starter: 4, agent: 8, pro: 12 };

  // Location
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);

  // Topic
  const [locCustomTopic, setLocCustomTopic] = useState("");

  // Templates
  const [showTemplates, setShowTemplates] = useState(false);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locAudience, setLocAudience] = useState("");
  const [locTone, setLocTone] = useState("");
  const [locCta, setLocCta] = useState("");

  const [locGenerating, setLocGenerating] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const topic = searchParams.get("topic");
    const urlCity = searchParams.get("city");
    const urlState = searchParams.get("state");

    if (tab === "camera") setInputMode("camera");
    else if (tab === "listing") setInputMode("listing");
    if (topic) { setLocCustomTopic(topic); setInputMode("script"); }

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
            setVideosLeft(data.credits_remaining ?? 0);
            setVideosTotal(PLAN_VIDEOS[tier] ?? 0);
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
      setTranscript((transcribeBody as { transcript: string }).transcript);
      setStep("done");
      toast.success("Voice transcribed! Review and generate your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    }
  }

  function handleFileSelected(file: File) { setUploadedFile(file); }

  async function handleContinue() {
    if (uploadedFile) await processAudio(uploadedFile, 0, uploadedFile.name.replace(/\.[^/.]+$/, ""));
  }

  async function handleGenerateVideo() {
    if (!recordingId) return;
    router.push(`/create/${recordingId}?source=recording`);
  }

  async function handleGenerateScript() {
    if (!locCity.trim() || !locState.trim()) {
      setEditingLocation(true);
      return toast.error("Please set your city and state first");
    }
    if (!locCustomTopic.trim()) {
      return toast.error("Please enter or pick a topic");
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
          customTopic: locCustomTopic.trim(),
          audience: locAudience || undefined,
          tone: locTone || undefined,
          ctaPreference: locCta || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || `Script generation failed (${res.status})`);
      toast.success("Script ready!");
      router.push(`/create/${(data.project as { id: string }).id}?source=location`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLocGenerating(false);
    }
  }

  const readyToContinue = step === "input" && inputMode === "camera" && !!uploadedFile;
  const locationSet = locCity.trim() && locState.trim();

  return (
    <div className="max-w-xl mx-auto">

      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold text-brand-text">Create New Video</h2>
        <p className="text-slate-400 text-sm mt-0.5">AI writes your script — you approve, then generate.</p>
      </div>

      {/* Videos remaining banner */}
      {videosLeft !== null && videosTotal !== null && (
        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl mb-5 text-sm ${
          videosLeft === 0 ? "bg-red-50 border border-red-200"
          : videosLeft <= 1 ? "bg-amber-50 border border-amber-200"
          : "bg-blue-50 border border-blue-100"
        }`}>
          <div className="flex items-center gap-2">
            <Film size={15} className={videosLeft === 0 ? "text-red-500" : videosLeft <= 1 ? "text-amber-500" : "text-blue-500"} />
            <span className={`font-semibold text-sm ${videosLeft === 0 ? "text-red-700" : videosLeft <= 1 ? "text-amber-700" : "text-blue-800"}`}>
              {videosLeft === 0 ? "No videos remaining this month" : `${videosLeft} of ${videosTotal} videos left`}
            </span>
          </div>
          <span className={`text-xs shrink-0 ${videosLeft === 0 ? "text-red-500" : videosLeft <= 1 ? "text-amber-500" : "text-blue-500"}`}>
            {videosLeft === 0
              ? <a href="/billing" className="underline font-medium">Upgrade plan</a>
              : periodEnd ? `Resets ${periodEnd}` : "Resets monthly"}
          </span>
        </div>
      )}

      {/* ── Tab bar ── */}
      {step === "input" && (
        <div className="grid grid-cols-3 gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
          {[
            { mode: "script" as InputMode, icon: Sparkles, label: "AI Script" },
            { mode: "listing" as InputMode, icon: Building2, label: "Listing" },
            { mode: "camera" as InputMode, icon: Video, label: "Camera" },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setInputMode(mode)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                inputMode === mode
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          AI SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "script" && step === "input" && (
        <div className="flex flex-col gap-4">

          {/* Step 1 — Topic */}
          <Card>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 1 · Your Topic</p>

            {/* Topic Radar */}
            <TopicRadar
              city={locCity || undefined}
              state={locState || undefined}
              onSelect={(topic) => {
                setLocCustomTopic(topic);
                document.getElementById("topic-input")?.focus();
              }}
            />

            {/* Templates toggle */}
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowTemplates(v => !v)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  showTemplates
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <LayoutGrid size={13} />
                Browse 24 Templates
                {showTemplates ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
              </button>

              {showTemplates && (
                <div className="mt-2 max-h-[480px] overflow-y-auto pr-0.5">
                  <ContentTemplates
                    city={locCity}
                    state={locState}
                    onSelect={(template) => {
                      setLocCustomTopic(template.topic);
                      setShowTemplates(false);
                      setTimeout(() => document.getElementById("topic-input")?.focus(), 100);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Topic input */}
            <div>
              <input
                id="topic-input"
                type="text"
                value={locCustomTopic}
                onChange={(e) => setLocCustomTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !locGenerating && handleGenerateScript()}
                placeholder="e.g. Market update, Why buy here, New construction…"
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              <FieldMic size="lg" onTranscript={(t) => setLocCustomTopic(t)} title="Hit the Mic — Speak Your Topic" />
            </div>
          </Card>

          {/* Step 2 — Market */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Step 2 · Your Market</p>
              {!editingLocation && locationSet && (
                <button
                  onClick={() => setEditingLocation(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>

            {!editingLocation && locationSet ? (
              /* Pre-filled display */
              <div className="flex items-center gap-2 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-sm">📍</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{locCity}, {locState}</p>
                  <p className="text-xs text-slate-400">AI will research real-time data for this market</p>
                </div>
              </div>
            ) : (
              /* Edit fields */
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">City *</label>
                  <div className="flex items-center border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
                    <input
                      type="text"
                      value={locCity}
                      onChange={(e) => setLocCity(e.target.value)}
                      placeholder="Austin"
                      className="flex-1 text-sm px-2.5 py-2 bg-transparent focus:outline-none min-w-0"
                    />
                    <FieldMic onTranscript={(t) => setLocCity(t.split(/[\s,]+/)[0].trim())} title="Say your city" />
                  </div>
                </div>
                <div className="w-20">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">State *</label>
                  <div className="flex items-center border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
                    <input
                      type="text"
                      value={locState}
                      onChange={(e) => setLocState(e.target.value)}
                      placeholder="TX"
                      maxLength={2}
                      className="flex-1 text-sm px-2.5 py-2 bg-transparent focus:outline-none uppercase min-w-0"
                    />
                    <FieldMic onTranscript={(t) => setLocState(toStateAbbr(t))} title="Say your state" />
                  </div>
                </div>
                {locationSet && (
                  <button
                    onClick={() => setEditingLocation(false)}
                    className="self-end mb-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-2 whitespace-nowrap"
                  >
                    Done
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* Advanced options (collapsed by default) */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors self-start px-1"
          >
            {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAdvanced ? "Hide advanced options" : "Advanced options (audience, style, CTA)"}
          </button>

          {showAdvanced && (
            <Card>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Audience", value: locAudience, set: setLocAudience,
                    options: [["", "Any"], ["Buyers", "Buyers"], ["Sellers", "Sellers"], ["Investors", "Investors"], ["First-Time Buyers", "First-Time"], ["Luxury", "Luxury"], ["Mixed", "Mixed"]],
                  },
                  {
                    label: "Style", value: locTone, set: setLocTone,
                    options: [["", "Any"], ["Friendly", "Friendly"], ["Modern", "Modern"], ["Luxury", "Luxury"], ["High-Energy", "High-Energy"], ["Educational", "Educational"]],
                  },
                  {
                    label: "CTA", value: locCta, set: setLocCta,
                    options: [["", "Default"], ["call", "Call"], ["text", "Text"], ["website", "Website"], ["consultation", "Consult"]],
                  },
                ].map(({ label, value, set, options }) => (
                  <div key={label}>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">{label}</label>
                    <div className="relative">
                      <select
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-full text-xs px-2 py-2 border border-slate-200 rounded-lg bg-white appearance-none pr-5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Generate button */}
          <Button
            onClick={handleGenerateScript}
            loading={locGenerating}
            disabled={!locCustomTopic.trim()}
            size="lg"
            className="w-full gap-2"
          >
            {locGenerating
              ? <>Researching {locCity || "your market"}…</>
              : <><Sparkles size={16} /> Generate My Script</>}
          </Button>

          {!locCustomTopic.trim() && (
            <p className="text-xs text-slate-400 text-center -mt-2">
              Hit the Mic to speak, or pick from Radar topics or Templates above
            </p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          LISTING TAB
      ══════════════════════════════════════════ */}
      {inputMode === "listing" && (
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Building2 size={16} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-text">Listing Video</p>
              <p className="text-xs text-slate-400">Upload photos · Import from Zillow · Enter manually</p>
            </div>
          </div>
          <ListingVideoForm />
        </Card>
      )}

      {/* ══════════════════════════════════════════
          CAMERA TAB
      ══════════════════════════════════════════ */}
      {inputMode === "camera" && step === "input" && (
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
              <Video size={16} className="text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-text">Camera + Teleprompter</p>
              <p className="text-xs text-slate-400">Write your script — teleprompter scrolls while you record</p>
            </div>
          </div>

          <CameraRecorder />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white text-xs font-semibold text-slate-400 uppercase tracking-wide">
                or upload a file
              </span>
            </div>
          </div>

          <VoiceUploader onFileSelected={handleFileSelected} />
          {readyToContinue && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <Button onClick={handleContinue} size="lg" className="w-full gap-2">
                Transcribe &amp; Continue <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Shared processing states (uploading / transcribing / done) ── */}
      {(inputMode === "script" || inputMode === "camera") && step !== "input" && (
        <>
          {/* Progress */}
          <div className="flex items-center gap-2 mb-6">
            {(["input", "uploading", "transcribing", "done"] as Step[]).map((s, i, arr) => {
              const steps: Step[] = ["input", "uploading", "transcribing", "done"];
              const labels = ["Input", "Uploading", "Transcribing", "Ready"];
              const ci = steps.indexOf(step), ti = steps.indexOf(s);
              const isActive = ti === ci, isDone = ti < ci;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? "text-blue-600" : isDone ? "text-emerald-500" : "text-slate-300"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive ? "bg-blue-600 text-white" : isDone ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                      {isDone ? <CheckCircle size={12} /> : i + 1}
                    </span>
                    <span className="hidden sm:inline">{labels[i]}</span>
                  </div>
                  {i < arr.length - 1 && <div className={`h-px w-8 ${isDone ? "bg-emerald-400" : "bg-slate-200"}`} />}
                </div>
              );
            })}
          </div>

          {step === "uploading" && (
            <Card className="flex flex-col items-center py-12 gap-4 text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
              </div>
              <div>
                <p className="font-semibold text-brand-text">Uploading your recording…</p>
                <p className="text-sm text-slate-400 mt-1">Securely storing your audio</p>
              </div>
              <Skeleton className="h-1.5 w-48" />
            </Card>
          )}

          {step === "transcribing" && (
            <Card className="flex flex-col items-center py-12 gap-4 text-center">
              <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center">
                <FileText className="w-7 h-7 text-purple-500 animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-brand-text">Transcribing your voice…</p>
                <p className="text-sm text-slate-400 mt-1">Converting speech to text</p>
              </div>
              <Skeleton className="h-1.5 w-40" />
            </Card>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-semibold text-brand-text">Transcript Ready</h3>
                  <span className="ml-auto text-xs text-slate-400">{transcript.split(" ").length} words</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 max-h-52 overflow-y-auto">
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {transcript || "No transcript generated. Please try again."}
                  </p>
                </div>
              </Card>
              <Button onClick={handleGenerateVideo} size="lg" className="w-full gap-2">
                Generate My Video <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Error for mic/audio */}
      {false && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>Microphone error. Please check your browser permissions.</p>
        </div>
      )}

    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="max-w-xl mx-auto h-64 animate-pulse bg-slate-100 rounded-2xl" />}>
      <CreatePageInner />
    </Suspense>
  );
}
