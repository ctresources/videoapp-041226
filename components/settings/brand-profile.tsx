"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";
import {
  Camera, Upload, Trash2, CheckCircle, Loader2, Mic, Square,
  RefreshCw, Image as ImageIcon, Sparkles, Phone, MapPin, Globe, FileText, Video, Play, StopCircle,
} from "lucide-react";

export interface BrandProfileInitial {
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  company_phone: string | null;
  company_address: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  voice_clone_id: string | null;
  heygen_photo_id: string | null;
  website: string | null;
  license_number: string | null;
}

interface BrandProfileProps {
  userId: string;
  email: string;
  initial: BrandProfileInitial;
}

// ── Reusable image uploader ──────────────────────────────────────────────────
function ImageUploader({
  label, hint, bucket, path, currentUrl, onUploaded, shape = "square", icon: Icon = ImageIcon,
}: {
  label: string; hint: string; bucket: string; path: string;
  currentUrl: string | null; onUploaded: (url: string) => void;
  shape?: "circle" | "square"; icon?: React.ElementType;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const filePath = `${path}.${ext}?t=${Date.now()}`;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
    setPreview(publicUrl);
    onUploaded(publicUrl);
    setUploading(false);
    toast.success(`${label} uploaded!`);
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => inputRef.current?.click()}
        className={`relative shrink-0 overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 hover:border-primary-400 transition-colors group ${
          shape === "circle" ? "w-20 h-20 rounded-full" : "w-20 h-20 rounded-2xl"
        }`}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <Icon size={24} className="text-slate-400 absolute inset-0 m-auto" />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={16} className="text-white" />
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-primary-500" />
          </div>
        )}
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
        <div className="flex gap-2 mt-2">
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-40">
            <Upload size={11} /> {preview ? "Change" : "Upload"}
          </button>
          {preview && (
            <button onClick={() => { setPreview(null); onUploaded(""); }}
              className="text-xs font-medium text-red-400 hover:text-red-600 flex items-center gap-1">
              <Trash2 size={11} /> Remove
            </button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── Talking Avatar Photo uploader ────────────────────────────────────────────
// Uploads headshot to Supabase (→ avatar_url) + registers with HeyGen Talking
// Photo API (→ heygen_photo_id). The photo_id is cached so video renders never
// re-upload the same photo.
function TalkingAvatarUploader({
  userId,
  currentPhotoId,
  currentAvatarUrl,
  onUpdate,
}: {
  userId: string;
  currentPhotoId: string | null;
  currentAvatarUrl: string | null;
  onUpdate: (photoId: string | null, avatarUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoId, setPhotoId] = useState(currentPhotoId);
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [registeringHeyGen, setRegisteringHeyGen] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }

    // Step 1 — upload to Supabase Storage
    setUploadingPhoto(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const filePath = `${userId}/headshot.${ext}?t=${Date.now()}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploadingPhoto(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setPreview(publicUrl);
    setUploadingPhoto(false);

    // Step 2 — register with HeyGen Talking Photo API
    setRegisteringHeyGen(true);
    try {
      const res = await fetch("/api/profile/heygen-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: publicUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotoId(data.photo_id);
      onUpdate(data.photo_id, publicUrl);
      toast.success("Talking avatar photo saved! Your videos will now show you speaking.");
    } catch (err) {
      // HeyGen registration failed — still save avatar_url so static PiP works
      const supabaseClient = createClient();
      await supabaseClient.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      onUpdate(null, publicUrl);
      toast.success("Photo saved! Talking avatar will activate on first video render.");
      console.warn("HeyGen registration skipped:", err);
    } finally {
      setRegisteringHeyGen(false);
    }
  }

  const busy = uploadingPhoto || registeringHeyGen;
  const statusLabel = uploadingPhoto
    ? "Uploading photo…"
    : registeringHeyGen
    ? "Registering with AI avatar…"
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          onClick={() => !busy && inputRef.current?.click()}
          disabled={busy}
          className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 hover:border-primary-400 transition-colors group shrink-0 disabled:cursor-not-allowed"
        >
          {preview ? (
            <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <Camera size={24} className="text-slate-400 absolute inset-0 m-auto" />
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-primary-500" />
            </div>
          )}
          {!busy && preview && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={16} className="text-white" />
            </div>
          )}
        </button>

        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700">Your Headshot</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Appears as a talking avatar in your videos · Front-facing, plain background
          </p>
          {statusLabel ? (
            <p className="text-xs text-primary-600 font-medium mt-1.5 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> {statusLabel}
            </p>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-1.5 disabled:opacity-40"
            >
              <Upload size={11} /> {preview ? "Change photo" : "Upload headshot"}
            </button>
          )}
        </div>
      </div>

      {/* Status badges */}
      {photoId ? (
        <div className="flex items-start gap-2.5 p-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle size={15} className="text-green-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Talking avatar ready</p>
            <p className="text-xs text-green-600 mt-0.5">
              Your face will appear as a lip-synced avatar speaking in your videos.
            </p>
          </div>
        </div>
      ) : preview ? (
        <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Video size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Photo saved · avatar activates on first render</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Your headshot will be registered with the AI on your next video generation.
            </p>
          </div>
        </div>
      ) : null}

      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <p className="text-xs text-blue-700 leading-relaxed flex items-start gap-1.5">
          <Sparkles size={11} className="text-blue-500 mt-0.5 shrink-0" />
          <span><strong>Tips:</strong> Clear front-facing photo, neutral expression, plain background, no sunglasses or hats.</span>
        </p>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── Voice Clone uploader (record + upload) ───────────────────────────────────
function VoiceCloneUploader({ userId, currentVoiceId, onUpdate }: {
  userId: string; currentVoiceId: string | null; onUpdate: (id: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tab, setTab] = useState<"record" | "upload">("record");
  const [voiceId, setVoiceId] = useState(currentVoiceId);
  const [submitting, setSubmitting] = useState(false);

  // Recording state
  const [recState, setRecState] = useState<"idle" | "recording" | "recorded">("idle");
  const [recSeconds, setRecSeconds] = useState(0);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Clean up object URL on unmount
  useEffect(() => () => { if (recUrl) URL.revokeObjectURL(recUrl); }, [recUrl]);

  function fmtTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecBlob(blob);
        setRecUrl(url);
        setRecState("recorded");
        if (timerRef.current) clearInterval(timerRef.current);
      };

      mr.start(250);
      setRecState("recording");
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setMicError(msg.includes("denied") || msg.includes("Permission")
        ? "Microphone permission denied. Allow access in your browser settings."
        : "Could not access microphone. Try uploading a file instead.");
    }
  }, []);

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function discardRecording() {
    if (recUrl) URL.revokeObjectURL(recUrl);
    setRecBlob(null);
    setRecUrl(null);
    setRecState("idle");
    setRecSeconds(0);
  }

  async function submitAudio(audioBlob: Blob, filename: string) {
    setSubmitting(true);
    const form = new FormData();
    form.append("audio", audioBlob, filename);
    form.append("name", "My Voice");
    try {
      const res = await fetch("/api/profile/voice-clone", { method: "POST", body: form });
      const text = await res.text();
      let data: { voice_id?: string; error?: string } = {};
      try { data = JSON.parse(text); } catch {
        throw new Error(res.ok ? "Unexpected server response." : `Server error ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error || "Voice clone failed");
      if (!data.voice_id) throw new Error("No voice ID returned from server.");
      setVoiceId(data.voice_id);
      onUpdate(data.voice_id);
      setRecState("idle");
      setRecBlob(null);
      setRecUrl(null);
      toast.success("Voice clone created! Your AI videos will now use your voice.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice clone failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await submitAudio(file, file.name);
    e.target.value = "";
  }

  async function handleDelete() {
    if (!confirm("Remove your voice clone? Your AI videos will use a default voice.")) return;
    await fetch("/api/profile/voice-clone", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: voiceId }),
    });
    setVoiceId(null);
    onUpdate(null);
    toast.success("Voice clone removed");
  }

  // ── Active voice clone ────────────────────────────────────────────────────
  if (voiceId) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center shrink-0">
            <Mic size={16} className="text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Voice clone active</p>
            <p className="text-xs text-green-600 mt-0.5">Your videos will be narrated in your cloned voice.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => { setVoiceId(null); setRecState("idle"); }}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <RefreshCw size={11} /> Re-clone
            </button>
            <button onClick={handleDelete}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
              <Trash2 size={11} /> Remove
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup UI (tabs: Record / Upload) ──────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* Tab switcher */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden">
        {(["record", "upload"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); discardRecording(); setMicError(null); }}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              tab === t
                ? "bg-primary-600 text-white"
                : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t === "record" ? <><Mic size={12} /> Record</>  : <><Upload size={12} /> Upload file</>}
          </button>
        ))}
      </div>

      {/* ── RECORD TAB ─────────────────────────────────────────────────── */}
      {tab === "record" && (
        <div className="flex flex-col gap-3">
          {micError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs text-red-700">{micError}</p>
            </div>
          )}

          {/* Sample script to read */}
          {recState !== "recorded" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1">
                <Mic size={11} /> Sample script — read this aloud when recording
              </p>
              <p className="text-xs text-amber-900 leading-relaxed italic">
                "Hi, my name is [your name] and I'm a real estate agent. I help buyers and sellers
                navigate the market with confidence. Whether you're looking for your first home,
                upgrading to something bigger, or selling to start a new chapter — I'm here to guide
                you every step of the way. With years of local market experience, I know how to get
                results for my clients. Let's find your perfect home together. Give me a call anytime
                — I'd love to help."
              </p>
            </div>
          )}

          {/* Idle — ready to record */}
          {recState === "idle" && !micError && (
            <button
              onClick={startRecording}
              className="flex items-center gap-3 w-full p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/30 transition-all"
            >
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Mic size={18} className="text-red-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-700">Click to start recording</p>
                <p className="text-xs text-slate-400">Read the script above · quiet room · no background noise</p>
              </div>
            </button>
          )}

          {/* Recording in progress */}
          {recState === "recording" && (
            <div className="flex flex-col items-center gap-4 p-5 rounded-xl border-2 border-red-300 bg-red-50">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-semibold text-red-700">Recording…</span>
                <span className="text-sm font-mono text-red-600">{fmtTime(recSeconds)}</span>
              </div>
              <p className="text-xs text-red-500 text-center">
                Speak clearly and naturally. Aim for at least 30 seconds.
              </p>
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Square size={14} /> Stop Recording
              </button>
            </div>
          )}

          {/* Preview recorded audio */}
          {recState === "recorded" && recUrl && (
            <div className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <CheckCircle size={15} className="text-green-500 shrink-0" />
                <span className="text-sm font-medium text-slate-700">
                  Recording complete — {fmtTime(recSeconds)}
                </span>
              </div>
              <audio ref={audioRef} src={recUrl} controls className="w-full h-9" />
              <div className="flex gap-2">
                <button
                  onClick={() => submitAudio(recBlob!, "recording.webm")}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {submitting
                    ? <><Loader2 size={14} className="animate-spin" /> Cloning voice…</>
                    : <><Mic size={14} /> Use this recording</>}
                </button>
                <button
                  onClick={discardRecording}
                  disabled={submitting}
                  className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl disabled:opacity-40 transition-colors"
                >
                  Re-record
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD TAB ─────────────────────────────────────────────────── */}
      {tab === "upload" && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            className="flex items-center gap-3 w-full p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={20} className="text-primary-500 animate-spin shrink-0" />
            ) : (
              <Upload size={20} className="text-slate-400 shrink-0" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-slate-700">
                {submitting ? "Creating voice clone…" : "Choose audio file"}
              </p>
              <p className="text-xs text-slate-400">MP3, WAV, M4A · 30 sec – 5 min · clear speech, no music</p>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.mp4,.ogg,.webm,.aac,.flac"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Tips */}
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Best results:</strong> Speak naturally for 1–3 minutes in a quiet room. No background
          music, no echo. Use the same microphone you use for client calls.
        </p>
      </div>
    </div>
  );
}

// ── Main BrandProfile component ───────────────────────────────────────────────
export function BrandProfile({ userId, email, initial }: BrandProfileProps) {
  const [fields, setFields] = useState({
    full_name:       initial.full_name       || "",
    company_name:    initial.company_name    || "",
    phone:           initial.phone           || "",
    company_phone:   initial.company_phone   || "",
    company_address: initial.company_address || "",
    avatar_url:      initial.avatar_url      || "",
    logo_url:        initial.logo_url        || "",
    voice_clone_id:  initial.voice_clone_id  || "",
    heygen_photo_id: initial.heygen_photo_id || "",
    website:         initial.website         || "",
    license_number:  initial.license_number  || "",
  });
  const [saving, setSaving] = useState(false);

  function set(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name:       fields.full_name.trim()       || null,
        company_name:    fields.company_name.trim()    || null,
        phone:           fields.phone.trim()           || null,
        company_phone:   fields.company_phone.trim()   || null,
        company_address: fields.company_address.trim() || null,
        avatar_url:      fields.avatar_url             || null,
        logo_url:        fields.logo_url               || null,
        website:         fields.website.trim()         || null,
        license_number:  fields.license_number.trim()  || null,
      })
      .eq("id", userId);

    if (error) toast.error(error.message);
    else toast.success("Profile saved!");
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Contact Info ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Contact Info</p>

        {/* Avatar preview + name */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-xl shrink-0 overflow-hidden">
            {fields.avatar_url
              ? <img src={fields.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : (fields.full_name?.[0] || email?.[0] || "U").toUpperCase()
            }
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-text">{fields.full_name || "Your Name"}</p>
            <p className="text-xs text-slate-400">{email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Full Name"
            value={fields.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="Jane Smith"
          />
          <Input
            label="Company / Brokerage"
            value={fields.company_name}
            onChange={(e) => set("company_name", e.target.value)}
            placeholder="Smith Realty Group"
          />
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <Phone size={11} /> Mobile Phone
            </label>
            <input
              type="tel"
              value={fields.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <Phone size={11} /> Company Phone <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={fields.company_phone}
              onChange={(e) => set("company_phone", e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <MapPin size={11} /> Company Address <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={fields.company_address}
              onChange={(e) => set("company_address", e.target.value)}
              placeholder="123 Main St, Austin, TX 78701"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Photos & Branding ─────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Photos & Branding</p>
        <div className="flex flex-col gap-5">

          {/* Talking avatar photo — uploads to avatar_url + registers heygen_photo_id */}
          <TalkingAvatarUploader
            userId={userId}
            currentPhotoId={fields.heygen_photo_id || null}
            currentAvatarUrl={fields.avatar_url || null}
            onUpdate={(photoId, avatarUrl) => {
              set("heygen_photo_id", photoId || "");
              set("avatar_url", avatarUrl);
            }}
          />

          <ImageUploader
            label="Brokerage Logo"
            hint="Appears as a watermark on your videos. PNG with transparent background recommended."
            bucket="assets"
            path={`${userId}/logo`}
            currentUrl={fields.logo_url || null}
            onUploaded={(url) => set("logo_url", url)}
            shape="square"
            icon={ImageIcon}
          />
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Additional Info ────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Additional Info</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <Globe size={11} /> Website
            </label>
            <input
              type="url"
              value={fields.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://youragentwebsite.com"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <FileText size={11} /> RE License Number
            </label>
            <input
              type="text"
              value={fields.license_number}
              onChange={(e) => set("license_number", e.target.value)}
              placeholder="DRE #01234567"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Voice Clone ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">AI Voice Clone</p>
        <p className="text-xs text-slate-400 mb-4">Your videos will be narrated in your own voice</p>
        <VoiceCloneUploader
          userId={userId}
          currentVoiceId={fields.voice_clone_id || null}
          onUpdate={(id) => set("voice_clone_id", id || "")}
        />
      </div>

      <Button onClick={handleSave} loading={saving} className="self-start">
        Save Profile
      </Button>
    </div>
  );
}
