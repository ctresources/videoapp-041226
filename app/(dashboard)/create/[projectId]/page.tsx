"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Sparkles, FileText, Search, Video, RefreshCw,
  Copy, ChevronDown, ChevronUp, Loader2, CheckCircle, Wand2,
  ImageIcon, Film, Palette
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

/** Safely parse JSON from a fetch Response — returns null if the body is HTML/empty */
async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return null;
  try { return JSON.parse(text); } catch { return null; }
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
  { value: "blog_long", label: "Blog Video", desc: "Landscape 16:9, 3-5 min" },
  { value: "reel_9x16", label: "Reel / TikTok / Short", desc: "Vertical 9:16, 30-90 sec" },
  { value: "youtube_16x9", label: "YouTube Long-form", desc: "Landscape 16:9, 5-10 min" },
  { value: "short_1x1", label: "Square Post", desc: "1:1, 60-90 sec" },
];

type BackgroundMode = "stock-video" | "animated";

const backgroundModes: { value: BackgroundMode; label: string; desc: string; icon: typeof ImageIcon }[] = [
  { value: "stock-video", label: "Video B-Roll", desc: "Real video footage matched to your topic", icon: Film },
  { value: "animated", label: "Animated", desc: "Animated color gradient backgrounds", icon: Palette },
];

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [selectedVideoType, setSelectedVideoType] = useState<VideoType>("blog_long");
  const [selectedBgMode, setSelectedBgMode] = useState<BackgroundMode>("stock-video");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    script: true, seo: false, blog: false,
  });
  const [editedScript, setEditedScript] = useState("");
  const [selectedHook, setSelectedHook] = useState<string>("");
  const [contactInfo, setContactInfo] = useState<{
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    company_address: string | null;
  } | null>(null);

  // If coming from /create with a recordingId, generate script automatically
  const source = searchParams.get("source");

  useEffect(() => {
    loadProject();
    loadProfile();
  }, [projectId]); // eslint-disable-line

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
      const cta = (project.ai_script as AiScript | null)?.cta || "";
      const contactLine = buildContactLine();
      const ctaWithContact = [cta, contactLine].filter(Boolean).join("\n");
      const fullScript = [hook, bodyScript, ctaWithContact].filter(Boolean).join("\n\n");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          videoType: selectedVideoType,
          backgroundMode: selectedBgMode,
          script: fullScript,
          hook,
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
    const phone = contactInfo.phone || contactInfo.company_phone;
    if (phone) parts.push(phone);
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
                  const full = contactLine ? `${script.cta}\n\n${contactLine}` : script.cta;
                  copyToClipboard(full, "CTA");
                }}
                className="flex items-center gap-1 text-xs text-primary-500 hover:underline"
              >
                <Copy size={12} /> Copy with contact
              </button>
            </div>
            <div className="bg-accent-500/5 border border-accent-500/20 rounded-xl px-4 py-3 text-sm text-slate-700 flex flex-col gap-2">
              <p className="leading-relaxed">{script.cta}</p>
              {buildContactLine() ? (
                <div className="border-t border-accent-500/20 pt-2 flex items-center justify-between gap-2">
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
                <p className="text-xs text-slate-400 italic border-t border-accent-500/20 pt-2">
                  Add your name, phone & address in{" "}
                  <a href="/settings" className="text-primary-500 hover:underline">Settings</a>{" "}
                  to auto-append contact info here.
                </p>
              )}
            </div>
          </Card>

          {/* SEO section */}
          {seo && (
            <Card padding="sm">
              <button
                onClick={() => toggle("seo")}
                className="flex items-center justify-between w-full px-2 py-1 mb-2"
              >
                <div className="flex items-center gap-2">
                  <Search size={16} className="text-secondary-500" />
                  <h3 className="font-semibold text-sm text-brand-text">SEO & Social Captions</h3>
                </div>
                {expandedSections.seo ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              {expandedSections.seo && (
                <div className="flex flex-col gap-3 px-2">
                  {[
                    { label: "YouTube Title", value: seo.youtube_title },
                    { label: "Meta Description", value: seo.meta_description },
                    { label: "Instagram Caption", value: seo.instagram_caption },
                    { label: "URL Slug", value: seo.slug },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
                      <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 flex items-start justify-between gap-2">
                        <span className="flex-1 leading-relaxed">{value}</span>
                        <button onClick={() => copyToClipboard(value, label)} className="shrink-0">
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

            {/* Background style selector */}
            <p className="text-xs font-medium text-slate-500 mb-2">Background Style</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {backgroundModes.map(({ value, label, desc, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setSelectedBgMode(value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    selectedBgMode === value
                      ? "border-primary-500 bg-primary-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Icon size={16} className={selectedBgMode === value ? "text-primary-500" : "text-slate-400"} />
                  <p className="text-sm font-medium text-brand-text mt-1">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-tight">{desc}</p>
                </button>
              ))}
            </div>

            <Button
              onClick={handleGenerateVideo}
              loading={videoGenerating}
              size="lg"
              className="w-full gap-2"
            >
              <Wand2 size={18} /> Generate {videoTypes.find((v) => v.value === selectedVideoType)?.label}
            </Button>
            <p className="text-xs text-slate-400 text-center mt-2">
              Rendering takes 2-5 minutes. You&apos;ll see it in My Videos when ready.
            </p>
          </Card>
        </div>
      ) : (
        <Card className="text-center py-12">
          <p className="text-slate-500">No script generated yet.</p>
          <Button onClick={() => project.voice_recording_id && generateScript(project.voice_recording_id)} className="mt-4 gap-2">
            <Sparkles size={16} /> Generate Script
          </Button>
        </Card>
      )}
    </div>
  );
}
