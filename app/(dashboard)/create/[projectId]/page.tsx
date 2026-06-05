"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Sparkles, FileText, Search, Video, RefreshCw,
  Copy, ChevronDown, ChevronUp, Loader2, CheckCircle, Wand2,
  User, Square, Camera, Settings,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/** Safely parse JSON from a fetch Response — returns null if the body is HTML/empty */
async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return null;
  try { return JSON.parse(text); } catch { return null; }
}

interface AvatarLook {
  id: string;
  name: string;
  preview_image_url: string | null;
  status: string | null;
}

type ProjectStatus = "draft" | "generating" | "ready" | "posted" | "error";

interface AiScript {
  title: string;
  hook: string;
  hooks: string[];
  script: string;
  cta: string;
  description: string;
  hashtags: string[];
  keywords: string[];
  blog_intro: string;
  blog_body: string;
  blog_conclusion: string;
}

interface SeoData {
  title: string;
  meta_description: string;
  slug: string;
  keywords: string[];
  hashtags: string[];
  youtube_title: string;
  youtube_description: string;
  instagram_caption: string;
  linkedin_post?: string;
  email_blurb?: string;
}

interface Project {
  id: string;
  title: string;
  project_type: string;
  status: ProjectStatus;
  voice_recording_id: string | null;
  ai_script: AiScript | null;
  seo_data: SeoData | null;
  thumbnail_url: string | null;
  created_at: string;
}

type VideoType = "blog_long" | "reel_9x16" | "short_1x1" | "youtube_16x9";

const videoTypes: { value: VideoType; label: string; desc: string }[] = [
  { value: "youtube_16x9", label: "YouTube / Blog", desc: "Landscape 16:9, ~2 min" },
  { value: "reel_9x16", label: "Reel / TikTok / Short", desc: "Vertical 9:16, ~1 min" },
];

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [selectedVideoType, setSelectedVideoType] = useState<VideoType>("youtube_16x9");
  const [looks, setLooks] = useState<AvatarLook[]>([]);
  const [looksLoading, setLooksLoading] = useState(false);
  const [selectedLookId, setSelectedLookId] = useState<string>("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    script: true, seo: false, blog: false,
  });
  const [editedScript, setEditedScript] = useState("");
  const [editedCta, setEditedCta] = useState("");
  const [selectedHook, setSelectedHook] = useState<string>("");
  const [contactInfo, setContactInfo] = useState<{
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    company_address: string | null;
  } | null>(null);

  // Teleprompter
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [tpAutoScroll, setTpAutoScroll] = useState(false);
  const [tpSpeed, setTpSpeed] = useState(2.5);
  const [tpRecording, setTpRecording] = useState(false);
  const [tpUploading, setTpUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);

  // If coming from /create with a recordingId, generate script automatically
  const source = searchParams.get("source");

  useEffect(() => {
    loadProject();
    loadProfile();
    loadLooks();
  }, [projectId]); // eslint-disable-line

  async function loadLooks() {
    setLooksLoading(true);
    try {
      const res = await fetch("/api/avatar/looks");
      if (res.ok) {
        const data = await res.json();
        const list: AvatarLook[] = (data.looks || []).filter(
          (l: AvatarLook) => !l.status || l.status === "completed"
        );
        setLooks(list);
        if (list.length > 0) setSelectedLookId(list[0].id);
      }
    } catch {
      // silently ignore — look picker just won't appear
    } finally {
      setLooksLoading(false);
    }
  }

  async function loadProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, company_name, phone, company_phone, company_address")
      .eq("id", user.id)
      .single();
    if (data) setContactInfo(data as typeof contactInfo);
  }

  async function loadProject() {
    setLoading(true);
    const supabase = createClient();

    // projectId might be a recording ID if source=recording
    if (source === "recording") {
      // Generate script from recording
      setLoading(false);
      await generateScript(projectId);
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      toast.error("Project not found");
      router.push("/dashboard");
      return;
    }

    const p = data as unknown as Project;
    setProject(p);
    if (p.ai_script) {
      setEditedScript((p.ai_script as AiScript).script || "");
      setEditedCta((p.ai_script as AiScript).cta || "");
      const hooks = (p.ai_script as AiScript).hooks;
      setSelectedHook(hooks?.length ? hooks[0] : (p.ai_script as AiScript).hook || "");
    }
    setLoading(false);
  }

  async function generateScript(recordingId: string) {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId, projectType: "blog_video" }),
      });

      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error((err?.error as string) || `Script generation failed (${res.status})`);
      }

      const body = await safeJson(res);
      if (!body?.project) throw new Error("Invalid response from script generator");
      const { project: newProject } = body as { project: Project };
      const p = newProject as Project;
      setProject(p);
      if (p.ai_script) {
        setEditedScript((p.ai_script as AiScript).script || "");
        setEditedCta((p.ai_script as AiScript).cta || "");
        const hooks = (p.ai_script as AiScript).hooks;
        setSelectedHook(hooks?.length ? hooks[0] : (p.ai_script as AiScript).hook || "");
      }
      // Update URL to the new project ID
      router.replace(`/create/${p.id}`);
      toast.success("Script generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
      router.push("/create");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerateScript() {
    if (!project?.voice_recording_id) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: project.voice_recording_id, projectType: project.project_type }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error((err?.error as string) || `Regeneration failed (${res.status})`);
      }
      const body = await safeJson(res);
      if (!body) throw new Error("Invalid response from regenerate");
      const { aiScript, seoData } = body as { aiScript: AiScript; seoData: SeoData };
      setProject((p) => p ? { ...p, ai_script: aiScript, seo_data: seoData } : p);
      setEditedScript(aiScript.script);
      setEditedCta(aiScript.cta || "");
      setSelectedHook(aiScript.hooks?.length ? aiScript.hooks[0] : aiScript.hook || "");
      toast.success("Script regenerated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateVideo() {
    if (!project) return;
    setVideoGenerating(true);

    // create-blog handles all videoTypes (blog_long, reel_9x16, short_1x1, youtube_16x9)
    const endpoint = "/api/video/create-blog";

    try {
      // Build the full video script: hook → body → CTA + contact info
      const bodyScript = editedScript || project.ai_script?.script || "";
      const hook = selectedHook || project.ai_script?.hook || "";
      const cta = editedCta || (project.ai_script as AiScript | null)?.cta || "";
      const contactLine = cta ? buildContactLine() : "";
      const ctaWithContact = [cta, contactLine].filter(Boolean).join("\n");
      const fullScript = [hook, bodyScript, ctaWithContact].filter(Boolean).join("\n\n");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          videoType: selectedVideoType,
          backgroundMode: "stock-video",
          script: fullScript,
          hook,
          lookId: selectedLookId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error((err?.error as string) || `Video generation failed (${res.status})`);
      }

      const body = await safeJson(res);
      if (!body?.video) throw new Error("Invalid response from video generator");
      const { video } = body as { video: { id: string; render_status?: string } };
      if (video.render_status === "completed") {
        toast.success("Video ready! Redirecting to preview...", { duration: 3000 });
      } else {
        toast.success("Video is rendering. You'll see it in My Videos shortly.", { duration: 5000 });
      }
      router.push(`/videos?highlight=${video.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start video generation");
    } finally {
      setVideoGenerating(false);
    }
  }

  function buildContactLine(): string {
    if (!contactInfo) return "";
    const parts: string[] = [];
    if (contactInfo.full_name) parts.push(contactInfo.full_name);
    if (contactInfo.company_name) parts.push(contactInfo.company_name);
    const phones = Array.from(new Set([contactInfo.phone, contactInfo.company_phone].filter(Boolean)));
    phones.forEach((p) => parts.push(p as string));
    if (contactInfo.company_address) parts.push(contactInfo.company_address);
    return parts.join(" · ");
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  function toggle(section: string) {
    setExpandedSections((p) => ({ ...p, [section]: !p[section] }));
  }

  // ── Teleprompter ────────────────────────────────────────────────
  useEffect(() => {
    if (!showTeleprompter || !tpAutoScroll) {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    let lastTime: number | null = null;
    function step(time: number) {
      if (!lastTime) lastTime = time;
      const delta = time - lastTime;
      lastTime = time;
      if (container) container.scrollTop += (tpSpeed * delta) / 600;
      scrollAnimRef.current = requestAnimationFrame(step);
    }
    scrollAnimRef.current = requestAnimationFrame(step);
    return () => { if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current); };
  }, [showTeleprompter, tpAutoScroll, tpSpeed]);

  // Attach camera stream once the overlay is in the DOM
  useEffect(() => {
    if (!showTeleprompter || !cameraStreamRef.current) return;
    const video = cameraVideoRef.current;
    if (video) {
      video.srcObject = cameraStreamRef.current;
      video.play().catch(() => {});
    }
  }, [showTeleprompter]);

  async function openTeleprompter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStreamRef.current = stream;
      setShowTeleprompter(true);
    } catch {
      toast.error("Camera / microphone access is required for teleprompter recording");
    }
  }

  function closeTeleprompter() {
    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setTpAutoScroll(false);
    setTpRecording(false);
    setShowTeleprompter(false);
  }

  function startTpRecording() {
    if (!cameraStreamRef.current) return;
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const mr = new MediaRecorder(cameraStreamRef.current, { mimeType });
    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = handleTpRecordingDone;
    mr.start(500);
    mediaRecorderRef.current = mr;
    setTpRecording(true);
  }

  function stopTpRecording() {
    mediaRecorderRef.current?.stop();
    setTpRecording(false);
  }

  async function handleTpRecordingDone() {
    const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
    setTpUploading(true);
    try {
      const formData = new FormData();
      formData.append("video", blob, "teleprompter-recording.webm");
      formData.append("projectId", projectId);
      formData.append("videoType", selectedVideoType);
      formData.append("title", `Teleprompter: ${project?.title ?? "Recording"}`);
      const res = await fetch("/api/video/save-camera-recording", { method: "POST", body: formData });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Upload failed");
      const { video } = body as { video: { id: string } };
      closeTeleprompter();
      toast.success("Recording saved! No AI charges — your video is ready.");
      router.push(`/videos?highlight=${video.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setTpUploading(false);
    }
  }

  // Loading / generating states
  if (loading || generating) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/create"><ArrowLeft size={20} className="text-slate-400 hover:text-brand-text" /></Link>
          <Skeleton className="h-7 w-48" />
        </div>
        <Card className="flex flex-col items-center py-16 gap-4 text-center">
          <div className="w-16 h-16 bg-secondary-500/10 rounded-2xl flex items-center justify-center">
            <Wand2 className="w-8 h-8 text-secondary-500 animate-pulse" />
          </div>
          <div>
            <p className="font-semibold text-brand-text text-lg">
              {generating ? "Generating your script with AI..." : "Loading project..."}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {generating ? "AI is crafting your script, hooks, SEO data, and blog content…" : ""}
            </p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-secondary-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          {generating && (
            <div className="grid grid-cols-3 gap-3 w-full mt-4 px-4">
              {["Analyzing transcript", "Writing script", "Generating SEO"].map((t) => (
                <div key={t} className="bg-slate-50 rounded-xl p-3 text-center">
                  <Loader2 size={16} className="text-secondary-500 animate-spin mx-auto mb-1" />
                  <p className="text-xs text-slate-500">{t}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (!project) return null;

  const script = project.ai_script as AiScript | null;

  // ── Paste source: minimal format + avatar picker before generating ────────
  if (source === "paste" && !videoGenerating) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/create">
            <button className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
              <ArrowLeft size={18} className="text-slate-400" />
            </button>
          </Link>
          <div>
            <h2 className="text-lg font-bold text-brand-text leading-tight">{project.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{(script?.script || "").trim().split(/\s+/).length} words · ready to generate</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Video format */}
          <Card>
            <p className="text-sm font-semibold text-brand-text mb-3">Video Format</p>
            <div className="grid grid-cols-2 gap-2">
              {videoTypes.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setSelectedVideoType(value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    selectedVideoType === value
                      ? "border-primary-500 bg-primary-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-medium text-brand-text">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Avatar look */}
          {(looksLoading || looks.length > 0) && (
            <Card>
              <p className="text-sm font-semibold text-brand-text mb-3">Choose Your Avatar</p>
              {looksLoading ? (
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-20 h-24 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {looks.map((look) => (
                    <button
                      key={look.id}
                      onClick={() => setSelectedLookId(look.id)}
                      title={look.name}
                      className={`relative rounded-xl border-2 overflow-hidden transition-all shrink-0 ${
                        selectedLookId === look.id
                          ? "border-primary-500 ring-2 ring-primary-200"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      style={{ width: 72, height: 88 }}
                    >
                      {look.preview_image_url ? (
                        <img src={look.preview_image_url} alt={look.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                          <User size={24} className="text-slate-300" />
                        </div>
                      )}
                      {selectedLookId === look.id && (
                        <div className="absolute bottom-1 right-1 bg-primary-500 rounded-full p-0.5">
                          <CheckCircle size={10} className="text-white" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1">
                        <p className="text-white text-[9px] leading-tight truncate">{look.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Editable script */}
          <Card>
            <p className="text-sm font-semibold text-brand-text mb-2">
              Script
              <span className="ml-2 text-xs font-normal text-slate-400">{editedScript.trim().split(/\s+/).filter(Boolean).length} words</span>
            </p>
            <textarea
              value={editedScript}
              onChange={(e) => setEditedScript(e.target.value)}
              rows={8}
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1">Edit before generating — your changes will be used.</p>
          </Card>

          {/* Editable CTA */}
          <Card>
            <p className="text-sm font-semibold text-brand-text mb-2">Call To Action</p>
            <textarea
              value={editedCta}
              onChange={(e) => setEditedCta(e.target.value)}
              rows={3}
              placeholder="e.g. Call or text me to get started — I'd love to help!"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1">Spoken at the end of your video. Leave blank to skip.</p>
          </Card>

          {/* Generate button */}
          <Button
            onClick={handleGenerateVideo}
            loading={videoGenerating}
            size="lg"
            className="w-full gap-2"
          >
            <Wand2 size={18} /> Generate {videoTypes.find((v) => v.value === selectedVideoType)?.label}
          </Button>
          <p className="text-xs text-slate-400 text-center -mt-2">
            Video ready in 5–8 minutes · you&apos;ll see it in My Videos
          </p>
        </div>
      </div>
    );
  }

  // ── Paste source: generating spinner ─────────────────────────────────────
  if (source === "paste" && videoGenerating) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="flex flex-col items-center py-16 gap-4 text-center">
          <div className="w-16 h-16 bg-primary-500/10 rounded-2xl flex items-center justify-center">
            <Wand2 className="w-8 h-8 text-primary-500 animate-pulse" />
          </div>
          <div>
            <p className="font-semibold text-brand-text text-lg">Generating Your Video…</p>
            <p className="text-slate-400 text-sm mt-1">This takes 5–8 minutes. You&apos;ll see it in My Videos when ready.</p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </Card>
      </div>
    );
  }
  const seo = project.seo_data as SeoData | null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Link href="/create">
            <button className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors mt-0.5">
              <ArrowLeft size={18} className="text-slate-400" />
            </button>
          </Link>
          <div>
            <h2 className="text-xl font-bold text-brand-text leading-tight">{project.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={project.status === "ready" ? "success" : project.status === "error" ? "error" : "default"}>
                {project.status}
              </Badge>
              <span className="text-xs text-slate-400">{project.project_type.replace("_", " ")}</span>
            </div>
          </div>
        </div>
        {project.voice_recording_id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerateScript}
            loading={generating}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw size={14} /> Regenerate
          </Button>
        )}
      </div>

      {script ? (
        <div className="flex flex-col gap-4">
          {/* Hook options */}
          <Card padding="sm">
            <div className="flex items-center gap-2 px-2 py-1 mb-3">
              <Sparkles size={16} className="text-secondary-500" />
              <h3 className="font-semibold text-sm text-brand-text">Hook Options</h3>
              <span className="text-xs text-slate-400 ml-auto">Tap to select · used to open your video</span>
            </div>
            <div className="flex flex-col gap-2">
              {(script.hooks?.length ? script.hooks : [script.hook]).map((hook, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedHook(hook)}
                  className={`flex items-start gap-3 w-full text-left rounded-xl px-3 py-2.5 border-2 transition-all group ${
                    selectedHook === hook
                      ? "border-primary-500 bg-primary-50"
                      : "bg-slate-50 border-transparent hover:border-slate-200"
                  }`}
                >
                  <span className={`text-xs font-bold mt-0.5 shrink-0 ${selectedHook === hook ? "text-primary-500" : "text-slate-400"}`}>
                    #{i + 1}
                  </span>
                  <p className="text-sm text-slate-700 flex-1 leading-relaxed">{hook}</p>
                  {selectedHook === hook ? (
                    <CheckCircle size={15} className="text-primary-500 mt-0.5 shrink-0" />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(hook, "Hook"); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 shrink-0"
                    >
                      <Copy size={13} className="text-slate-400" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* Script (editable) */}
          <Card padding="sm">
            <button
              onClick={() => toggle("script")}
              className="flex items-center justify-between w-full px-2 py-1 mb-2"
            >
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary-500" />
                <h3 className="font-semibold text-sm text-brand-text">Video Script</h3>
                <Badge variant="info" className="text-xs">{editedScript.split(" ").length} words</Badge>
              </div>
              {expandedSections.script ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>
            {expandedSections.script && (
              <>
                <textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  className="w-full text-sm text-slate-700 bg-slate-50 rounded-xl p-4 min-h-48 resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 border border-slate-100"
                />
                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="text-xs text-slate-400">Edit freely — your changes are saved when you generate the video</p>
                  <button onClick={() => copyToClipboard(editedScript, "Script")} className="text-xs text-primary-500 flex items-center gap-1 hover:underline">
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </>
            )}
          </Card>

          {/* CTA */}
          <Card padding="sm">
            <div className="flex items-center justify-between px-2 py-1 mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-accent-500" />
                <h3 className="font-semibold text-sm text-brand-text">Call to Action</h3>
              </div>
              <button
                onClick={() => {
                  const contactLine = buildContactLine();
                  const full = contactLine ? `${editedCta}\n\n${contactLine}` : editedCta;
                  copyToClipboard(full, "CTA");
                }}
                className="flex items-center gap-1 text-xs text-primary-500 hover:underline"
              >
                <Copy size={12} /> Copy with contact
              </button>
            </div>
            <textarea
              value={editedCta}
              onChange={(e) => setEditedCta(e.target.value)}
              rows={3}
              placeholder="e.g. Call or text me to get started — I'd love to help!"
              className="w-full text-sm text-slate-700 bg-slate-50 rounded-xl p-4 resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent-500 border border-slate-100"
            />
            {buildContactLine() ? (
              <div className="flex items-center justify-between gap-2 mt-2 px-1">
                <p className="text-xs text-slate-500 font-medium">{buildContactLine()}</p>
                <button
                  onClick={() => copyToClipboard(buildContactLine(), "Contact info")}
                  className="shrink-0"
                  title="Copy contact info"
                >
                  <Copy size={12} className="text-slate-400 hover:text-slate-600" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mt-2 px-1">
                Add your name, phone & address in{" "}
                <a href="/settings" className="text-primary-500 hover:underline">Settings</a>{" "}
                to auto-append contact info here.
              </p>
            )}
          </Card>

          {/* Settings nudge */}
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Settings size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                If not done already,{" "}
                <a href="/settings" className="underline hover:text-amber-700 font-semibold">add your photos and voice in Settings</a>
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your avatar photo and voice clone are used to personalize your AI-generated videos.
              </p>
            </div>
          </div>

          {/* Generate video */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Video size={18} className="text-primary-500" />
              <h3 className="font-semibold text-brand-text">Generate Video</h3>
            </div>

            {/* Video format selector */}
            <p className="text-xs font-medium text-slate-500 mb-2">Video Format</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {videoTypes.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setSelectedVideoType(value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    selectedVideoType === value
                      ? "border-primary-500 bg-primary-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-medium text-brand-text">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>


            {/* Avatar look selector */}
            {(looksLoading || looks.length > 1) && (
              <>
                <p className="text-xs font-medium text-slate-500 mb-2">Avatar Look</p>
                {looksLoading ? (
                  <div className="flex gap-2 mb-5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-20 h-24 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2 mb-5 flex-wrap">
                    {looks.map((look) => (
                      <button
                        key={look.id}
                        onClick={() => setSelectedLookId(look.id)}
                        title={look.name}
                        className={`relative rounded-xl border-2 overflow-hidden transition-all shrink-0 ${
                          selectedLookId === look.id
                            ? "border-primary-500 ring-2 ring-primary-200"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                        style={{ width: 72, height: 88 }}
                      >
                        {look.preview_image_url ? (
                          <img
                            src={look.preview_image_url}
                            alt={look.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                            <User size={24} className="text-slate-300" />
                          </div>
                        )}
                        {selectedLookId === look.id && (
                          <div className="absolute bottom-1 right-1 bg-primary-500 rounded-full p-0.5">
                            <CheckCircle size={10} className="text-white" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1">
                          <p className="text-white text-[9px] leading-tight truncate">{look.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleGenerateVideo}
                loading={videoGenerating}
                size="lg"
                className="flex-1 gap-2"
              >
                <Wand2 size={18} /> Generate {videoTypes.find((v) => v.value === selectedVideoType)?.label}
              </Button>
              <button
                type="button"
                onClick={openTeleprompter}
                className="flex items-center justify-center px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-medium transition-colors shrink-0"
              >
                Or record yourself on camera reading the script
              </button>
            </div>
            <p className="text-xs text-slate-400 text-center mt-2">
              AI video generation takes 5 to 8 min. You&apos;ll see it in My Videos when ready.
            </p>
          </Card>

          {/* Social Content Pack */}
          {seo && (
            <Card padding="sm">
              <button
                onClick={() => toggle("seo")}
                className="flex items-center justify-between w-full px-2 py-1 mb-2"
              >
                <div className="flex items-center gap-2">
                  <Search size={16} className="text-secondary-500" />
                  <h3 className="font-semibold text-sm text-brand-text">Social Content Pack</h3>
                  <span className="text-[10px] font-semibold bg-secondary-100 text-secondary-600 px-1.5 py-0.5 rounded-full">AI-generated</span>
                </div>
                {expandedSections.seo ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              {expandedSections.seo && (
                <div className="flex flex-col gap-3 px-2">
                  {[
                    { label: "YouTube Title", value: seo.youtube_title },
                    { label: "Instagram Caption", value: seo.instagram_caption },
                    ...(seo.linkedin_post ? [{ label: "LinkedIn Post", value: seo.linkedin_post }] : []),
                    ...(seo.email_blurb ? [{ label: "Email Newsletter Blurb", value: seo.email_blurb }] : []),
                    { label: "Meta Description", value: seo.meta_description },
                    { label: "URL Slug", value: seo.slug },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
                      <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 flex items-start justify-between gap-2">
                        <span className="flex-1 leading-relaxed whitespace-pre-wrap">{value}</span>
                        <button onClick={() => copyToClipboard(value, label)} className="shrink-0 mt-0.5">
                          <Copy size={12} className="text-slate-400 hover:text-slate-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Hashtags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(seo.hashtags || script.hashtags || []).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => copyToClipboard(tag, "Hashtag")}
                          className="text-xs bg-primary-50 text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Blog content */}
          {(script.blog_intro || script.blog_body) && (
            <Card padding="sm">
              <button
                onClick={() => toggle("blog")}
                className="flex items-center justify-between w-full px-2 py-1 mb-2"
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-slate-500" />
                  <h3 className="font-semibold text-sm text-brand-text">Blog Post Content</h3>
                  <Badge variant="default" className="text-xs">AEO/GEO/SEO</Badge>
                </div>
                {expandedSections.blog ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              {expandedSections.blog && (
                <div className="px-2 space-y-3">
                  {[
                    { label: "Introduction", value: script.blog_intro },
                    { label: "Body", value: script.blog_body },
                    { label: "Conclusion", value: script.blog_conclusion },
                  ].filter((s) => s.value).map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
                      <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 leading-relaxed flex items-start justify-between gap-2">
                        <span className="flex-1">{value}</span>
                        <button onClick={() => copyToClipboard(value, label)} className="shrink-0 mt-0.5">
                          <Copy size={12} className="text-slate-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      ) : (
        <Card className="text-center py-12">
          <p className="text-slate-500">No script generated yet.</p>
          <Button onClick={() => project.voice_recording_id && generateScript(project.voice_recording_id)} className="mt-4 gap-2">
            <Sparkles size={16} /> Generate Script
          </Button>
        </Card>
      )}

      {/* ── Teleprompter full-screen overlay ── */}
      {showTeleprompter && script && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-black/90 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Camera size={15} className="text-white/60" />
              <span className="text-white/80 text-sm font-semibold">Teleprompter</span>
              {tpRecording && (
                <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> REC
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Auto-scroll toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => setTpAutoScroll((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${tpAutoScroll ? "bg-green-500" : "bg-white/20"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${tpAutoScroll ? "left-[18px]" : "left-0.5"}`} />
                </div>
                <span className="text-white/60 text-xs">Auto-scroll</span>
              </label>
              {tpAutoScroll && (
                <div className="flex items-center gap-1">
                  <span className="text-white/40 text-[10px]">Slow</span>
                  <input
                    type="range" min={1} max={6} step={0.5} value={tpSpeed}
                    onChange={(e) => setTpSpeed(Number(e.target.value))}
                    className="w-20 accent-green-500"
                  />
                  <span className="text-white/40 text-[10px]">Fast</span>
                </div>
              )}
              <button onClick={closeTeleprompter} className="text-white/50 hover:text-white text-lg leading-none ml-1">✕</button>
            </div>
          </div>

          {/* Scrolling script */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 md:px-16 py-10">
            <div className="max-w-2xl mx-auto space-y-10 pb-48">
              <div>
                <p className="text-white/30 text-xs uppercase tracking-widest mb-3 text-center">Opening Hook</p>
                <p className="text-white text-3xl md:text-4xl leading-relaxed font-semibold text-center">
                  {selectedHook || script.hook}
                </p>
              </div>
              <div>
                <p className="text-white/30 text-xs uppercase tracking-widest mb-3 text-center">Script</p>
                <p className="text-white text-3xl md:text-4xl leading-relaxed whitespace-pre-wrap">
                  {editedScript}
                </p>
              </div>
              <div>
                <p className="text-white/30 text-xs uppercase tracking-widest mb-3 text-center">Call to Action</p>
                <p className="text-white text-3xl md:text-4xl leading-relaxed font-semibold text-center">
                  {editedCta}
                </p>
                {buildContactLine() && (
                  <p className="text-white/60 text-2xl leading-relaxed text-center mt-3">
                    {buildContactLine()}
                  </p>
                )}
              </div>
              <div className="text-center pt-8">
                <p className="text-white/20 text-xl">— End of Script —</p>
              </div>
            </div>
          </div>

          {/* Bottom bar: camera preview + record controls */}
          <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 bg-black/90 border-t border-white/10">
            {/* Camera preview */}
            <div className="w-28 h-16 rounded-xl overflow-hidden bg-white/10 shrink-0 relative">
              <video ref={cameraVideoRef} muted autoPlay playsInline className="w-full h-full object-cover [transform:scaleX(-1)]" />
              <div className="absolute bottom-0.5 left-1 text-[9px] text-white/50">Preview</div>
            </div>

            {/* Record controls */}
            <div className="flex-1 flex items-center justify-center gap-3">
              {tpUploading ? (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Loader2 size={15} className="animate-spin" /> Uploading recording…
                </div>
              ) : tpRecording ? (
                <button
                  onClick={stopTpRecording}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-colors"
                >
                  <Square size={13} fill="white" /> Stop Recording
                </button>
              ) : (
                <button
                  onClick={startTpRecording}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-colors"
                >
                  <span className="w-3 h-3 rounded-full bg-white inline-block" /> Record Myself
                </button>
              )}
            </div>

            <div className="w-28 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
