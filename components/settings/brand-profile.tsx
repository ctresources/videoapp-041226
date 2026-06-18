"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { AvatarLooksManager } from "@/components/settings/avatar-looks-manager";
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
  heygen_voice_id: string | null;
  heygen_photo_id: string | null;
  website: string | null;
  license_number: string | null;
  heygen_digital_twin_group_id: string | null;
  heygen_digital_twin_look_id: string | null;
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
  const [heygenError, setHeygenError] = useState<string | null>(null);

  async function retryHeyGenRegistration() {
    if (!preview) return;
    setHeygenError(null);
    setRegisteringHeyGen(true);
    try {
      const res = await fetch("/api/profile/heygen-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: preview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotoId(data.photo_id);
      onUpdate(data.photo_id, preview);
      toast.success("Talking avatar registered! Your videos will now show you speaking.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setHeygenError(msg);
      toast.error("AI registration failed — try uploading a clearer front-facing photo.");
    } finally {
      setRegisteringHeyGen(false);
    }
  }

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
      // HeyGen registration failed — still save avatar_url so user can retry later
      const supabaseClient = createClient();
      await supabaseClient.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      onUpdate(null, publicUrl);
      const msg = err instanceof Error ? err.message : "Registration failed";
      setHeygenError(msg);
      toast.error("Photo saved but AI registration failed — use a clear front-facing headshot and click Retry.");
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
            <div className="flex items-center gap-3 mt-1.5">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-40"
              >
                <Upload size={11} /> {preview ? "Upload new photo" : "Upload headshot"}
              </button>
              {preview && (
                <button
                  onClick={() => { setPreview(null); setPhotoId(null); onUpdate(null, ""); }}
                  disabled={busy}
                  className="text-xs font-medium text-red-400 hover:text-red-600 flex items-center gap-1 disabled:opacity-40"
                >
                  <Trash2 size={11} /> Remove
                </button>
              )}
            </div>
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
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">AI registration pending</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Upload a clear front-facing face photo, then click Retry to activate your talking avatar.
            </p>
            {heygenError && (
              <p className="text-xs text-red-600 mt-1 font-medium">Error: {heygenError}</p>
            )}
            <button
              onClick={retryHeyGenRegistration}
              disabled={busy}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-40"
            >
              {registeringHeyGen ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {registeringHeyGen ? "Registering…" : "Retry AI registration"}
            </button>
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

// ── Digital Twin Creator ─────────────────────────────────────────────────────
function DigitalTwinCreator({
  userId,
  initialGroupId,
  initialLookId,
}: {
  userId: string;
  initialGroupId: string | null;
  initialLookId: string | null;
}) {
  const [groupId, setGroupId] = useState(initialGroupId);
  const [dtStatus, setDtStatus] = useState<"none" | "loading" | "processing" | "pending_consent" | "active" | "failed">(
    initialGroupId ? "loading" : "none",
  );
  const [inputMode, setInputMode] = useState<"camera" | "upload" | "url">("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [recordings, setRecordings] = useState<{ id: string; video_url: string; created_at: string }[]>([]);
  const [selectedRec, setSelectedRec] = useState("");
  const [dtName, setDtName] = useState("My Digital Twin");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load camera recordings on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("generated_videos")
      .select("id, video_url, created_at")
      .eq("user_id", userId)
      .eq("render_provider", "camera")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const recs = (data ?? []) as { id: string; video_url: string; created_at: string }[];
        setRecordings(recs);
        if (recs.length) setSelectedRec(recs[0].video_url);
      });
  }, [userId]);

  const checkStatus = useCallback(async () => {
    const res = await fetch("/api/avatar/digital-twin");
    if (!res.ok) return;
    const d = await res.json();
    const s = d.status as string;
    if (s === "active" || s === "completed") setDtStatus("active");
    else if (s === "pending_consent") setDtStatus("pending_consent");
    else if (s === "processing") setDtStatus("processing");
    else if (s === "failed") setDtStatus("failed");
    else if (s === "none") setDtStatus("none");
    if (d.groupId) setGroupId(d.groupId);
  }, []);

  // Initial status fetch when group exists
  useEffect(() => {
    if (initialGroupId) checkStatus();
  }, [initialGroupId, checkStatus]);

  // Poll every 20 s while training or awaiting consent
  useEffect(() => {
    if (dtStatus !== "processing" && dtStatus !== "pending_consent") return;
    const id = setInterval(checkStatus, 20_000);
    return () => clearInterval(id);
  }, [dtStatus, checkStatus]);

  async function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Please select a video file"); return; }
    if (file.size > 500 * 1024 * 1024) { toast.error("Video must be under 500 MB"); return; }

    setUploading(true);
    setUploadedUrl(null);
    try {
      const supabase = createClient();
      const ts = Date.now();
      const ext = file.name.split(".").pop() || "mp4";
      const filePath = `${userId}/camera-recordings/${ts}.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(filePath, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(filePath);
      setUploadedUrl(publicUrl);
      toast.success("Video uploaded — click Train Digital Twin to continue");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit() {
    let url = "";
    if (inputMode === "camera") url = selectedRec;
    else if (inputMode === "upload") url = uploadedUrl ?? "";
    else url = videoUrl;
    url = url.trim();
    if (!url) { toast.error("Please select or upload a video first"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/avatar/digital-twin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url, name: dtName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setGroupId(data.groupId);
      setDtStatus(data.status === "pending_consent" ? "pending_consent" : "processing");
      toast.success("Digital Twin training started!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create Digital Twin");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGetConsent() {
    if (!groupId) return;
    try {
      const res = await fetch("/api/avatar/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, reroute_url: window.location.href }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get consent URL");
    }
  }

  async function handleDelete() {
    if (!confirm("Remove your Digital Twin? This only clears the link in SparkReels — the avatar stays in HeyGen.")) return;
    await fetch("/api/avatar/digital-twin", { method: "DELETE" });
    setGroupId(null);
    setDtStatus("none");
    toast.success("Digital Twin removed");
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (dtStatus === "active") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle size={15} className="text-green-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">Digital Twin Active</p>
            <p className="text-xs text-green-600 mt-0.5">
              Your photorealistic AI avatar is ready — select it when creating Avatar + Voice videos.
            </p>
          </div>
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 shrink-0"
          >
            <Trash2 size={11} /> Remove
          </button>
        </div>
      </div>
    );
  }

  if (dtStatus === "pending_consent") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <CheckCircle size={15} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">Approval Required</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Your Digital Twin is trained! Click below to approve usage on HeyGen — required once.
            </p>
            <button
              onClick={handleGetConsent}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Approve My Digital Twin →
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400">After approving, come back — we'll activate automatically.</p>
        <button
          onClick={checkStatus}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 self-start"
        >
          <RefreshCw size={11} /> Refresh status
        </button>
      </div>
    );
  }

  if (dtStatus === "processing" || dtStatus === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Loader2 size={15} className="text-amber-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Training in progress…</p>
            <p className="text-xs text-amber-600 mt-0.5">
              HeyGen is building your Digital Twin. This usually takes 15–30 minutes.
            </p>
          </div>
        </div>
        <button
          onClick={checkStatus}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 self-start"
        >
          <RefreshCw size={11} /> Check status
        </button>
      </div>
    );
  }

  if (dtStatus === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-800">Training failed</p>
          <p className="text-xs text-red-600 mt-0.5">Use a clear well-lit video, then try again.</p>
        </div>
        <button
          onClick={() => { setDtStatus("none"); setGroupId(null); }}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 self-start"
        >
          Try again
        </button>
      </div>
    );
  }

  // "none" — create form
  const canSubmit =
    (inputMode === "camera" && !!selectedRec) ||
    (inputMode === "upload" && !!uploadedUrl) ||
    (inputMode === "url" && !!videoUrl.trim());

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500 leading-relaxed">
        Create a photorealistic AI version of yourself from a video of you speaking.
      </p>

      <Input
        label="Digital Twin Name"
        value={dtName}
        onChange={(e) => setDtName(e.target.value)}
        placeholder="My Digital Twin"
      />

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Video Source</label>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-3">
          {(["upload", "camera", "url"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setInputMode(mode)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                inputMode === mode
                  ? "bg-primary-600 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {mode === "upload" ? "Upload File" : mode === "camera" ? "In-App Recordings" : "Paste URL"}
            </button>
          ))}
        </div>

        {/* Upload from device */}
        {inputMode === "upload" && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-3 w-full p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={20} className="text-primary-500 animate-spin shrink-0" />
              ) : (
                <Upload size={20} className="text-slate-400 shrink-0" />
              )}
              <div className="text-left">
                <p className="text-sm font-medium text-slate-700">
                  {uploading ? "Uploading…" : uploadedUrl ? "Change video" : "Choose video file"}
                </p>
                <p className="text-xs text-slate-400">MP4, MOV, WebM · up to 500 MB</p>
              </div>
            </button>
            {uploadedUrl && !uploading && (
              <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle size={13} className="text-green-500 shrink-0" />
                <p className="text-xs text-green-700 font-medium">Video uploaded — ready to train</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.webm,.avi"
              className="hidden"
              onChange={handleVideoFileChange}
            />
          </div>
        )}

        {/* In-app camera recordings */}
        {inputMode === "camera" && recordings.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700">
              No in-app recordings found. Record a video using the Camera tab in the video creator, then come back here — or use <strong>Upload File</strong> to upload one from your device.
            </p>
          </div>
        )}
        {inputMode === "camera" && recordings.length > 0 && (
          <select
            value={selectedRec}
            onChange={(e) => setSelectedRec(e.target.value)}
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {recordings.map((r) => (
              <option key={r.id} value={r.video_url}>
                Recording — {new Date(r.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        )}

        {/* Paste URL */}
        {inputMode === "url" && (
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        )}
      </div>

      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <p className="text-xs text-blue-700 leading-relaxed flex items-start gap-1.5">
          <Sparkles size={11} className="text-blue-500 mt-0.5 shrink-0" />
          <span><strong>Tips:</strong> 1–3 minutes, good lighting, look at the camera, speak naturally. No sunglasses or hats.</span>
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        loading={submitting}
        disabled={!canSubmit || uploading}
        className="self-start"
      >
        Train Digital Twin
      </Button>
    </div>
  );
}

// ── Voice Clone uploader (record + upload) ───────────────────────────────────
export function VoiceCloneUploader({ userId, currentVoiceId, currentHeygenVoiceId, onUpdate }: {
  userId: string;
  currentVoiceId: string | null;
  currentHeygenVoiceId: string | null;
  onUpdate: (elevenLabsId: string | null, heygenId: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tab, setTab] = useState<"record" | "upload">("record");
  const [voiceId, setVoiceId] = useState(currentVoiceId);
  const [heygenVoiceId, setHeygenVoiceId] = useState(currentHeygenVoiceId);
  const [submitting, setSubmitting] = useState(false);
  const [sampleScript, setSampleScript] = useState(
    `Hi, my name is [your name] and I'm a real estate agent. I help buyers and sellers navigate the market with confidence. Whether you're looking for your first home, upgrading to something bigger, or selling to start a new chapter — I'm here to guide you every step of the way. With years of local market experience, I know how to get results for my clients. Let's find your perfect home together. Give me a call anytime — I'd love to help.`
  );

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
      // Primary: ElevenLabs voice clone — saves voice_clone_id to profile
      const elRes = await fetch("/api/profile/voice-clone", { method: "POST", body: form });
      const elText = await elRes.text();
      let elData: { voice_id?: string; error?: string } = {};
      try { elData = JSON.parse(elText); } catch {
        throw new Error(elRes.ok ? "Unexpected server response." : `Server error ${elRes.status}`);
      }
      if (!elRes.ok) throw new Error(elData.error || "Voice clone failed");
      if (!elData.voice_id) throw new Error("No voice ID returned from server.");

      // Secondary: HeyGen voice clone — best-effort, used as fallback
      const heygenForm = new FormData();
      heygenForm.append("audio", audioBlob, filename);
      heygenForm.append("name", "My Voice");
      let heygenId: string | null = null;
      try {
        const heyRes = await fetch("/api/profile/heygen-voice", { method: "POST", body: heygenForm });
        if (heyRes.ok) {
          const heyData = await heyRes.json() as { voice_id?: string };
          heygenId = heyData.voice_id ?? null;
        }
      } catch { /* HeyGen voice is optional */ }

      setVoiceId(elData.voice_id);
      setHeygenVoiceId(heygenId);
      onUpdate(elData.voice_id, heygenId);
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
    const elVoiceId = voiceId;
    setVoiceId(null);
    setHeygenVoiceId(null);
    onUpdate(null, null);
    // Remove from both providers best-effort
    if (elVoiceId) {
      fetch("/api/profile/voice-clone", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: elVoiceId }),
      }).catch(() => {});
    }
    fetch("/api/profile/heygen-voice", { method: "DELETE" }).catch(() => {});
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
            <p className="text-xs text-green-600 mt-0.5">
              Your cloned voice is ready for AI video generation.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => { setVoiceId(null); setHeygenVoiceId(null); setRecState("idle"); }}
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
                <Mic size={11} /> Script to read aloud — edit or replace with your own
              </p>
              <textarea
                value={sampleScript}
                onChange={(e) => setSampleScript(e.target.value)}
                rows={5}
                className="w-full text-xs text-amber-900 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
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
    full_name:        initial.full_name       || "",
    company_name:     initial.company_name    || "",
    phone:            initial.phone           || "",
    company_phone:    initial.company_phone   || "",
    company_address:  initial.company_address || "",
    avatar_url:       initial.avatar_url      || "",
    logo_url:         initial.logo_url        || "",
    voice_clone_id:   initial.voice_clone_id  || "",
    heygen_voice_id:  initial.heygen_voice_id || "",
    heygen_photo_id:  initial.heygen_photo_id || "",
    website:          initial.website         || "",
    license_number:   initial.license_number  || "",
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
        onboarding_done: true,
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
          <div className="sm:col-span-2">
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
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Avatar ────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Your Avatar</p>
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

          {/* Avatar looks — different outfits/backgrounds for the same avatar */}
          <AvatarLooksManager
            userId={userId}
            hasPhoto={!!fields.avatar_url}
            hasAvatar={!!fields.heygen_photo_id}
          />
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Digital Twin ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Digital Twin</p>
        <p className="text-xs text-slate-400 mb-4">
          A full-body AI replica trained from a video of you — more realistic than a talking photo.
        </p>
        <DigitalTwinCreator
          userId={userId}
          initialGroupId={initial.heygen_digital_twin_group_id ?? null}
          initialLookId={initial.heygen_digital_twin_look_id ?? null}
        />
      </div>

      <Button onClick={handleSave} loading={saving} className="self-start">
        Save Profile
      </Button>
    </div>
  );
}
