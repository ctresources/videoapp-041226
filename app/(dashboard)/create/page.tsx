"use client";

import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldMic } from "@/components/ui/field-mic";
import {
  Mic, ArrowRight, CheckCircle, Loader2, FileText,
  Building2, Video, Square, Pause, AlertCircle,
  ChevronDown, Sparkles,
  Plus, X, Paperclip, ImageIcon, Globe,
} from "lucide-react";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { ListingVideoForm } from "@/components/create/listing-video-form";
import { SparkPanel } from "@/components/create/spark-panel";
import {
  TEMPLATE_COUNT,
  substitutePlaceholders,
} from "@/components/create/content-templates";
import { VoiceBriefSession } from "@/components/create/voice-brief-session";
import { usePublishCreateProgress } from "@/components/layout/create-progress";
import { ComposerCard } from "@/components/create/composer-card";
import { StepFooter } from "@/components/create/step-footer";
import { uploadVideoPhoto } from "@/lib/utils/upload-photo";
import { toStateAbbr } from "@/lib/utils/us-states";
import {
  CAMERA_LENGTHS,
  LONG_MAX_WORDS,
  minutesFor,
  standardMaxWords,
  type CameraLength,
} from "@/lib/utils/video-length";

/** Pasted scripts are measured against both caps — the length is picked later. */
const SHORT_MAX_WORDS = standardMaxWords();

/**
 * Copies photos scraped off a listing page into our own storage so the camera
 * recorder can composite them. Best effort — on any failure the originals come
 * back, which still work everywhere except the recording canvas.
 */
async function rehostPhotos(urls: string[]): Promise<string[]> {
  try {
    const res = await fetch("/api/photos/rehost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const body = await safeJson(res);
    const out = Array.isArray(body.urls) ? (body.urls as string[]) : null;
    return out && out.length === urls.length ? out : urls;
  } catch {
    return urls;
  }
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

type Step = "input" | "uploading" | "transcribing" | "done";
// "content" is the merged My Content & Listings tab — it shows a chooser that
// routes into the "paste" or "listing" flows, which remain distinct modes.
type InputMode = "script" | "camera" | "listing" | "paste" | "content";

// Shown one at a time above the composer while the topic is still blank, to
// answer "what am I supposed to say into this" without a paragraph of help
// text. Kept market-agnostic: the page has no city yet when these are on
// screen, so a line naming one would be wrong more often than right.
// Whole spoken sentences, not topic fragments. These double as the typed
// field's placeholder, and a three-word example there taught people to type
// three words and stop — leaving the market, audience and tone to be asked
// for separately when they could have said it all in one breath.
const TRY_LINES = [
  "Make a market update for my area — prices are up, homes are moving fast.",
  "Tell the story of the home I just sold, start to finish.",
  "Show what five hundred thousand actually buys around here.",
  "Three things I'd fix before listing this fall, aimed at sellers.",
  "Answer the commute question everybody keeps asking me.",
  "Explain what today's rates mean for a real monthly payment.",
];

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
  // null until the profile loads — avoids flashing the voice prompt at users
  // who do have a clone.
  const [hasVoiceClone, setHasVoiceClone] = useState<boolean | null>(null);

  // Location
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [profileHomeState, setProfileHomeState] = useState("");
  const [savedMarkets, setSavedMarkets] = useState<{ city: string; state: string }[]>([]);

  // Topic
  const [locCustomTopic, setLocCustomTopic] = useState("");

  // Advanced options
  const [locAudience, setLocAudience] = useState("");
  const [locTone, setLocTone] = useState("");
  const [locCta, setLocCta] = useState("");
  // Chosen BEFORE generating: the script has to be written to length, or a
  // "long" video ends up with a 2-minute script.
  const [locLength, setLocLength] = useState<"standard" | "long">("standard");
  // Reel or YouTube, asked here rather than in the editor. It is one of the
  // four things the composer's chips prompt you to say, and a chip cannot
  // prompt for something this step has no way to answer.
  const [locPlatform, setLocPlatform] = useState<"reel" | "youtube">("youtube");
  // Whether the format was actually chosen, as opposed to left on its default.
  // Only the chip cares — the value is valid either way.
  const [formatTouched, setFormatTouched] = useState(false);
  // Length for AI-written teleprompter scripts (camera + paste flows). Camera
  // recordings are free and run up to 15 min, so this is the agent's choice.
  const [cameraScriptLength, setCameraScriptLength] = useState<CameraLength>("standard");

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
  // The camera tab had no topic field at all — its only AI path was "write
  // from my uploads". The spoken brief supplies one.
  const [cameraVoiceTopic, setCameraVoiceTopic] = useState("");

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

    // Handed off from the editor's "Record on Camera" button — the hook,
    // script and CTA it already generated, pre-filling the teleprompter
    // instead of the user copying each field over by hand.
    try {
      const handoff = sessionStorage.getItem("camera-record-script");
      if (handoff) {
        setCameraGeneratedScript(handoff);
        sessionStorage.removeItem("camera-record-script");
      }
    } catch { /* sessionStorage unavailable */ }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase
        .from("profiles")
        .select("location_city, location_state, saved_markets, onboarding_done, heygen_voice_id")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.location_city && !urlCity) setLocCity(data.location_city);
          if (data?.location_state && !urlState) setLocState(data.location_state);
          if (data?.location_state) setProfileHomeState(data.location_state);
          if (urlCity) setLocCity(urlCity);
          if (urlState) setLocState(urlState);
          if (Array.isArray(data?.saved_markets)) {
            // Drop any malformed entries (null/missing city or state) so render-time
            // string ops like m.city.toLowerCase() can never throw and crash the page.
            const clean = (data.saved_markets as unknown[])
              .filter((m): m is { city: string; state: string } =>
                !!m && typeof (m as { city?: unknown }).city === "string" && typeof (m as { state?: unknown }).state === "string")
              .map((m) => ({ city: m.city, state: m.state }));
            setSavedMarkets(clean);
          }
          setOnboardingDone(!!(data as { onboarding_done?: boolean } | null)?.onboarding_done);
          setHasVoiceClone(!!(data as { heygen_voice_id?: string | null } | null)?.heygen_voice_id);
        });
    });
  }, []); // eslint-disable-line

  // State always fills in alongside the city: a saved-market match wins,
  // otherwise the profile's home state backfills an empty state field so the
  // user never has to type it separately.
  useEffect(() => {
    const c = locCity.trim().toLowerCase();
    if (!c) return;
    const match = savedMarkets.find((m) => (m.city ?? "").toLowerCase() === c);
    if (match?.state) { setLocState(match.state); return; }
    if (!locState.trim() && profileHomeState) setLocState(profileHomeState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locCity, savedMarkets, profileHomeState]);

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
          const { url, name } = await uploadVideoPhoto(file);
          return { url, name, preview: url };
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
    if (savedMarkets.some(m => (m.city ?? "").toLowerCase() === c.toLowerCase() && (m.state ?? "").toUpperCase() === s)) return;
    const updated = [...savedMarkets, { city: c, state: s }];
    setSavedMarkets(updated);
    persistMarkets(updated);
  }

  function removeMarket(city: string, state: string) {
    const updated = savedMarkets.filter(m => !(m.city === city && m.state === state));
    setSavedMarkets(updated);
    persistMarkets(updated);
  }

  /**
   * `spoken` carries values straight from the voice session. Its onReady and
   * onSlots fire in the same tick, so anything read back from React state
   * here would be a render behind — and one utterance carrying the whole
   * brief plus the wake word is exactly when that state is still empty.
   */
  async function handleGenerateScript(spoken?: { city?: string | null; state?: string | null; topic?: string | null }) {
    const city = (spoken?.city ?? locCity).trim();
    const state = (spoken?.state ?? locState).trim();
    const topic = (spoken?.topic ?? locCustomTopic).trim();
    // No market gate any more — the topic carries its own location, and the
    // saved market is only a fallback for topics that name no place.
    if (!topic) {
      return toast.error("Please enter or pick a topic");
    }
    if (city && state) addMarket(city, state);
    setLocGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-location-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoType: "custom",
          // A fallback only. If the topic names a place, that place wins —
          // see buildCustomRequest in lib/api/perplexity-prompts.ts.
          city,
          state,
          // A template picked before the location was filled says "your city".
          // Re-resolving here means the order the two were done in stops
          // mattering.
          customTopic: (topicTemplateRaw
            ? substitutePlaceholders(topicTemplateRaw, city, state)
            : topic
          ).trim(),
          audience: locAudience || undefined,
          tone: locTone || undefined,
          ctaPreference: locCta || undefined,
          videoLength: locLength,
          videoPlatform: locPlatform,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || `Script generation failed (${res.status})`);
      toast.success("Sparked — your script is ready to review.");
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
          const { url, name } = await uploadVideoPhoto(file);
          return { url, name, preview: url };
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
      const found = (Array.isArray(body.photoUrls) ? body.photoUrls as string[] : []);
      if (found.length > 0) {
        // Same reason as the camera tab: these come back on the listing site's
        // domain. Here it's the renderer that has to fetch them rather than a
        // canvas, so hotlink protection or an expired URL costs you the photo
        // silently. Copying them into our own storage removes the dependency.
        const usable = await rehostPhotos(found);
        setPastePhotos((prev) => {
          const room = 12 - prev.length;
          const add = usable.slice(0, room).map((url) => ({ url, name: "From page", preview: url }));
          return [...prev, ...add];
        });
      }
      toast.success(found.length > 0 ? `URL content extracted — ${found.length} photo${found.length > 1 ? "s" : ""} found!` : "URL content extracted!");
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
      const found = (Array.isArray(body.photoUrls) ? body.photoUrls as string[] : []);
      if (found.length > 0) {
        // Scraped photos live on the listing site's domain, which makes them
        // unusable as b-roll — the recorder cannot draw a cross-origin image
        // without tainting the canvas and breaking the recording outright.
        // Copy them into our own storage first; failures come back unchanged
        // and simply won't appear as b-roll.
        const usable = await rehostPhotos(found);
        setCameraPhotos((prev) => {
          const room = 12 - prev.length;
          const add = usable.slice(0, room).map((url) => ({ url, name: "From page", preview: url }));
          return [...prev, ...add];
        });
      }
      toast.success(found.length > 0 ? `URL content extracted — ${found.length} photo${found.length > 1 ? "s" : ""} found!` : "URL content extracted!");
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
        body: JSON.stringify({ pdfText: pastePdfText || undefined, photoCount: pastePhotos.length, length: cameraScriptLength }),
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

  /**
   * Teleprompter script from a topic the agent spoke, rather than from
   * uploads. Same endpoint — it already accepts either.
   */
  async function handleCameraScriptFromTopic(topic: string) {
    if (!topic.trim()) return;
    setCameraScriptGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, length: cameraScriptLength }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to generate script");
      setCameraGeneratedScript(data.script as string);
      toast.success("Script ready — it's loaded in your teleprompter.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setCameraScriptGenerating(false);
    }
  }

  async function handleGenerateScriptFromCameraUploads() {
    setCameraScriptGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfText: cameraPdfText || undefined, photoCount: cameraPhotos.length, length: cameraScriptLength }),
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
        body: JSON.stringify({ topic: pasteAiTopic, length: cameraScriptLength }),
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


  // The full template browser is collapsed until asked for — the design leads
  // with trending and formats, not all 29 templates at once.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // The unresolved "{city}, {state}" form of a picked template. Kept so that
  // choosing a template before filling the location still ends up with the
  // real place in it rather than a literal "your city".
  const [topicTemplateRaw, setTopicTemplateRaw] = useState<string | null>(null);
  // filter(Boolean) matters: "".split(/\s+/) is [""], which counts as one word
  // and made an empty box read "1 / 500".
  const pasteWordCount = pasteScript.trim().split(/\s+/).filter(Boolean).length;

  function openTemplates() {
    setTemplatesOpen(true);
    // Points at the spark panel, which now holds the full list in its picker —
    // the old expanding browser and its #topic-templates anchor are gone.
    setTimeout(
      () => document.getElementById("spark-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  const readyToContinue = step === "input" && inputMode === "camera" && !!uploadedFile;
  const locationSet = !!(locCity.trim() && locState.trim());
  const isMarketSaved = savedMarkets.some(
    m => (m.city ?? "").toLowerCase() === locCity.trim().toLowerCase() && (m.state ?? "").toUpperCase() === locState.trim().toUpperCase()
  );
  // The two things step 1 actually needs before it can hand over.
  const canContinue = locationSet && !!locCustomTopic.trim() && !locGenerating;

  // Feeds the topbar's step chip and gradient rail. Deliberately mode-agnostic:
  // paste, listing and camera all move through the same processing states, and
  // "Step 1" is the page's own existing language for where you are.
  const railLabel =
    step === "uploading" ? "Uploading"
      : step === "transcribing" ? "Transcribing"
        : step === "done" ? "Ready"
          : locGenerating ? "Sparking"
            : "Step 1";
  const railPercent =
    step === "done" ? 100
      : step === "transcribing" ? 75
        : locGenerating ? 60
          : step === "uploading" ? 50
            : canContinue || readyToContinue ? 25
              : 10;
  usePublishCreateProgress(railLabel, railPercent);

  // Only the AI-script flow has been moved onto the fixed bar so far; the
  // paste, listing and camera flows still carry their own inline CTAs.
  const showActionBar = inputMode === "script" && step === "input";

  return (
    // Every tab fills the full content width — the AI-script step lays out as
    // two equal columns, the other tabs flow full-width single column.
    // The bottom padding clears the fixed action bar so the last card is not
    // trapped underneath it.
    // One centred column with its own gutters, matching the design and the
    // step footer's width. The route opts out of the shared page padding, so
    // without this the content ran edge to edge — flush against the sidebar on
    // desktop and touching both screen edges on a phone.
    <div className={`mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 ${showActionBar ? "pb-28" : "pb-6"}`}>

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

      {/* Voice clone prompt.
          Cloning is opt-in and buried in Settings, and a video renders fine
          without it — just in a stock voice — so agents had no way to discover
          the feature or to notice they were missing it. Held back until the
          profile banner above is gone so a new user only ever sees one nudge. */}
      {onboardingDone !== false && hasVoiceClone === false && (
        <button
          type="button"
          onClick={() => router.push("/settings#voice")}
          className="w-full text-left flex items-start gap-3 bg-spark-blue/10 border border-spark-blue/25 rounded-xl px-4 py-3 mb-5 hover:bg-spark-blue/10 transition-colors group"
        >
          <Mic size={17} className="text-spark-blue shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-spark-ink">Your videos are using a stock voice</p>
            <p className="text-xs text-spark-blue mt-0.5">
              Record about 30 seconds once, and every video you make from then on speaks in your own voice.
            </p>
          </div>
          <span className="text-spark-blue text-sm font-semibold shrink-0 group-hover:underline">Clone my voice →</span>
        </button>
      )}

      {/* ── Step 1 · the whole brief ──
          Mode, place, optional audience and tone, and the topic are one step.
          They are all answers to "what video am I making", so splitting them
          across screens made the flow feel longer than the work. Next carries
          on to format, avatar and music in the editor. */}
      {/* ── Hero ──
          The one display-type moment on the page. Playfair is opted into here
          rather than inherited by every heading, per the brand guide, and the
          second half carries the four-stop gradient. */}
      {step === "input" && (
        <div className="pt-2">
          <h1 className="font-display text-[40px] font-semibold leading-[1.0] tracking-[-0.02em] text-spark-ink text-balance sm:text-[52px]">
            Hit the Mic.{" "}
            <span className="bg-gradient-to-r from-spark-amber via-[#52665D] to-spark-blue bg-clip-text text-transparent">
              Be Visible.
            </span>
          </h1>
          <p className="mt-3 text-[17px] leading-[1.4] text-spark-ink-muted text-pretty sm:text-[19px]">
            {inputMode === "camera"
              ? "Your face, your voice, your script — the teleprompter does the rest."
              : inputMode === "paste" || inputMode === "listing" || inputMode === "content"
                ? "Bring a listing sheet, a link or your photos. We turn it into a video."
                : "No script, no prep, no camera. Just your expertise."}
          </p>
        </div>
      )}

      {/* ── How you're creating ──
          Above the composer, not below it: which of the three you pick decides
          what the rest of the page even shows, so it cannot come after the
          thing it changes. */}
      {step === "input" && (
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            {
              mode: "script" as InputMode,
              kicker: "Fastest",
              label: "AI writes it",
              desc: "Say it, we script it",
            },
            {
              mode: "content" as InputMode,
              kicker: "Doc, link or photos",
              label: "From my material",
              desc: "We extract, you deliver",
            },
            {
              mode: "camera" as InputMode,
              kicker: "Up to 15 min",
              label: "My camera",
              desc: "You on screen",
            },
          ].map(({ mode, kicker, label, desc }) => {
            // The merged tab stays lit while the user is in either sub-flow
            const active =
              inputMode === mode ||
              (mode === "content" && (inputMode === "paste" || inputMode === "listing"));
            return (
              <button
                key={mode}
                type="button"
                // The merged tab drops straight into the Paste/Upload flow —
                // the pill toggle inside switches to My Listings.
                onClick={() => setInputMode(mode === "content" ? "paste" : mode)}
                aria-pressed={active}
                className={`flex min-h-[74px] flex-col justify-center gap-0.5 rounded-[14px] px-3.5 py-2.5 text-left transition-colors ${
                  active
                    ? "border-[1.5px] border-spark-amber bg-white"
                    : "border-[1.5px] border-spark-rule bg-white/60 hover:border-spark-rule-dim"
                }`}
              >
                <span
                  className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${
                    active ? "text-[#A3660F]" : "text-spark-ink-faint"
                  }`}
                >
                  {kicker}
                </span>
                <span className="text-[15.5px] font-semibold leading-[1.15] text-spark-ink">{label}</span>
                <span className="text-[12.5px] leading-[1.25] text-spark-ink-muted">{desc}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Your topic ──
          One card, per the v2 composer. The speak-or-type choice used to be
          two large tiles in a section of their own, above a second section
          holding the actual input — two headings and a rule between the
          decision and the thing it changed. It is now a segmented control in
          this card's header, next to the input it switches.

          Trending and templates stay below the card rather than inside it:
          they are other ways to fill the same field, not part of the composer,
          and folding them in would have made the card the whole page. */}
      {inputMode === "script" && step === "input" && (
        <div className="mt-7 flex flex-col gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-spark-amber">
            AI writes it · Step 1 of 5
          </p>
          <ComposerCard
            showTryLine={!locCustomTopic.trim()}
            tryLines={TRY_LINES}
            chips={[
              { label: "Topic", ask: "What's it about?", ok: !!locCustomTopic.trim() },
              { label: "Which town?", ask: "Which town?", ok: locationSet },
              { label: "Audience", ask: "Who's it for?", ok: !!locAudience.trim() },
              // Always satisfiable now that format is asked on this step. It
              // starts on a default, so this reads as "set" from the outset —
              // the chip is a reminder of what you can say, not a blocker.
              { label: "Format", ask: "Shorts or longform?", ok: formatTouched },
            ]}
          >
            {/* One input for both ways in. Speech writes into the box, typing
                edits it, and Send commits — so a misheard word is a keystroke
                to fix rather than the whole brief said again. The speak-or-type
                choice this replaced was asking which of two boxes to show, when
                the answer was always "the one that takes both". */}
            <VoiceBriefSession
              disabled={locGenerating}
              onSwitchToTyping={() => { /* the box already takes typing */ }}
              // Only ever fills blanks it has an answer for — a null slot
              // must not wipe something already typed or picked from a chip.
              onSlots={(s) => {
                if (s.city) setLocCity(s.city);
                if (s.state) setLocState(s.state);
                if (s.topic) { setLocCustomTopic(s.topic); setTopicTemplateRaw(null); }
                if (s.audience) setLocAudience(s.audience);
                if (s.tone) setLocTone(s.tone);
                if (s.length) { setLocLength(s.length); setFormatTouched(true); }
                if (s.platform) { setLocPlatform(s.platform); setFormatTouched(true); }
                // Long form renders landscape only. Said together, "long reel"
                // has to resolve to something buildable, and the length is the
                // half that changes the script.
                if (s.length === "long") setLocPlatform("youtube");
              }}
              onReady={(sl) => { if (!locGenerating) handleGenerateScript(sl); }}
            />
          </ComposerCard>

          {/* ── Spark an idea ──
              Trending, formats and the full template list are one panel with
              three tabs now, rather than a trending row plus an expanding
              browser below it. They all fill the same field the composer does,
              so they read as alternatives to it, not as separate steps. */}
          <SparkPanel
            city={locCity || undefined}
            state={locState || undefined}
            onSelect={(topic, raw) => { setLocCustomTopic(topic); setTopicTemplateRaw(raw); }}
          />
        </div>
      )}


      {/* ══════════════════════════════════════════
          AI SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "script" && step === "input" && (
        <div className="mt-4 flex flex-col gap-3">

          {/* ── Where / Who / What ──
              One shaded panel of questions, as in the design, rather than a
              two-column grid of loose fields.

              Where is per video, not per account: one agent covers several
              areas and will make a different video for each, so this is a
              question the page has to ask rather than a profile setting it can
              assume. It seeds the trending list too. */}
          <section className="rounded-[18px] border border-spark-rule bg-[#f4f2e8] px-5 py-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-ink-muted">
                Where? · City and state
              </p>
              <p className="text-[14px] text-spark-ink-muted">
                {locationSet ? "Set" : "Say it or type it"}
              </p>
            </div>

            {savedMarkets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedMarkets.map((m) => {
                  const isActive =
                    (m.city ?? "").toLowerCase() === locCity.trim().toLowerCase() &&
                    (m.state ?? "").toUpperCase() === locState.trim().toUpperCase();
                  return (
                    <div
                      key={`${m.city}-${m.state}`}
                      onClick={() => { setLocCity(m.city); setLocState(m.state); }}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        isActive
                          ? "border-spark-amber bg-spark-amber text-white"
                          : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-amber hover:text-spark-amber"
                      }`}
                    >
                      {m.city}, {m.state}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeMarket(m.city, m.state); }}
                        className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[12px] transition-colors ${
                          isActive ? "text-white hover:bg-spark-blue" : "text-spark-ink-faint hover:bg-spark-rule-soft"
                        }`}
                        aria-label={`Remove ${m.city}, ${m.state}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-[13px] font-medium text-spark-ink-soft">City or area</label>
                <div className="flex items-center rounded-[9px] border border-spark-rule bg-white focus-within:ring-2 focus-within:ring-spark-amber">
                  <input
                    type="text"
                    value={locCity}
                    onChange={(e) => setLocCity(e.target.value)}
                    // Deliberately not a real town. Naming one puts a single
                    // market in front of every user in the country, and this
                    // field is the whole subject of the video.
                    placeholder="Your city or area"
                    className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[15px] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none"
                  />
                  <FieldMic onTranscript={(t) => setLocCity(t.replace(/[.,]\s*$/, "").trim())} title="Say the city" />
                </div>
              </div>
              <div className="w-24">
                <label className="mb-1.5 block text-[13px] font-medium text-spark-ink-soft">State</label>
                <div className="flex items-center rounded-[9px] border border-spark-rule bg-white focus-within:ring-2 focus-within:ring-spark-amber">
                  <input
                    type="text"
                    value={locState}
                    onChange={(e) => setLocState(e.target.value)}
                    placeholder="ST"
                    maxLength={2}
                    className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[15px] uppercase text-spark-ink placeholder:text-spark-ink-faint focus:outline-none"
                  />
                  <FieldMic onTranscript={(t) => setLocState(toStateAbbr(t))} title="Say the state" />
                </div>
              </div>
            </div>

            {locationSet && !isMarketSaved && (
              <button
                type="button"
                onClick={() => addMarket(locCity, locState)}
                className="self-start text-[13px] font-medium text-spark-amber hover:text-spark-blue"
              >
                + Save {locCity}, {locState.toUpperCase()} so it is one tap next time
              </button>
            )}
          </div>

          {/* Audience, style and CTA are optional and Length is the only
              required one (it already defaults to Standard, so it is never
              empty) — but all four stay visible and pickable up front rather
              than behind an Edit toggle. Hiding them made "optional" read as
              "hidden", and the user should see what they can set without a
              click to find out.

              No card of its own now: these sit inside the shaded ask panel
              with Where, so the page asks its questions in one place. */}
          <div className="mt-6">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
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
                      label: "Call to action", value: locCta, set: setLocCta,
                      // "None" is a real choice now, not just an unset dropdown
                      // — it tells the script to skip the CTA section entirely
                      // rather than fall back to a generic "reach out today".
                      options: [["", "Default"], ["none", "None"], ["call", "Call"], ["text", "Text"], ["website", "Website"], ["consultation", "Consult"]],
                    },
                  ].map(({ label, value, set, options }) => (
                    <div key={label}>
                      <label className="mb-1.5 block text-[13px] font-medium text-spark-ink-soft">{label}</label>
                      <div className="relative">
                        <select
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          className="w-full appearance-none rounded-[9px] border border-spark-rule bg-white px-3 py-2.5 pr-8 text-[15px] text-spark-ink focus:outline-none focus:ring-2 focus:ring-spark-amber"
                        >
                          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-spark-ink-faint" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── What? · Shorts or Longform ──
                    Shape and length together, because they are one decision
                    to say out loud ("a short vertical one", "a longform video")
                    and because the script is written to the length — by the
                    time you reach the editor the words already exist.

                    Shorts run either way up; longform is horizontal only. That
                    is not a UI choice — the render refuses long form for
                    vertical (see isLongForm in api/video/create-blog), so a
                    vertical longform tile would quietly clamp the script back
                    to four minutes. */}
                <div className="mt-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-ink-muted">
                      What? · Shorts or Longform
                    </p>
                    <p className="text-[14px] text-spark-ink-muted">Default — change it anytime</p>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      { p: "reel", l: "standard", title: "Shorts", sub: "Under 4 min · 9:16 (vertical)", w: "11px", h: "17px" },
                      { p: "youtube", l: "standard", title: "Shorts", sub: "Under 4 min · 16:9 (horizontal)", w: "20px", h: "12px" },
                      { p: "youtube", l: "long", title: "Longform", sub: "Over 4 min · 16:9 (horizontal)", w: "20px", h: "12px" },
                    ] as const).map(({ p, l, title, sub, w, h }) => {
                      const on = locPlatform === p && locLength === l;
                      return (
                        <button
                          key={`${p}-${l}`}
                          type="button"
                          onClick={() => { setLocPlatform(p); setLocLength(l); setFormatTouched(true); }}
                          aria-pressed={on}
                          className={`relative flex min-h-[58px] flex-col justify-center gap-0.5 rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors ${
                            on ? "border-spark-amber" : "border-spark-rule hover:border-spark-rule-dim"
                          }`}
                        >
                          {on && (
                            <span className="pointer-events-none absolute -inset-px rounded-[13px] border-[2.5px] border-spark-amber" />
                          )}
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`flex-none rounded-[3px] border-[1.5px] ${on ? "border-spark-amber" : "border-spark-ink-faint"}`}
                              style={{ width: w, height: h }}
                            />
                            <span className="text-[14px] font-semibold leading-[1.1] text-spark-ink">{title}</span>
                          </span>
                          <span className="text-[12px] leading-[1.2] text-spark-ink-muted">{sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  {locLength === "long" && (
                    <p className="mt-2 text-[12.5px] leading-[1.4] text-spark-ink-faint">
                      Longform runs up to 8 minutes, reads your full script start to finish, and
                      uses your uploaded photos as the visuals. Horizontal only.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* The Next button itself now lives in the fixed footer below, so it
              stays reachable without scrolling to the bottom of the brief.
              This spacer keeps the last card clear of it. */}
          <div className="h-2" />

        </div>
      )}

      {/* ── Fixed action bar ──
          v2 pins the primary action to the bottom of the screen with the
          status line beside it, so "what do I do next" never scrolls away.
          The Back slot is held open but empty: this page is step 1, and step 2
          is a different route, so there is nowhere back to go yet. */}
      {showActionBar && (
        <StepFooter
          hint={
            locGenerating
              ? "Researching the area and writing — this takes about a minute."
              : !locationSet
                ? "Add the city and state above to carry on."
                : !locCustomTopic.trim()
                  ? "Say or pick what the video is about to carry on."
                  : "We'll write the script first, then you pick how it looks."
          }
        >
          <Button
            // Wrapped: bare, the click event would arrive as the spoken overrides.
            onClick={() => handleGenerateScript()}
            loading={locGenerating}
            disabled={!canContinue}
            size="lg"
            className="gap-2"
          >
            {locGenerating
              ? <>Sparking<span className="hidden sm:inline"> your script</span>…</>
              : <>Next<span className="hidden sm:inline"> · video setup</span> <ArrowRight size={18} /></>}
          </Button>
        </StepFooter>
      )}

      {/* ══════════════════════════════════════════
          PASTE SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "paste" && step === "input" && (
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          {/* Sub-toggle — switch between the two My Content flows */}
          <div className="lg:col-span-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setInputMode("paste")} className="px-4 py-2 rounded-full text-sm font-semibold border-2 spark-cta-gradient text-white border-transparent">
              📄 Paste / Upload Script
            </button>
            <button type="button" onClick={() => setInputMode("listing")} className="px-4 py-2 rounded-full text-sm font-semibold border-2 bg-white text-slate-600 border-slate-200 hover:border-spark-rule-dim transition-colors">
              🏠 My Listings
            </button>
          </div>
          {/* Left column: the script itself */}
          <div className="flex flex-col gap-3 min-w-0">
          <Card padding="sm" className="p-3 border-t-4 border-t-violet-500">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-spark-amber to-spark-amber-glow text-white flex items-center justify-center text-base font-bold shrink-0 shadow-sm">1</span>
              <div>
                <p className="text-base font-bold text-brand-text">Your Script</p>
                <p className="text-sm text-slate-500">Paste It, Type It, Or Let AI Spark It</p>
              </div>
            </div>

            {/* Let AI Spark The Script */}
            <div className="mb-4 pb-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-600 mb-2">Let AI Spark The Script</p>
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-slate-500 mb-1">Script Length</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {CAMERA_LENGTHS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setCameraScriptLength(l.key)}
                      className={`px-2 py-1.5 rounded-lg border text-center transition-colors ${
                        cameraScriptLength === l.key
                          ? "border-spark-amber bg-spark-amber-tint"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="block text-[11px] font-bold text-brand-text">{l.label}</span>
                      <span className="block text-[10px] text-slate-500">{l.minutes} min</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteAiTopic}
                  onChange={(e) => setPasteAiTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !pasteAiGenerating && handleAiWriteForPaste()}
                  placeholder="What's your Spark? Enter a topic…"
                  className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
                />
                <Button
                  size="sm"
                  loading={pasteAiGenerating}
                  disabled={!pasteAiTopic.trim()}
                  onClick={handleAiWriteForPaste}
                  className="whitespace-nowrap gap-1"
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
              <label className="text-sm font-bold text-slate-600 block mb-1">Video Title (optional)</label>
              <input
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="e.g. Austin Market Update — June 2026"
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
              />
            </div>

            {/* Optional thumbnail hook */}
            <div className="mb-4">
              <label className="text-sm font-bold text-slate-600 block mb-1">
                First Frame Title / Thumbnail Hook <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={pasteHook}
                onChange={(e) => setPasteHook(e.target.value)}
                placeholder="e.g. Why Austin Buyers Are Moving Fast Right Now"
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Shown as bold text on the video&apos;s first frame — thumbnail-style visual. Your spoken script is unchanged.
              </p>
            </div>

            {/* Script textarea.
                The length of the video is not chosen here — it is picked in the
                editor — so a pasted script can't be measured against one limit.
                Both are shown, and the count says which one the script currently
                fits, rather than asserting 500 at someone writing an 8-minute
                video. Limits come from video-length.ts, not from a number typed
                in here, so they follow the caps. */}
            <div className="mb-4">
              <label className="text-sm font-bold text-slate-600 block mb-1">
                Your Script *
                {pasteWordCount > 0 && (
                  <span
                    className={`ml-2 font-normal ${
                      pasteWordCount > LONG_MAX_WORDS
                        ? "text-red-500"
                        : pasteWordCount > SHORT_MAX_WORDS
                          ? "text-amber-600"
                          : "text-slate-400"
                    }`}
                  >
                    {pasteWordCount.toLocaleString()} words · ~{minutesFor(pasteWordCount)} min
                  </span>
                )}
              </label>
              <textarea
                value={pasteScript}
                onChange={(e) => setPasteScript(e.target.value)}
                placeholder={`Paste or type your script here. The AI avatar speaks it exactly as written — up to ${SHORT_MAX_WORDS} words for a standard video, or ${LONG_MAX_WORDS.toLocaleString()} for a long one.`}
                rows={10}
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber resize-none leading-relaxed"
              />

              {pasteWordCount === 0 ? (
                <p className="text-xs text-slate-400 mt-1">
                  Standard video: up to {SHORT_MAX_WORDS} words (~{minutesFor(SHORT_MAX_WORDS)} min) ·
                  Long video: up to {LONG_MAX_WORDS.toLocaleString()} words (~{minutesFor(LONG_MAX_WORDS)} min)
                </p>
              ) : pasteWordCount <= SHORT_MAX_WORDS ? (
                <p className="text-xs text-slate-400 mt-1">
                  Fits a standard video ({SHORT_MAX_WORDS} words max). A long video takes up to{" "}
                  {LONG_MAX_WORDS.toLocaleString()}.
                </p>
              ) : pasteWordCount <= LONG_MAX_WORDS ? (
                <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Too long for a standard video — choose <strong>Long video</strong> on the next
                    screen, or cut {(pasteWordCount - SHORT_MAX_WORDS).toLocaleString()} words to fit.
                  </span>
                </p>
              ) : (
                <p className="text-xs text-red-500 mt-1 flex items-start gap-1">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Over the {LONG_MAX_WORDS.toLocaleString()}-word maximum even for a long video.
                    The last {(pasteWordCount - LONG_MAX_WORDS).toLocaleString()} words will be cut
                    before recording.
                  </span>
                </p>
              )}
            </div>

            {/* Optional city/state */}
            <div className="border-t border-slate-100 pt-3">
              {/* Not just metadata: this becomes the project's city/state, which
                  the editor's CTA falls back off. Left blank it uses the profile's
                  home city, so a Willow Grove listing went out saying Blue Bell. */}
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">Market For This Video</p>
              <p className="text-xs text-slate-400 mb-2 normal-case font-normal">
                Spoken in your channel CTA and used for titles and tags — set it to the property&apos;s town, not your office.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={pasteCity}
                    onChange={(e) => setPasteCity(e.target.value)}
                    placeholder="City"
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="text"
                    value={pasteState}
                    onChange={(e) => setPasteState(e.target.value)}
                    placeholder="ST"
                    maxLength={2}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber uppercase"
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
            className="w-full gap-2"
          >
            {pasteGenerating
              ? <>Saving Script…</>
              : <><ArrowRight size={16} /> Review &amp; Generate Video</>}
          </Button>
          {!pasteScript.trim() && (
            <p className="text-sm text-slate-400 text-center -mt-1">
              Paste Your Script Above To Continue
            </p>
          )}
          </div>{/* end left column */}

          {/* Right column: media & docs */}
          <Card padding="sm" className="p-3 min-w-0 lg:sticky lg:top-4 border-t-4 border-t-purple-400">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-spark-amber to-fuchsia-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <ImageIcon size={17} />
              </span>
              <div>
                <p className="text-base font-bold text-brand-text">Media &amp; Docs <span className="text-sm font-normal text-slate-400">(Optional)</span></p>
                <p className="text-sm text-slate-500">Photos Become B-Roll · Docs &amp; URLs Enrich The Script</p>
              </div>
            </div>
            {/* Photo Upload */}
            <div className="mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-600">Photos <span className="font-normal text-slate-400">(optional · up to 12 · used as b-roll)</span></p>
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
                  <label className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors shrink-0 ${pastePhotoUploading ? "border-spark-rule-dim bg-spark-amber-tint" : "border-slate-200 hover:border-spark-rule-dim"}`}>
                    {pastePhotoUploading ? <Loader2 size={18} className="text-spark-amber animate-spin" /> : <Plus size={18} className="text-slate-400" />}
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
                <p className="text-sm font-bold text-slate-600">Attach Doc / URL <span className="font-normal text-slate-400">(optional)</span></p>
                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
                  <button onClick={() => setPastePdfMode("upload")} className={`px-2.5 py-1 transition-colors ${pastePdfMode === "upload" ? "bg-spark-amber text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Upload PDF</button>
                  <button onClick={() => setPastePdfMode("url")} className={`px-2.5 py-1 transition-colors ${pastePdfMode === "url" ? "bg-spark-amber text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Add URL</button>
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
                  <label className={`flex items-center gap-2 p-3 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${pastePdfUploading ? "border-spark-rule-dim bg-spark-amber-tint" : "border-slate-200 hover:border-spark-rule-dim"}`}>
                    {pastePdfUploading ? <Loader2 size={16} className="text-spark-amber animate-spin shrink-0" /> : <Paperclip size={16} className="text-slate-400 shrink-0" />}
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
                    className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
                  />
                  <Button size="sm" loading={pastePdfUrlExtracting} disabled={!pastePdfUrlInput.trim()} onClick={handlePasteUrlExtract} className="whitespace-nowrap">Fetch</Button>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1">{pastePdfMode === "upload" ? "PDF content will be extracted and used to enrich your video." : "Web page content will be extracted and used to enrich your video."}</p>
            </div>

            {/* Generate script from uploads */}
            {(pastePdfText || pastePhotos.length > 0) && (
              <div className="mb-4">
                <Button
                  size="sm"
                  loading={pasteUploadGenerating}
                  onClick={handleGenerateScriptFromPasteUploads}
                  className="w-full gap-1.5"
                >
                  {pasteUploadGenerating
                    ? <><Loader2 size={13} className="animate-spin" /> Generating Script…</>
                    : <><Sparkles size={13} /> Generate Script from My Uploads</>}
                </Button>
                <p className="text-[11px] text-slate-400 mt-1 text-center">AI will write a script based on your attached doc{pastePhotos.length > 0 ? " and photos" : ""}.</p>
              </div>
            )}

          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LISTING TAB
      ══════════════════════════════════════════ */}
      {inputMode === "listing" && (
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          {/* Sub-toggle — switch between the two My Content flows */}
          <div className="lg:col-span-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setInputMode("paste")} className="px-4 py-2 rounded-full text-sm font-semibold border-2 bg-white text-slate-600 border-slate-200 hover:border-spark-rule-dim transition-colors">
              📄 Paste / Upload Script
            </button>
            <button type="button" onClick={() => setInputMode("listing")} className="px-4 py-2 rounded-full text-sm font-semibold border-2 spark-cta-gradient text-white border-transparent">
              🏠 My Listings
            </button>
          </div>
          <Card padding="sm" className="p-3 min-w-0 border-t-4 border-t-emerald-500">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-gradient-to-br from-spark-amber to-spark-amber-glow rounded-xl flex items-center justify-center shadow-sm">
                <Building2 size={17} className="text-white" />
              </div>
              <div>
                <p className="text-base font-bold text-brand-text">Listing Video</p>
                <p className="text-sm text-slate-500">Upload Photos · Import From Zillow · Enter Manually</p>
              </div>
            </div>
            <ListingVideoForm />
          </Card>

          {/* What you get — keeps the right column balanced */}
          <Card padding="sm" className="p-3 min-w-0 lg:sticky lg:top-4 border-t-4 border-t-teal-400">
            <p className="text-base font-bold text-brand-text mb-3">🏡 What Your Listing Video Includes</p>
            <ul className="text-sm text-slate-600 space-y-2.5">
              <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your listing photos as cinematic b-roll with Ken Burns motion</li>
              <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> AI script highlighting price, beds/baths, and standout features</li>
              <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your AI avatar and cloned voice presenting the property</li>
              <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your logo, contact card, and Fair-Housing-safe wording built in</li>
              <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Title, description &amp; hashtags auto-generated for publishing</li>
            </ul>
            <p className="text-sm text-slate-400 mt-3 pt-3 border-t border-slate-100">💡 Tip: Zillow import fills everything in seconds — just paste the listing URL.</p>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CAMERA TAB

          One card, one top-to-bottom order: market → photos → script →
          prompter → branded look → record. Split across two columns this read
          as two competing forms. Width is capped so the script and tips don't
          stretch into unreadable lines on a wide monitor.
      ══════════════════════════════════════════ */}
      {inputMode === "camera" && step === "input" && (
        <div className="max-w-3xl">
          <Card padding="sm" className="p-3 min-w-0 border-t-4 border-t-emerald-500">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-gradient-to-br from-spark-amber to-spark-amber-glow rounded-xl flex items-center justify-center shadow-sm">
                <Video size={17} className="text-white" />
              </div>
              <div>
                <p className="text-base font-bold text-brand-text">Speak + Teleprompter</p>
                <p className="text-sm text-slate-500">Speak Your Script — The Teleprompter Scrolls As You Record</p>
              </div>
            </div>

            {/* ── Spoken brief ──
                The camera tab's only AI path was "write from my uploads", so
                an agent with nothing to upload had no way to get a script.
                Speaking one fills the market above and writes the
                teleprompter. Same session component and endpoint as the
                AI-writes-it tab — the brief is the same brief. */}
            <div className="mb-4">
                <VoiceBriefSession
                  disabled={cameraScriptGenerating}
                  onSwitchToTyping={() => { /* the box already takes typing */ }}
                  onSlots={(sl) => {
                    if (sl.city) setLocCity(sl.city);
                    if (sl.state) setLocState(sl.state);
                    if (sl.topic) setCameraVoiceTopic(sl.topic);
                    // The brief speaks in standard/long; the teleprompter has
                    // four lengths. Map onto the nearest and leave the
                    // four-way picker for anything finer.
                    if (sl.length) setCameraScriptLength(sl.length === "long" ? "full" : "standard");
                  }}
                  onReady={(sl) => handleCameraScriptFromTopic(sl.topic ?? cameraVoiceTopic)}
                />
            </div>

            {/* Market for THIS video. Without it the CTA and end card silently
                fell back to the profile's home city — a Willow Grove listing
                went out saying Blue Bell. */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Market For This Video
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={locCity}
                  onChange={(e) => setLocCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 min-w-0 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  value={locState}
                  onChange={(e) => setLocState(toStateAbbr(e.target.value))}
                  placeholder="ST"
                  maxLength={2}
                  className="w-16 shrink-0 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Used by your channel CTA and the end card — set it to the property&apos;s town, not your office.
              </p>
            </div>

            {/* Photos & docs. Sits above the script because it feeds it — the AI
                  writes from these, and they become the b-roll. */}
            <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="w-9 h-9 bg-gradient-to-br from-spark-amber to-spark-amber-glow rounded-xl flex items-center justify-center shadow-sm shrink-0">
                  <ImageIcon size={17} className="text-white" />
                </span>
                <p className="text-base font-bold text-brand-text">Add Photos &amp; Docs <span className="text-sm font-normal text-slate-400">(Optional)</span></p>
              </div>
              <p className="text-sm text-slate-500 mb-3">Photos fill the screen as b-roll while you record — you stay on camera in the corner. They also shape the script the AI writes for you.</p>

              {/* Photo grid */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-600">Photos <span className="font-normal text-slate-400">(up to 12)</span></p>
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
                    <label className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors shrink-0 ${cameraPhotoUploading ? "border-spark-rule-dim bg-emerald-50" : "border-slate-200 hover:border-spark-rule-dim"}`}>
                      {cameraPhotoUploading ? <Loader2 size={18} className="text-spark-amber animate-spin" /> : <Plus size={18} className="text-slate-400" />}
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
                <p className="text-sm font-medium text-slate-600">Attach Doc / URL <span className="font-normal text-slate-400">(optional)</span></p>
                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
                  <button onClick={() => setCameraPdfMode("upload")} className={`px-2.5 py-1 transition-colors ${cameraPdfMode === "upload" ? "bg-spark-amber text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Upload PDF</button>
                  <button onClick={() => setCameraPdfMode("url")} className={`px-2.5 py-1 transition-colors ${cameraPdfMode === "url" ? "bg-spark-amber text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Add URL</button>
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
                  <label className={`flex items-center gap-2 p-3 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${cameraPdfUploading ? "border-spark-rule-dim bg-emerald-50" : "border-slate-200 hover:border-spark-rule-dim"}`}>
                    {cameraPdfUploading ? <Loader2 size={16} className="text-spark-amber animate-spin shrink-0" /> : <Paperclip size={16} className="text-slate-400 shrink-0" />}
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
                    className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
                  />
                  <Button size="sm" loading={cameraPdfUrlExtracting} disabled={!cameraPdfUrlInput.trim()} onClick={handleCameraUrlExtract} className="whitespace-nowrap">Fetch</Button>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1">{cameraPdfMode === "upload" ? "PDF content will be extracted and used to enrich your video." : "Web page content will be extracted and used to enrich your video."}</p>

              {(cameraPdfText || cameraPhotos.length > 0) && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    loading={cameraScriptGenerating}
                    onClick={handleGenerateScriptFromCameraUploads}
                    className="w-full gap-1.5"
                  >
                    {cameraScriptGenerating
                      ? <><Loader2 size={13} className="animate-spin" /> Generating Script…</>
                      : <><Sparkles size={13} /> Generate Teleprompter Script from My Uploads</>}
                  </Button>
                  <p className="text-[11px] text-slate-400 mt-1 text-center">Script will be loaded into your teleprompter below.</p>
                </div>
              )}
            </div>

            <CameraRecorder
              city={locCity || undefined}
              state={locState || undefined}
              initialScript={cameraGeneratedScript || undefined}
              photos={cameraPhotos.map((p) => p.url)}
            />

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

        </div>
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
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? "text-spark-blue" : isDone ? "text-spark-amber" : "text-slate-300"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive ? "bg-spark-amber text-white" : isDone ? "bg-spark-amber text-white" : "bg-slate-200 text-slate-400"}`}>
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
              <div className="w-14 h-14 bg-spark-blue/10 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-spark-blue animate-spin" />
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
              <div className="w-14 h-14 bg-spark-amber-tint rounded-2xl flex items-center justify-center">
                <FileText className="w-7 h-7 text-spark-amber animate-pulse" />
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
                  <CheckCircle className="w-5 h-5 text-spark-amber" />
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
