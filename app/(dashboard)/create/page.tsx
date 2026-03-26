"use client";

import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { VoiceUploader } from "@/components/voice/voice-uploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic, Upload, ArrowRight, CheckCircle, Loader2, FileText } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Step = "input" | "uploading" | "transcribing" | "done";
type InputMode = "record" | "upload";

export default function CreatePage() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>("record");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<{ blob: Blob; duration: number } | null>(null);

  async function processAudio(blob: Blob, durationSeconds: number, title = "New Recording") {
    setStep("uploading");

    try {
      // Upload to Supabase Storage
      const formData = new FormData();
      formData.append("audio", blob, `recording.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      formData.append("title", title);
      formData.append("duration", String(durationSeconds));

      const uploadRes = await fetch("/api/voice/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const { recording, signedUrl } = await uploadRes.json();
      setRecordingId(recording.id);

      // Transcribe
      setStep("transcribing");

      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id, signedUrl }),
      });

      if (!transcribeRes.ok) {
        const err = await transcribeRes.json();
        throw new Error(err.error || "Transcription failed");
      }

      const { transcript: text } = await transcribeRes.json();
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
    // Navigate to project editor — project will be created there
    router.push(`/create/${recordingId}?source=recording`);
  }

  const readyToContinue =
    step === "input" &&
    ((inputMode === "record" && uploadedBlob) || (inputMode === "upload" && uploadedFile));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">Create New Video</h2>
        <p className="text-slate-500 text-sm mt-1">
          Record or upload your voice — we&apos;ll handle the rest.
        </p>
      </div>

      {/* Progress steps */}
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
              <div className={`flex items-center gap-2 text-xs font-medium ${isActive ? "text-primary-500" : isDone ? "text-accent-500" : "text-slate-300"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive ? "bg-primary-500 text-white" : isDone ? "bg-accent-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                  {isDone ? <CheckCircle size={12} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < arr.length - 1 && <div className={`flex-1 h-px w-8 ${isDone ? "bg-accent-500" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* Input step */}
      {step === "input" && (
        <Card>
          {/* Mode toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setInputMode("record")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${inputMode === "record" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"}`}
            >
              <Mic size={16} /> Record Voice
            </button>
            <button
              onClick={() => setInputMode("upload")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${inputMode === "upload" ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-brand-text"}`}
            >
              <Upload size={16} /> Upload Audio
            </button>
          </div>

          {inputMode === "record" ? (
            <VoiceRecorder
              onRecordingComplete={handleRecordingComplete}
              maxSeconds={300}
            />
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
            <p className="font-semibold text-brand-text">Transcribing with ElevenLabs AI...</p>
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
    </div>
  );
}
