"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import toast from "react-hot-toast";
import {
  ArrowLeft, Wand2, Music2, Type, Palette, Monitor,
  ToggleLeft, ToggleRight, Loader2, CheckCircle, Upload,
  Play, Pause, Volume2, VolumeX, RefreshCw, Mic2, UserCircle2,
} from "lucide-react";
import Link from "next/link";
import type { RerenderEdits } from "@/app/api/video/rerender/route";

// ── Music presets ─────────────────────────────────────────────────────────────
const MUSIC_PRESETS = [
  { id: "none",       label: "No Music",          emoji: "🔇", url: null },
  { id: "calm",       label: "Calm Piano",         emoji: "🎹", url: "https://assets.mixkit.co/music/download/mixkit-soft-piano-ballad-1590.mp3" },
  { id: "corporate",  label: "Upbeat Corporate",   emoji: "💼", url: "https://assets.mixkit.co/music/download/mixkit-corporate-motivational-254.mp3" },
  { id: "inspiring",  label: "Inspiring",          emoji: "🌅", url: "https://assets.mixkit.co/music/download/mixkit-serene-view-443.mp3" },
  { id: "jazz",       label: "Smooth Jazz",        emoji: "🎷", url: "https://assets.mixkit.co/music/download/mixkit-smooth-jazz-ambient-loop-286.mp3" },
  { id: "motivate",   label: "Motivational",       emoji: "🔥", url: "https://assets.mixkit.co/music/download/mixkit-driving-ambition-32.mp3" },
  { id: "luxury",     label: "Luxury / Elegant",   emoji: "✨", url: "https://assets.mixkit.co/music/download/mixkit-cinematic-mystery-548.mp3" },
  { id: "custom",     label: "Upload my music",    emoji: "⬆️", url: "custom" },
];

const FORMAT_OPTIONS = [
  { value: "blog_long",    label: "Blog 16:9",      desc: "Landscape · YouTube · 1920×1080" },
  { value: "youtube_16x9", label: "YouTube Long",   desc: "Landscape · Extended · 1920×1080" },
  { value: "reel_9x16",    label: "Reel / Short",   desc: "Vertical · TikTok / Reels · 1080×1920" },
  { value: "short_1x1",    label: "Square",         desc: "1:1 · Feed posts · 1080×1080" },
] as const;

const CAPTION_COLORS = ["#FFFFFF", "#FFFF00", "#00FF88", "#FF6B6B", "#60A5FA", "#F472B6"];
const HIGHLIGHT_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

// Preset ElevenLabs voices (public, no clone needed)
const PRESET_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  desc: "Calm · Narration",   gender: "F" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    desc: "Deep · Confident",   gender: "M" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    desc: "Professional",        gender: "M" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   desc: "Soft · Friendly",    gender: "F" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",  desc: "Warm · Clear",        gender: "M" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",    desc: "Young · Energetic",  gender: "F" },
];

// Stock HeyGen avatars
const STOCK_AVATARS = [
  { id: "Abigail_expressive_2024112501", name: "Abigail", desc: "Professional · Female" },
  { id: "Tyler_public_expressive_20240528", name: "Tyler", desc: "Friendly · Male" },
  { id: "Monica_public_expressive_20240528", name: "Monica", desc: "Confident · Female" },
];

interface VideoData {
  id: string;
  video_url: string | null;
  video_type: string;
  render_status: string;
  project_id: string;
  projects: {
    title: string;
    ai_script: { script: string; title: string; hooks: string[] } | null;
  } | null;
}

interface Profile {
  voice_clone_id: string | null;
  heygen_photo_id: string | null;
  full_name: string | null;
  logo_url: string | null;
}

// ── Section accordion ─────────────────────────────────────────────────────────
function Section({ icon: Icon, title, color, children, defaultOpen = false }: {
  icon: React.ElementType; title: string; color: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding="sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 w-full py-1 px-1 text-left"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={14} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-brand-text flex-1">{title}</span>
        <RefreshCw size={13} className={`text-slate-300 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VideoEditorPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const router = useRouter();
  const musicInputRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<VideoData | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [renderDone, setRenderDone] = useState(false);
  const [muted, setMuted] = useState(true);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  // ── Editor state ──────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<RerenderEdits>({
    script: "",
    title: "",
    format: "blog_long",
    brandColor: "#6366F1",
    logoEnabled: true,
    avatarId: null,
    voiceId: null,
    captionsEnabled: true,
    captionColor: "#FFFFFF",
    captionHighlightColor: "#3B82F6",
    musicUrl: null,
  });
  const [selectedMusicId, setSelectedMusicId] = useState("none");

  useEffect(() => {
    loadVideo();
  }, [videoId]); // eslint-disable-line

  async function loadVideo() {
    const supabase = createClient();
    const [{ data, error }, { data: { user } }] = await Promise.all([
      supabase
        .from("generated_videos")
        .select("*, projects(title, ai_script)")
        .eq("id", videoId)
        .single(),
      supabase.auth.getUser(),
    ]);

    if (error || !data) {
      toast.error("Video not found");
      router.push("/videos");
      return;
    }

    const v = data as unknown as VideoData;
    setVideo(v);
    setEdits((e) => ({
      ...e,
      script: v.projects?.ai_script?.script || "",
      title: v.projects?.title || "",
      format: (v.video_type as RerenderEdits["format"]) || "blog_long",
    }));

    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("voice_clone_id, heygen_photo_id, full_name, logo_url")
        .eq("id", user.id)
        .single();
      if (prof) {
        setProfile(prof as Profile);
        // Default to user's cloned voice if they have one
        if (prof.voice_clone_id) {
          setEdits((e) => ({ ...e, voiceId: prof.voice_clone_id }));
        }
      }
    }

    setLoading(false);
  }

  async function handleMusicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|ogg)$/i)) {
      toast.error("Please upload an audio file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Music file must be under 20MB");
      return;
    }
    setUploadingMusic(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const ext = file.name.split(".").pop();
    const path = `${user?.id}/music-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploadingMusic(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
    setEdits((e) => ({ ...e, musicUrl: publicUrl }));
    toast.success("Music uploaded!");
    setUploadingMusic(false);
  }

  function selectMusic(preset: typeof MUSIC_PRESETS[0]) {
    if (preset.id === "custom") {
      musicInputRef.current?.click();
      return;
    }
    setSelectedMusicId(preset.id);
    setEdits((e) => ({ ...e, musicUrl: preset.url }));
  }

  async function handleRerender() {
    if (!edits.script.trim()) { toast.error("Script cannot be empty"); return; }
    setRendering(true);
    setRenderDone(false);
    try {
      const res = await fetch("/api/video/rerender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, edits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-render failed");
      setRenderDone(true);
      toast.success("Re-rendering! Check My Videos in a few minutes.");
      setTimeout(() => router.push(`/videos?highlight=${data.video.id}`), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-render failed");
    } finally {
      setRendering(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex flex-col items-center py-24 gap-4">
        <Loader2 size={32} className="animate-spin text-primary-500" />
        <p className="text-slate-500 text-sm">Loading editor…</p>
      </div>
    );
  }

  if (!video) return null;

  const wordCount = edits.script.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/videos">
          <button className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-slate-400" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-brand-text truncate">{edits.title || "Video Editor"}</h2>
          <p className="text-xs text-slate-400 mt-0.5">Edit and re-render your video</p>
        </div>
        <Button
          onClick={handleRerender}
          loading={rendering}
          disabled={renderDone}
          size="lg"
          className="gap-2 shrink-0"
        >
          {renderDone
            ? <><CheckCircle size={16} /> Done!</>
            : <><Wand2 size={16} /> Re-render Video</>}
        </Button>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

        {/* ── Left: Video player ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card padding="none" className="overflow-hidden">
            {video.video_url ? (
              <div className="relative bg-black group">
                <video
                  src={video.video_url}
                  className="w-full block max-h-[480px] object-contain"
                  autoPlay
                  loop
                  muted={muted}
                  playsInline
                />
                {/* Mute toggle */}
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="absolute bottom-3 right-3 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                {rendering && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="animate-spin text-white" />
                    <p className="text-white font-medium text-sm">Re-rendering…</p>
                    <p className="text-white/60 text-xs">This takes 2–5 minutes</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 h-64 flex items-center justify-center">
                <p className="text-slate-500 text-sm">No video preview available</p>
              </div>
            )}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Current format: <span className="font-medium text-slate-700">{
                  FORMAT_OPTIONS.find(f => f.value === video.video_type)?.label || video.video_type
                }</span>
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                video.render_status === "completed"
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-500"
              }`}>
                {video.render_status}
              </span>
            </div>
          </Card>

          {/* Re-render notice */}
          <div className="p-3 bg-primary-50 border border-primary-100 rounded-xl">
            <p className="text-xs text-primary-700 leading-relaxed">
              <strong>How it works:</strong> Make your edits on the right, then click
              <strong> Re-render Video</strong>. A new version is created — your original is preserved.
              Rendering takes 2–5 minutes and will appear in My Videos.
            </p>
          </div>
        </div>

        {/* ── Right: Editor controls ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Script */}
          <Section icon={Type} title="Script & Title" color="bg-primary-500" defaultOpen>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">Video Title</label>
                <input
                  type="text"
                  value={edits.title}
                  onChange={(e) => setEdits((x) => ({ ...x, title: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-500">Voiceover Script</label>
                  <span className="text-xs text-slate-400">{wordCount} words · ~{Math.round(wordCount / 130)}min</span>
                </div>
                <textarea
                  value={edits.script}
                  onChange={(e) => setEdits((x) => ({ ...x, script: e.target.value }))}
                  rows={8}
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
                />
              </div>
            </div>
          </Section>

          {/* Format */}
          <Section icon={Monitor} title="Format" color="bg-slate-500">
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setEdits((x) => ({ ...x, format: f.value }))}
                  className={`text-left p-2.5 rounded-xl border-2 transition-all ${
                    edits.format === f.value
                      ? "border-primary-500 bg-primary-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs font-semibold text-brand-text">{f.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{f.desc}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* Music */}
          <Section icon={Music2} title="Background Music" color="bg-violet-500">
            <div className="grid grid-cols-2 gap-1.5">
              {MUSIC_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => selectMusic(preset)}
                  disabled={uploadingMusic && preset.id === "custom"}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all text-sm ${
                    selectedMusicId === preset.id && preset.id !== "custom"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 hover:border-slate-300 text-slate-600"
                  }`}
                >
                  <span className="text-base">{preset.emoji}</span>
                  <span className="text-xs font-medium truncate">{
                    preset.id === "custom" && uploadingMusic ? "Uploading…" : preset.label
                  }</span>
                </button>
              ))}
            </div>
            {edits.musicUrl && selectedMusicId !== "none" && (
              <p className="text-xs text-violet-600 mt-2 flex items-center gap-1">
                <CheckCircle size={11} /> Music selected · plays at 15% volume under voiceover
              </p>
            )}
            <input
              ref={musicInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a"
              className="hidden"
              onChange={handleMusicUpload}
            />
          </Section>

          {/* Captions */}
          <Section icon={Type} title="Captions" color="bg-teal-500">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Show captions</p>
                  <p className="text-xs text-slate-400">Word-by-word karaoke style</p>
                </div>
                <button onClick={() => setEdits((x) => ({ ...x, captionsEnabled: !x.captionsEnabled }))}>
                  {edits.captionsEnabled
                    ? <ToggleRight size={28} className="text-teal-500" />
                    : <ToggleLeft size={28} className="text-slate-300" />}
                </button>
              </div>

              {edits.captionsEnabled && (
                <>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Caption color</p>
                    <div className="flex gap-2">
                      {CAPTION_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEdits((x) => ({ ...x, captionColor: c }))}
                          style={{ backgroundColor: c }}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${
                            edits.captionColor === c ? "border-slate-600 scale-110" : "border-transparent"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Highlight color</p>
                    <div className="flex gap-2">
                      {HIGHLIGHT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEdits((x) => ({ ...x, captionHighlightColor: c }))}
                          style={{ backgroundColor: c }}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${
                            edits.captionHighlightColor === c ? "border-slate-600 scale-110" : "border-transparent"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* Voice */}
          <Section icon={Mic2} title="Voice" color="bg-blue-500">
            <div className="flex flex-col gap-2">
              {profile?.voice_clone_id && (
                <>
                  <p className="text-xs font-medium text-slate-500 mb-1">Your cloned voice</p>
                  <button
                    onClick={() => setEdits((x) => ({ ...x, voiceId: profile.voice_clone_id }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      edits.voiceId === profile.voice_clone_id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Mic2 size={14} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-brand-text">
                        {profile.full_name ? `${profile.full_name}'s Voice` : "My Cloned Voice"}
                      </p>
                      <p className="text-xs text-slate-400">Trained on your voice sample</p>
                    </div>
                    {edits.voiceId === profile.voice_clone_id && (
                      <CheckCircle size={14} className="text-blue-500 ml-auto shrink-0" />
                    )}
                  </button>
                  <p className="text-xs font-medium text-slate-500 mt-2 mb-1">Or choose a preset voice</p>
                </>
              )}
              {!profile?.voice_clone_id && (
                <p className="text-xs font-medium text-slate-500 mb-1">Choose a voice</p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setEdits((x) => ({ ...x, voiceId: v.id }))}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all ${
                      edits.voiceId === v.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-base">{v.gender === "F" ? "👩" : "👨"}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-brand-text">{v.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{v.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Avatar */}
          <Section icon={UserCircle2} title="AI Avatar" color="bg-orange-500">
            <div className="flex flex-col gap-2">
              {/* No avatar option */}
              <button
                onClick={() => setEdits((x) => ({ ...x, avatarId: null }))}
                className={`flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition-all ${
                  edits.avatarId === null
                    ? "border-orange-400 bg-orange-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="text-lg">🚫</span>
                <div>
                  <p className="text-xs font-semibold text-brand-text">No Avatar</p>
                  <p className="text-[11px] text-slate-400">Voiceover only</p>
                </div>
                {edits.avatarId === null && <CheckCircle size={13} className="text-orange-400 ml-auto shrink-0" />}
              </button>

              {/* User's custom avatar */}
              {profile?.heygen_photo_id && (
                <>
                  <p className="text-xs font-medium text-slate-500 mt-1">Your avatar</p>
                  <button
                    onClick={() => setEdits((x) => ({ ...x, avatarId: profile.heygen_photo_id }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      edits.avatarId === profile.heygen_photo_id
                        ? "border-orange-400 bg-orange-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                      <UserCircle2 size={14} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-brand-text">
                        {profile.full_name ? `${profile.full_name}` : "My Avatar"}
                      </p>
                      <p className="text-xs text-slate-400">Your AI avatar</p>
                    </div>
                    {edits.avatarId === profile.heygen_photo_id && (
                      <CheckCircle size={14} className="text-orange-400 ml-auto shrink-0" />
                    )}
                  </button>
                </>
              )}

              {/* Stock avatars */}
              <p className="text-xs font-medium text-slate-500 mt-1">Stock avatars</p>
              {STOCK_AVATARS.map((av) => (
                <button
                  key={av.id}
                  onClick={() => setEdits((x) => ({ ...x, avatarId: av.id }))}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition-all ${
                    edits.avatarId === av.id
                      ? "border-orange-400 bg-orange-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="text-lg">🧑‍💼</span>
                  <div>
                    <p className="text-xs font-semibold text-brand-text">{av.name}</p>
                    <p className="text-[11px] text-slate-400">{av.desc}</p>
                  </div>
                  {edits.avatarId === av.id && <CheckCircle size={13} className="text-orange-400 ml-auto shrink-0" />}
                </button>
              ))}

              {!profile?.heygen_photo_id && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Upload your photo in{" "}
                  <a href="/settings" className="text-primary-500 underline">Settings → Brand Profile</a>{" "}
                  to create your personal avatar.
                </p>
              )}
            </div>
          </Section>

          {/* Branding */}
          <Section icon={Palette} title="Branding" color="bg-pink-500">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Brand color</p>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={edits.brandColor}
                    onChange={(e) => setEdits((x) => ({ ...x, brandColor: e.target.value }))}
                    className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={edits.brandColor}
                    onChange={(e) => setEdits((x) => ({ ...x, brandColor: e.target.value }))}
                    className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Show logo watermark</p>
                  <p className="text-xs text-slate-400">Uses your brokerage logo from profile</p>
                </div>
                <button onClick={() => setEdits((x) => ({ ...x, logoEnabled: !x.logoEnabled }))}>
                  {edits.logoEnabled
                    ? <ToggleRight size={24} className="text-primary-500" />
                    : <ToggleLeft size={24} className="text-slate-300" />}
                </button>
              </div>
            </div>
          </Section>

          {/* Re-render CTA at bottom */}
          <Button
            onClick={handleRerender}
            loading={rendering}
            disabled={renderDone}
            size="lg"
            className="w-full gap-2 mt-1"
          >
            {renderDone
              ? <><CheckCircle size={16} /> Render queued — check My Videos</>
              : <><Wand2 size={16} /> Re-render with These Changes</>}
          </Button>
          <p className="text-xs text-slate-400 text-center">
            Original video is preserved · New version appears in My Videos
          </p>
        </div>
      </div>
    </div>
  );
}
