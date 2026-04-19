"use client";

import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mic, Upload, ArrowRight, CheckCircle, Loader2, FileText,
  MapPin, ChevronDown, ChevronUp, Building2, Video,
} from "lucide-react";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

// ─── Main Component ───────────────────────────────────────────────────────────

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Voice flow state
  const [inputMode, setInputMode] = useState<InputMode>("location");
  const [recordMode, setRecordMode] = useState<RecordMode>("voice");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<{ blob: Blob; duration: number } | null>(null);

  // Location script state
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [locZip, setLocZip] = useState("");
  const [locCustomTopic, setLocCustomTopic] = useState("");
  const [locAudience, setLocAudience] = useState("");
  const [locTone, setLocTone] = useState("");
  const [locCta, setLocCta] = useState("");
  const [locGenerating, setLocGenerating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Pre-fill from URL params (e.g. clicked from Trending Topics) ─────────
  useEffect(() => {
    const tab = searchParams.get("tab");
    const topic = searchParams.get("topic");
    const city = searchParams.get("city");
    const state = searchParams.get("state");

    if (tab === "location") {
      setInputMode("location");
      if (topic) setLocCustomTopic(topic);
      if (city) setLocCity(city);
      if (state) setLocState(state);
    }
  }, []); // eslint-disable-line

  // ── Voice processing ────────────────────────────────────────────────────────

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
    setUploadedBlob({ blob, duration });
  }

  function handleFileSelected(file: File) {
    setUploadedFile(file);
  }

  async function handleContinue() {
    if (inputMode === "record" && uploadedBlob) {
      await processAudio(uploadedBlob.blob, uploadedBlob.duration);
    } else if (inputMode === "upload" && uploadedFile) {
      await processAudio(uploadedFile, 0, uploadedFile.name.replace(/\.[^/.]+$/, ""));
    }
  }

  async function handleGenerateVideo() {
    if (!recordingId) return;
    router.push(`/create/${recordingId}?source=recording`);
  }

  // ── Location script ─────────────────────────────────────────────────────────

  function handleTemplateSelect(template: ContentTemplate) {
    setLocCustomTopic(template.topic);
    setShowTemplates(false);
    // Scroll to the topic input after a tick
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
    if (!locAudience) {
      return toast.error("Please select a target audience");
    }
    if (!locTone) {
      return toast.error("Please select a brand style");
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const readyToContinue =
    step === "input" &&
    ((inputMode === "record" && recordMode === "voice" && !!uploadedBlob) ||
      (inputMode === "upload" && !!uploadedFile));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">Create New Video</h2>
        <p className="text-slate-500 text-sm mt-1">
          Record your voice, upload audio, generate from location data, or import a listing.
        </p>
      </div>

      {/* Mode toggle — only show on input step */}
      {step === "input" && (
        <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setInputMode("location")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              inputMode === "location" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
            }`}
          >
            <MapPin size={14} /> Templates
          </button>
          <button
            onClick={() => setInputMode("record")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              inputMode === "record" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"
            }`}
          >
            <Mic size={14} /> Record
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

      {/* ── Voice / Upload flow ── */}
      {inputMode !== "location" && inputMode !== "listing" && (
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
            <Card>
              {inputMode === "record" ? (
                <>
                  {/* Record sub-mode toggle */}
                  <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-xl">
                    <button
                      onClick={() => setRecordMode("voice")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        recordMode === "voice"
                          ? "bg-white shadow-sm text-brand-text"
                          : "text-slate-500 hover:text-brand-text"
                      }`}
                    >
                      <Mic size={13} /> Voice Only
                    </button>
                    <button
                      onClick={() => setRecordMode("camera")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        recordMode === "camera"
                          ? "bg-white shadow-sm text-brand-text"
                          : "text-slate-500 hover:text-brand-text"
                      }`}
                    >
                      <Video size={13} /> Camera + Teleprompter
                    </button>
                  </div>

                  {recordMode === "voice" ? (
                    <VoiceRecorder onRecordingComplete={handleRecordingComplete} maxSeconds={300} />
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

          {/* Done — show transcript */}
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

      {/* ── Location Script flow ── */}
      {inputMode === "location" && (
        <Card>
          {/* Location fields */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Location</p>
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-500 block mb-1.5">
                ZIP Code <span className="text-slate-400">(optional — narrows results)</span>
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
          <div className="grid grid-cols-2 gap-3 mb-4">
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
          <div className="mb-5">
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
                  <p className="text-sm font-semibold text-brand-text">Start from a Template</p>
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
            <input
              id="loc-custom-topic"
              type="text"
              value={locCustomTopic}
              onChange={(e) => setLocCustomTopic(e.target.value)}
              placeholder="e.g. Market update, Why live here, New construction, School ratings, HOA fees..."
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Any real estate topic — our AI will research it for this specific location
            </p>
          </div>

          {/* Info banner */}
          <div className="mb-5 p-3 bg-primary-50 border border-primary-100 rounded-xl">
            <p className="text-xs text-primary-700 leading-relaxed">
              <strong>AI-powered research</strong> — searches trusted real estate data sources
              in real time and returns a structured script ready for video production. Takes ~10–20 seconds.
            </p>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerateLocationScript}
            loading={locGenerating}
            disabled={!locCity.trim() || !locState.trim() || !locCustomTopic.trim() || !locAudience || !locTone}
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
