"use client";

import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldMic } from "@/components/ui/field-mic";
import {
  Mic, ArrowRight, CheckCircle, Loader2, FileText,
  Building2, Video, Square, Pause, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, LayoutGrid, PenLine,
  Plus, X, Paperclip, ImageIcon, Globe,
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
type InputMode = "script" | "camera" | "listing" | "paste";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Location
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [savedMarkets, setSavedMarkets] = useState<{ city: string; state: string }[]>([]);

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

  // Paste-script tab
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteScript, setPasteScript] = useState("");
  const [pasteHook, setPasteHook] = useState("");
  const [pasteCity, setPasteCity] = useState("");
  const [pasteState, setPasteState] = useState("");
  const [pasteGenerating, setPasteGenerating] = useState(false);
  const [pasteAiTopic, setPasteAiTopic] = useState("");
  const [pasteAiGenerating, setPasteAiGenerating] = useState(false);

  // Paste tab uploads
  const [pastePhotos, setPastePhotos] = useState<{ url: string; name: string; preview: string }[]>([]);
  const [pastePhotoUploading, setPastePhotoUploading] = useState(false);
  const [pastePdfUploading, setPastePdfUploading] = useState(false);
  const [pastePdfText, setPastePdfText] = useState("");
  const [pastePdfUrl, setPastePdfUrl] = useState("");
  const [pastePdfName, setPastePdfName] = useState("");
  const [pastePdfMode, setPastePdfMode] = useState<"upload" | "url">("upload");
  const [pastePdfUrlInput, setPastePdfUrlInput] = useState("");
  const [pastePdfUrlExtracting, setPastePdfUrlExtracting] = useState(false);

  // Camera tab uploads
  const [cameraPhotos, setCameraPhotos] = useState<{ url: string; name: string; preview: string }[]>([]);
  const [cameraPhotoUploading, setCameraPhotoUploading] = useState(false);
  const [cameraPdfUploading, setCameraPdfUploading] = useState(false);
  const [cameraPdfText, setCameraPdfText] = useState("");
  const [cameraPdfUrl, setCameraPdfUrl] = useState("");
  const [cameraPdfName, setCameraPdfName] = useState("");
  const [cameraPdfMode, setCameraPdfMode] = useState<"upload" | "url">("upload");
  const [cameraPdfUrlInput, setCameraPdfUrlInput] = useState("");
  const [cameraPdfUrlExtracting, setCameraPdfUrlExtracting] = useState(false);
  const [cameraGeneratedScript, setCameraGeneratedScript] = useState("");
  const [cameraScriptGenerating, setCameraScriptGenerating] = useState(false);

  // Paste tab upload-based script generation
  const [pasteUploadGenerating, setPasteUploadGenerating] = useState(false);

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
      setUserId(user.id);
      supabase
        .from("profiles")
        .select("location_city, location_state, saved_markets, onboarding_done")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.location_city && !urlCity) setLocCity(data.location_city);
          if (data?.location_state && !urlState) setLocState(data.location_state);
          if (urlCity) setLocCity(urlCity);
          if (urlState) setLocState(urlState);
          if (Array.isArray(data?.saved_markets)) setSavedMarkets(data.saved_markets as { city: string; state: string }[]);
          setOnboardingDone(!!(data as { onboarding_done?: boolean } | null)?.onboarding_done);
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

  async function handleCameraPhotosUpload(files: FileList) {
    const remaining = 12 - cameraPhotos.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setCameraPhotoUploading(true);
    try {
      const results = await Promise.all(
        toUpload.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/ai/upload-photo", { method: "POST", body: formData });
          const body = await safeJson(res);
          if (!res.ok) throw new Error((body?.error as string) || "Upload failed");
          return { url: body.url as string, name: body.name as string, preview: body.url as string };
        })
      );
      setCameraPhotos((prev) => [...prev, ...results].slice(0, 12));
      toast.success(`${results.length} photo${results.length > 1 ? "s" : ""} uploaded!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setCameraPhotoUploading(false);
    }
  }

  function removeCameraPhoto(index: number) {
    setCameraPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCameraPdfUpload(file: File) {
    setCameraPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/extract-pdf", { method: "POST", body: formData });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to extract PDF");
      setCameraPdfText(body.text as string);
      setCameraPdfUrl(body.url as string);
      setCameraPdfName(body.name as string);
      toast.success("PDF attached and content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setCameraPdfUploading(false);
    }
  }

  async function handleGenerateVideo() {
    if (!recordingId) return;
    if (cameraPhotos.length > 0 || cameraPdfUrl) {
      try {
        sessionStorage.setItem("camera-uploads", JSON.stringify({
          photos: cameraPhotos.map((p) => ({ url: p.url, name: p.name, preview: p.url })),
          pdfText: cameraPdfText,
          pdfUrl: cameraPdfUrl,
          pdfName: cameraPdfName,
        }));
      } catch { /* sessionStorage unavailable */ }
    }
    router.push(`/create/${recordingId}?source=recording`);
  }

  async function persistMarkets(markets: { city: string; state: string }[]) {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("profiles").update({ saved_markets: markets }).eq("id", userId);
  }

  function addMarket(city: string, state: string) {
    const c = city.trim(), s = state.trim().toUpperCase();
    if (!c || !s) return;
    if (savedMarkets.some(m => m.city.toLowerCase() === c.toLowerCase() && m.state.toUpperCase() === s)) return;
    const updated = [...savedMarkets, { city: c, state: s }];
    setSavedMarkets(updated);
    persistMarkets(updated);
  }

  function removeMarket(city: string, state: string) {
    const updated = savedMarkets.filter(m => !(m.city === city && m.state === state));
    setSavedMarkets(updated);
    persistMarkets(updated);
  }

  async function handleGenerateScript() {
    if (!locCity.trim() || !locState.trim()) {
      return toast.error("Please enter your city and state first");
    }
    if (!locCustomTopic.trim()) {
      return toast.error("Please enter or pick a topic");
    }
    addMarket(locCity, locState);
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

  async function handlePastePhotosUpload(files: FileList) {
    const remaining = 12 - pastePhotos.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setPastePhotoUploading(true);
    try {
      const results = await Promise.all(
        toUpload.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/ai/upload-photo", { method: "POST", body: formData });
          const body = await safeJson(res);
          if (!res.ok) throw new Error((body?.error as string) || "Upload failed");
          return { url: body.url as string, name: body.name as string, preview: body.url as string };
        })
      );
      setPastePhotos((prev) => [...prev, ...results].slice(0, 12));
      toast.success(`${results.length} photo${results.length > 1 ? "s" : ""} uploaded!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPastePhotoUploading(false);
    }
  }

  function removePastePhoto(index: number) {
    setPastePhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handlePastePdfUpload(file: File) {
    setPastePdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/extract-pdf", { method: "POST", body: formData });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to extract PDF");
      setPastePdfText(body.text as string);
      setPastePdfUrl(body.url as string);
      setPastePdfName(body.name as string);
      toast.success("PDF attached and content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setPastePdfUploading(false);
    }
  }

  async function handlePasteUrlExtract() {
    if (!pastePdfUrlInput.trim()) return;
    setPastePdfUrlExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pastePdfUrlInput.trim() }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to fetch URL");
      setPastePdfText(body.text as string);
      setPastePdfUrl(body.url as string);
      try { setPastePdfName(new URL(body.url as string).hostname.replace("www.", "")); } catch { setPastePdfName("URL"); }
      toast.success("URL content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setPastePdfUrlExtracting(false);
    }
  }

  async function handleCameraUrlExtract() {
    if (!cameraPdfUrlInput.trim()) return;
    setCameraPdfUrlExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cameraPdfUrlInput.trim() }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to fetch URL");
      setCameraPdfText(body.text as string);
      setCameraPdfUrl(body.url as string);
      try { setCameraPdfName(new URL(body.url as string).hostname.replace("www.", "")); } catch { setCameraPdfName("URL"); }
      toast.success("URL content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setCameraPdfUrlExtracting(false);
    }
  }

  async function handleGenerateScriptFromPasteUploads() {
    setPasteUploadGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfText: pastePdfText || undefined, photoCount: pastePhotos.length }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to generate script");
      setPasteScript(data.script as string);
      toast.success("Script ready — review and edit before generating your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setPasteUploadGenerating(false);
    }
  }

  async function handleGenerateScriptFromCameraUploads() {
    setCameraScriptGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfText: cameraPdfText || undefined, photoCount: cameraPhotos.length }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to generate script");
      setCameraGeneratedScript(data.script as string);
      toast.success("Script ready — it's now loaded in your teleprompter above.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setCameraScriptGenerating(false);
    }
  }

  async function handlePasteScript() {
    if (!pasteScript.trim()) return toast.error("Please paste or type your script first");
    setPasteGenerating(true);
    try {
      if (pastePhotos.length > 0 || pastePdfUrl) {
        try {
          sessionStorage.setItem("paste-uploads", JSON.stringify({
            photos: pastePhotos.map((p) => ({ url: p.url, name: p.name, preview: p.url })),
            pdfText: pastePdfText,
            pdfUrl: pastePdfUrl,
            pdfName: pastePdfName,
          }));
        } catch { /* sessionStorage unavailable */ }
      }
      const res = await fetch("/api/ai/paste-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pasteTitle || undefined,
          script: pasteScript,
          hook: pasteHook.trim() || undefined,
          city: pasteCity || undefined,
          state: pasteState || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || `Failed (${res.status})`);
      router.push(`/create/${(data.project as { id: string }).id}?source=paste`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPasteGenerating(false);
    }
  }

  async function handleAiWriteForPaste() {
    if (!pasteAiTopic.trim()) return;
    setPasteAiGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: pasteAiTopic }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed");
      setPasteScript(data.script as string);
      if (!pasteTitle) setPasteTitle(pasteAiTopic);
      toast.success("Script ready — review and edit before generating your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setPasteAiGenerating(false);
    }
  }


  const readyToContinue = step === "input" && inputMode === "camera" && !!uploadedFile;
  const locationSet = !!(locCity.trim() && locState.trim());
  const isMarketSaved = savedMarkets.some(
    m => m.city.toLowerCase() === locCity.trim().toLowerCase() && m.state.toUpperCase() === locState.trim().toUpperCase()
  );

  return (
    <div className="max-w-xl mx-auto">

      {/* Settings banner — shown until profile is saved */}
      {onboardingDone === false && (
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="w-full text-left flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 hover:bg-amber-100 transition-colors group"
        >
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Complete your profile to get the most out of your videos</p>
            <p className="text-xs text-amber-600 mt-0.5">Add your headshot, AI avatar photo, voice, logo, and contact info in Settings — they appear in every video you create.</p>
          </div>
          <span className="text-amber-500 text-sm font-semibold shrink-0 group-hover:underline">Go to Settings →</span>
        </button>
      )}

      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold text-brand-text">Create New Video</h2>
        <p className="text-slate-400 text-sm mt-0.5">4 ways to create — choose the one that Speaks to you or Sparks you.</p>
      </div>



      {/* ── Tab bar ── */}
      {step === "input" && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { mode: "script" as InputMode,  icon: Sparkles,   label: "AI Writes It",               active: "bg-blue-600 text-white shadow-md shadow-blue-200",     inactive: "bg-white text-blue-600 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50" },
              { mode: "paste" as InputMode,   icon: PenLine,    label: "Paste / Upload Docs & Images",     active: "bg-violet-600 text-white shadow-md shadow-violet-200",  inactive: "bg-white text-violet-600 border-2 border-violet-200 hover:border-violet-400 hover:bg-violet-50" },
              { mode: "listing" as InputMode, icon: Building2,  label: "My Listing",                 active: "bg-emerald-600 text-white shadow-md shadow-emerald-200", inactive: "bg-white text-emerald-600 border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50" },
              { mode: "camera" as InputMode,  icon: Video,      label: "Use Camera", active: "bg-orange-500 text-white shadow-md shadow-orange-200",   inactive: "bg-white text-orange-500 border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50" },
            ].map(({ mode, icon: Icon, label, active, inactive }) => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl text-xs font-bold transition-all ${
                  inputMode === mode ? active : inactive
                }`}
              >
                <Icon size={15} />
                <span className="leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>

          {/* Dynamic tab description */}
          <p className="text-xs text-slate-500 text-center mb-5">
            {{
              script:  "AI Sparks A Broadcast-Quality Script From Your Topic — You Review, Then Share.",
              paste:   "Paste Your Script, Upload Photos & Docs — Your Content Builds The Video.",
              listing: "Upload Photos Or Import From Zillow — Let Your Listing Spark Your Next Video.",
              camera:  "Speak And Spark Directly In Camera — The Teleprompter Scrolls As You Record. Free, Unlimited.",
            }[inputMode]}
          </p>
        </>
      )}

      {/* ══════════════════════════════════════════
          AI SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "script" && step === "input" && (
        <div className="flex flex-col gap-4">

          {/* ── STEP 1: Your Market ── */}
          <Card>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">1</span>
              <div>
                <p className="text-sm font-bold text-brand-text">Your Market</p>
                <p className="text-xs text-slate-500">Speak Or Type Your City And State</p>
              </div>
            </div>

            {/* Saved market chips */}
            {savedMarkets.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {savedMarkets.map((m) => {
                  const isActive = m.city.toLowerCase() === locCity.trim().toLowerCase() && m.state.toUpperCase() === locState.trim().toUpperCase();
                  return (
                    <div
                      key={`${m.city}-${m.state}`}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:text-blue-700"
                      }`}
                      onClick={() => { setLocCity(m.city); setLocState(m.state); }}
                    >
                      📍 {m.city}, {m.state}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeMarket(m.city, m.state); }}
                        className={`ml-0.5 rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition-colors ${
                          isActive ? "hover:bg-blue-500 text-white" : "hover:bg-slate-200 text-slate-400"
                        }`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* City + State inputs */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-600 block mb-1">City *</label>
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
                <label className="text-xs font-bold text-slate-600 block mb-1">State *</label>
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
            </div>

            {/* Save market hint */}
            {locationSet && !isMarketSaved && (
              <button
                type="button"
                onClick={() => addMarket(locCity, locState)}
                className="mt-2 text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                + Save {locCity}, {locState} As A Quick-Switch Market
              </button>
            )}
          </Card>

          {/* ── STEP 2: Topic ── */}
          <Card>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shrink-0">2</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-text">Your Topic</p>
                <p className="text-xs text-slate-500">Hit The Mic To Speak, Choose From Trending Radar Or The Real Estate Tips Templates, Or Type Below In Text Box</p>
              </div>
              <FieldMic size="md" onTranscript={(t) => setLocCustomTopic(t)} title="Speak your topic" />
            </div>

            {/* Topic Radar */}
            <div className="mt-3">
              <TopicRadar
                city={locCity || undefined}
                state={locState || undefined}
                onSelect={(topic) => {
                  setLocCustomTopic(topic);
                  document.getElementById("topic-input")?.focus();
                }}
              />
            </div>

            {/* Templates toggle */}
            <div className="mb-3">
              <p className="text-sm font-bold text-slate-700 mb-2">Need A Spark? No Problem — Choose From Templates</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-700 shrink-0">🏡 Real Estate Tips</span>
                <button
                  type="button"
                  onClick={() => setShowTemplates(v => !v)}
                  className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    showTemplates
                      ? "bg-indigo-700 text-white shadow-md shadow-indigo-200"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  }`}
                >
                  <LayoutGrid size={13} />
                  Browse Templates
                  {showTemplates ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
                </button>
              </div>
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

            {/* Topic input with inline mic */}
            <div className="mt-5">
              <label className="text-base font-bold text-slate-700 block mb-1">
                Your Topic — Spoken, Sparked, Or Typed
              </label>
              <div className="flex items-center border border-slate-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-blue-500">
                <input
                  id="topic-input"
                  type="text"
                  value={locCustomTopic}
                  onChange={(e) => setLocCustomTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !locGenerating && handleGenerateScript()}
                  placeholder="Speak it, pick above, or type here…"
                  className="flex-1 text-sm px-3 py-2.5 bg-transparent focus:outline-none min-w-0"
                />
                <FieldMic onTranscript={(t) => setLocCustomTopic(t)} title="Speak your topic" />
              </div>
            </div>

            {/* Advanced options — inside this card */}
            <div className="border-t border-slate-200 mt-5 pt-3">
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  showAdvanced
                    ? "bg-teal-700 text-white shadow-md shadow-teal-200"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                }`}
              >
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAdvanced ? "Hide Advanced Options" : "Advanced Options (Audience, Style, CTA)"}
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-3 gap-3 mt-3">
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
              )}
            </div>
          </Card>

          {/* ── STEP 3: Generate ── */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shrink-0">3</span>
              <p className="text-sm font-bold text-brand-text">Generate The Script</p>
            </div>
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
              <p className="text-xs text-slate-400 text-center mt-2">
                Enter A Topic In Step 2 To Unlock This Button
              </p>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════
          PASTE SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "paste" && step === "input" && (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold shrink-0">1</span>
              <div>
                <p className="text-sm font-bold text-brand-text">Your Script &amp; Media</p>
                <p className="text-xs text-slate-500">Upload Photos &amp; Docs, Paste Your Script, Or Let AI Spark It</p>
              </div>
            </div>

            {/* Photo Upload */}
            <div className="mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">Photos <span className="font-normal text-slate-400">(optional · up to 12 · used as b-roll)</span></p>
                {pastePhotos.length > 0 && <span className="text-xs text-slate-400">{pastePhotos.length}/12</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {pastePhotos.map((photo, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 group">
                    <img src={photo.preview} alt={photo.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePastePhoto(i)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                ))}
                {pastePhotos.length < 12 && (
                  <label className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors shrink-0 ${pastePhotoUploading ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:border-violet-300"}`}>
                    {pastePhotoUploading ? <Loader2 size={18} className="text-violet-500 animate-spin" /> : <Plus size={18} className="text-slate-400" />}
                    <input type="file" accept="image/*" multiple className="sr-only" disabled={pastePhotoUploading} onChange={(e) => { if (e.target.files?.length) handlePastePhotosUpload(e.target.files); }} />
                  </label>
                )}
                {pastePhotos.length === 0 && !pastePhotoUploading && (
                  <p className="text-[11px] text-slate-400 self-center ml-1">Click + to add photos — they&apos;ll be used as b-roll.</p>
                )}
              </div>
            </div>

            {/* PDF / URL Attachment */}
            <div className="mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">Attach Doc / URL <span className="font-normal text-slate-400">(optional)</span></p>
                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
                  <button onClick={() => setPastePdfMode("upload")} className={`px-2.5 py-1 transition-colors ${pastePdfMode === "upload" ? "bg-violet-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Upload PDF</button>
                  <button onClick={() => setPastePdfMode("url")} className={`px-2.5 py-1 transition-colors ${pastePdfMode === "url" ? "bg-violet-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Add URL</button>
                </div>
              </div>
              {pastePdfMode === "upload" ? (
                pastePdfUrl ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <FileText size={16} className="text-green-600 shrink-0" />
                    <span className="text-sm text-green-800 flex-1 truncate">{pastePdfName}</span>
                    <button onClick={() => { setPastePdfUrl(""); setPastePdfText(""); setPastePdfName(""); }} className="p-0.5 rounded hover:bg-green-100"><X size={14} className="text-green-700" /></button>
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 p-3 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${pastePdfUploading ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:border-violet-300"}`}>
                    {pastePdfUploading ? <Loader2 size={16} className="text-violet-500 animate-spin shrink-0" /> : <Paperclip size={16} className="text-slate-400 shrink-0" />}
                    <span className="text-sm text-slate-500">{pastePdfUploading ? "Extracting PDF content…" : "Click to attach a PDF"}</span>
                    <input type="file" accept=".pdf,application/pdf" className="sr-only" disabled={pastePdfUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePastePdfUpload(f); }} />
                  </label>
                )
              ) : pastePdfUrl ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <Globe size={16} className="text-green-600 shrink-0" />
                  <span className="text-sm text-green-800 flex-1 truncate">{pastePdfName}</span>
                  <button onClick={() => { setPastePdfUrl(""); setPastePdfText(""); setPastePdfName(""); setPastePdfUrlInput(""); }} className="p-0.5 rounded hover:bg-green-100"><X size={14} className="text-green-700" /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={pastePdfUrlInput}
                    onChange={(e) => setPastePdfUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !pastePdfUrlExtracting && pastePdfUrlInput.trim()) handlePasteUrlExtract(); }}
                    placeholder="https://example.com/article"
                    className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <Button size="sm" loading={pastePdfUrlExtracting} disabled={!pastePdfUrlInput.trim()} onClick={handlePasteUrlExtract} className="bg-violet-600 hover:bg-violet-700 text-white whitespace-nowrap">Fetch</Button>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1">{pastePdfMode === "upload" ? "PDF content will be extracted and used to enrich your video." : "Web page content will be extracted and used to enrich your video."}</p>
            </div>

            {/* Let AI Spark The Script */}
            <div className="mb-5 pb-5 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-600 mb-2">Let AI Spark The Script</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteAiTopic}
                  onChange={(e) => setPasteAiTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !pasteAiGenerating && handleAiWriteForPaste()}
                  placeholder="What's your Spark? Enter a topic…"
                  className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <Button
                  size="sm"
                  loading={pasteAiGenerating}
                  disabled={!pasteAiTopic.trim()}
                  onClick={handleAiWriteForPaste}
                  className="bg-violet-600 hover:bg-violet-700 text-white whitespace-nowrap gap-1"
                >
                  <Sparkles size={13} /> Spark It
                </Button>
              </div>
              {pasteScript && !pasteAiGenerating && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle size={11} /> Script Sparked — Review And Edit Below Before Generating.
                </p>
              )}
            </div>

            {/* Title */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 block mb-1">Video Title (optional)</label>
              <input
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="e.g. Austin Market Update — June 2026"
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Optional thumbnail hook */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 block mb-1">
                First Frame Title / Thumbnail Hook <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={pasteHook}
                onChange={(e) => setPasteHook(e.target.value)}
                placeholder="e.g. Why Austin Buyers Are Moving Fast Right Now"
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Shown as bold text on the video&apos;s first frame — thumbnail-style visual. Your spoken script is unchanged.
              </p>
            </div>

            {/* Generate script from uploads */}
            {(pastePdfText || pastePhotos.length > 0) && (
              <div className="mb-4">
                <Button
                  size="sm"
                  loading={pasteUploadGenerating}
                  onClick={handleGenerateScriptFromPasteUploads}
                  className="w-full gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {pasteUploadGenerating
                    ? <><Loader2 size={13} className="animate-spin" /> Generating Script…</>
                    : <><Sparkles size={13} /> Generate Script from My Uploads</>}
                </Button>
                <p className="text-[11px] text-slate-400 mt-1 text-center">AI will write a script based on your attached doc{pastePhotos.length > 0 ? " and photos" : ""}.</p>
              </div>
            )}

            {/* Script textarea */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Your Script *
                {pasteScript && (
                  <span className={`ml-2 font-normal ${pasteScript.trim().split(/\s+/).length > 500 ? "text-red-500" : "text-slate-400"}`}>
                    {pasteScript.trim().split(/\s+/).length} / 500 words
                  </span>
                )}
              </label>
              <textarea
                value={pasteScript}
                onChange={(e) => setPasteScript(e.target.value)}
                placeholder="Paste or type your script here. The AI avatar will speak this text exactly — keep it under 500 words for best results."
                rows={10}
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none leading-relaxed"
              />
              {pasteScript.trim().split(/\s+/).filter(Boolean).length > 400 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> Over 400 Words — The Script Will Be Trimmed At Generation Time.
                </p>
              )}
            </div>

            {/* Optional city/state */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Market (Optional — Used For Metadata)</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={pasteCity}
                    onChange={(e) => setPasteCity(e.target.value)}
                    placeholder="City"
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="text"
                    value={pasteState}
                    onChange={(e) => setPasteState(e.target.value)}
                    placeholder="ST"
                    maxLength={2}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 uppercase"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Button
            onClick={handlePasteScript}
            loading={pasteGenerating}
            disabled={!pasteScript.trim()}
            size="lg"
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
          >
            {pasteGenerating
              ? <>Saving Script…</>
              : <><ArrowRight size={16} /> Review &amp; Generate Video</>}
          </Button>
          {!pasteScript.trim() && (
            <p className="text-xs text-slate-400 text-center -mt-2">
              Paste Your Script Above To Continue
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
              <p className="text-xs text-slate-400">Upload Photos · Import From Zillow · Enter Manually</p>
            </div>
          </div>
          <ListingVideoForm />
        </Card>
      )}

      {/* ══════════════════════════════════════════
          CAMERA TAB
      ══════════════════════════════════════════ */}
      {inputMode === "camera" && step === "input" && (
        <>
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                <Video size={16} className="text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-text">Speak + Teleprompter</p>
                <p className="text-xs text-slate-400">Speak Your Script — The Teleprompter Scrolls As You Record</p>
              </div>
            </div>

            <CameraRecorder city={locCity || undefined} state={locState || undefined} initialScript={cameraGeneratedScript || undefined} />

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

          {/* Photos & PDF — shown as reference in teleprompter + used as b-roll */}
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <ImageIcon size={15} className="text-orange-500" />
              <p className="text-sm font-semibold text-brand-text">Add Photos &amp; Docs <span className="text-xs font-normal text-slate-400">(optional)</span></p>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Photos appear as reference thumbnails in the teleprompter so you can describe what you see. They&apos;ll also be used as b-roll in your video.</p>

            {/* Photo grid */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600">Photos <span className="font-normal text-slate-400">(up to 12)</span></p>
                {cameraPhotos.length > 0 && <span className="text-xs text-slate-400">{cameraPhotos.length}/12</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {cameraPhotos.map((photo, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 group">
                    <img src={photo.preview} alt={photo.name} className="w-full h-full object-cover" />
                    <button onClick={() => removeCameraPhoto(i)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                ))}
                {cameraPhotos.length < 12 && (
                  <label className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors shrink-0 ${cameraPhotoUploading ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:border-orange-300"}`}>
                    {cameraPhotoUploading ? <Loader2 size={18} className="text-orange-500 animate-spin" /> : <Plus size={18} className="text-slate-400" />}
                    <input type="file" accept="image/*" multiple className="sr-only" disabled={cameraPhotoUploading} onChange={(e) => { if (e.target.files?.length) handleCameraPhotosUpload(e.target.files); }} />
                  </label>
                )}
                {cameraPhotos.length === 0 && !cameraPhotoUploading && (
                  <p className="text-[11px] text-slate-400 self-center ml-1">Click + to add photos.</p>
                )}
              </div>
            </div>

            {/* PDF / URL */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-600">Attach Doc / URL <span className="font-normal text-slate-400">(optional)</span></p>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
                <button onClick={() => setCameraPdfMode("upload")} className={`px-2.5 py-1 transition-colors ${cameraPdfMode === "upload" ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Upload PDF</button>
                <button onClick={() => setCameraPdfMode("url")} className={`px-2.5 py-1 transition-colors ${cameraPdfMode === "url" ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Add URL</button>
              </div>
            </div>
            {cameraPdfMode === "upload" ? (
              cameraPdfUrl ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <FileText size={16} className="text-green-600 shrink-0" />
                  <span className="text-sm text-green-800 flex-1 truncate">{cameraPdfName}</span>
                  <button onClick={() => { setCameraPdfUrl(""); setCameraPdfText(""); setCameraPdfName(""); }} className="p-0.5 rounded hover:bg-green-100"><X size={14} className="text-green-700" /></button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 p-3 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${cameraPdfUploading ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:border-orange-300"}`}>
                  {cameraPdfUploading ? <Loader2 size={16} className="text-orange-500 animate-spin shrink-0" /> : <Paperclip size={16} className="text-slate-400 shrink-0" />}
                  <span className="text-sm text-slate-500">{cameraPdfUploading ? "Extracting PDF content…" : "Click to attach a PDF"}</span>
                  <input type="file" accept=".pdf,application/pdf" className="sr-only" disabled={cameraPdfUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCameraPdfUpload(f); }} />
                </label>
              )
            ) : cameraPdfUrl ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                <Globe size={16} className="text-green-600 shrink-0" />
                <span className="text-sm text-green-800 flex-1 truncate">{cameraPdfName}</span>
                <button onClick={() => { setCameraPdfUrl(""); setCameraPdfText(""); setCameraPdfName(""); setCameraPdfUrlInput(""); }} className="p-0.5 rounded hover:bg-green-100"><X size={14} className="text-green-700" /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={cameraPdfUrlInput}
                  onChange={(e) => setCameraPdfUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !cameraPdfUrlExtracting && cameraPdfUrlInput.trim()) handleCameraUrlExtract(); }}
                  placeholder="https://example.com/article"
                  className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <Button size="sm" loading={cameraPdfUrlExtracting} disabled={!cameraPdfUrlInput.trim()} onClick={handleCameraUrlExtract} className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap">Fetch</Button>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">{cameraPdfMode === "upload" ? "PDF content will be extracted and used to enrich your video." : "Web page content will be extracted and used to enrich your video."}</p>

            {(cameraPdfText || cameraPhotos.length > 0) && (
              <div className="mt-3">
                <Button
                  size="sm"
                  loading={cameraScriptGenerating}
                  onClick={handleGenerateScriptFromCameraUploads}
                  className="w-full gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {cameraScriptGenerating
                    ? <><Loader2 size={13} className="animate-spin" /> Generating Script…</>
                    : <><Sparkles size={13} /> Generate Teleprompter Script from My Uploads</>}
                </Button>
                <p className="text-[11px] text-slate-400 mt-1 text-center">Script will be loaded into your teleprompter above.</p>
              </div>
            )}
          </Card>
        </>
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
                <p className="font-semibold text-brand-text">Uploading Your Recording…</p>
                <p className="text-sm text-slate-400 mt-1">Securely Storing Your Audio</p>
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
                <p className="font-semibold text-brand-text">Transcribing Your Voice…</p>
                <p className="text-sm text-slate-400 mt-1">Converting Speech To Text</p>
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
                    {transcript || "No Transcript Generated. Please Try Again."}
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
