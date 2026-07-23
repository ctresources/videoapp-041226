"use client";

import { createClient } from "@/lib/supabase/client";
import {
  Tag, FileText, Heading, ScrollText, Tv2, Image, Copy, Check,
  Sparkles, ChevronDown, Save, Loader2, RefreshCw, HelpCircle, Video, X, Upload,
  Megaphone,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

type Tab = "description" | "script" | "title" | "tags" | "channel" | "thumbnail" | "banner";

interface Project {
  id: string;
  title: string;
  ai_script?: { hook?: string; script?: string; description?: string; hashtags?: string[] } | null;
  seo_data?: { hashtags?: string[]; youtube_title?: string } | null;
}

// Ordered to match the video workflow: title & script BEFORE rendering,
// description & tags AFTER — channel name is a one-time setup tool.
const TABS: { id: Tab; label: string; icon: React.ElementType; soon?: boolean }[] = [
  { id: "title",       label: "Title Generator",      icon: Heading },
  { id: "script",      label: "Script Generator",     icon: ScrollText },
  { id: "description", label: "Description Generator", icon: FileText },
  { id: "tags",        label: "Tag Generator",        icon: Tag },
  { id: "channel",     label: "Channel Name Generator", icon: Tv2 },
  { id: "thumbnail",   label: "Thumbnail Generator",  icon: Image },
  { id: "banner",      label: "Channel Banner",       icon: Megaphone },
];

function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className={`text-slate-400 hover:text-slate-600 transition-colors ${small ? "p-0.5" : "p-1"}`} title="Copy">
      {copied ? <Check size={small ? 13 : 15} className="text-green-500" /> : <Copy size={small ? 13 : 15} />}
    </button>
  );
}

function ProjectSelector({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string;
  onSelect: (p: Project | null) => void;
}) {
  const selected = projects.find((p) => p.id === selectedId);
  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Generate from a project (optional)
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Project</label>
          <div className="relative">
            <select
              value={selectedId}
              onChange={(e) => {
                const p = projects.find((x) => x.id === e.target.value) ?? null;
                onSelect(p);
              }}
              className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="">— select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Title</label>
          <div className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 truncate min-h-[36px]">
            {selected?.title || <span className="text-slate-400">—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAG GENERATOR ────────────────────────────────────────────────────────────

function TagGenerator({ projects, initialProjectId }: { projects: Project[]; initialProjectId?: string }) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingProject, setSavingProject] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const handleProjectSelect = (p: Project | null) => {
    setProjectId(p?.id ?? "");
    if (p?.title) setTitle(p.title);
  };

  // Deep link from the project editor: ?project=<id> preselects that project
  useEffect(() => {
    if (!initialProjectId || projectId) return;
    const p = projects.find((x) => x.id === initialProjectId);
    if (p) handleProjectSelect(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, initialProjectId]);

  const generate = async () => {
    if (!title.trim()) { toast.error("Enter a video title"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTags(data.tags);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate tags");
    } finally {
      setLoading(false);
    }
  };

  const saveToProject = async (pid: string) => {
    const project = projects.find((p) => p.id === pid);
    if (!project) return;
    setSavingProject(pid);
    try {
      const supabase = createClient();
      const existingSeo = project.seo_data ?? {};
      const { error } = await supabase
        .from("projects")
        .update({ seo_data: { ...existingSeo, hashtags: tags } })
        .eq("id", pid);
      if (error) throw error;
      toast.success(`Saved ${tags.length} tags to "${project.title}"`);
    } catch (e) {
      toast.error("Failed to save tags");
    } finally {
      setSavingProject("");
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(tags.join(", "));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div>
      <ProjectSelector projects={projects} selectedId={projectId} onSelect={handleProjectSelect} />

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Video Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="e.g. What $500k Actually Buys You in Charlotte: Suburbs vs. City Center"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
        />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Generating…" : "Generate"}
      </button>

      {tags.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">Generated {tags.length} tags</p>
            <div className="flex items-center gap-2">
              {projectId && (
                <button
                  onClick={() => saveToProject(projectId)}
                  disabled={!!savingProject}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {savingProject ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save All to Project
                </button>
              )}
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
              >
                {copiedAll ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                Copy All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-800 text-xs font-medium px-3 py-1.5 rounded-full border border-orange-200"
              >
                {tag}
                <CopyButton text={tag} small />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DESCRIPTION GENERATOR ────────────────────────────────────────────────────

function DescriptionGenerator({ projects, initialProjectId }: { projects: Project[]; initialProjectId?: string }) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [result, setResult] = useState<{ description: string; hashtags: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  const handleProjectSelect = (p: Project | null) => {
    setProjectId(p?.id ?? "");
    if (p?.title) setTitle(p.title);
    if (p?.ai_script?.script) setScript(p.ai_script.script.slice(0, 600));
  };

  // Deep link from the project editor: ?project=<id> preselects that project
  useEffect(() => {
    if (!initialProjectId || projectId) return;
    const p = projects.find((x) => x.id === initialProjectId);
    if (p) handleProjectSelect(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, initialProjectId]);

  const generate = async () => {
    if (!title.trim()) { toast.error("Enter a video title"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate description");
    } finally {
      setLoading(false);
    }
  };

  const saveToProject = async () => {
    if (!projectId || !result) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    setSavingProject(true);
    try {
      const supabase = createClient();
      const existingSeo = project.seo_data ?? {};
      const { error } = await supabase
        .from("projects")
        .update({ seo_data: { ...existingSeo, youtube_description: result.description, hashtags: result.hashtags } })
        .eq("id", projectId);
      if (error) throw error;
      toast.success(`Saved description to "${project.title}"`);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingProject(false);
    }
  };

  return (
    <div>
      <ProjectSelector projects={projects} selectedId={projectId} onSelect={handleProjectSelect} />

      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Video Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Charlotte Real Estate Market Update — June 2025"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Script or topic notes <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={3}
            placeholder="Paste script excerpt or describe the key points covered…"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400 resize-none"
          />
        </div>
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Generating…" : "Generate Description"}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">YouTube Description</p>
              <div className="flex gap-2">
                {projectId && (
                  <button onClick={saveToProject} disabled={savingProject} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                    {savingProject ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save to Project
                  </button>
                )}
                <CopyButton text={result.description} />
              </div>
            </div>
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{result.description}</pre>
          </div>
          {result.hashtags?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hashtags</p>
                <CopyButton text={result.hashtags.join(" ")} />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.hashtags.map((h, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-100">
                    {h}
                    <CopyButton text={h} small />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TITLE GENERATOR ──────────────────────────────────────────────────────────

function TitleGenerator({ projects }: { projects: Project[] }) {
  const [topic, setTopic] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, city, state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTitles(data.titles);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate titles");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Topic or keyword</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. buying a home with bad credit, housing market update, first time buyer tips"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">City <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Charlotte"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">State <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="NC"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
            />
          </div>
        </div>
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Generating…" : "Generate Titles"}
      </button>

      {titles.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">Generated {titles.length} titles</p>
            <button
              onClick={() => { navigator.clipboard.writeText(titles.join("\n")); toast.success("Copied all titles"); }}
              className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
            >
              <Copy size={12} /> Copy All
            </button>
          </div>
          {titles.map((t, i) => (
            <div key={i} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-primary-200 hover:bg-primary-50/30 transition-colors group">
              <span className="text-xs font-bold text-slate-300 w-5 shrink-0">{i + 1}</span>
              <p className="text-sm text-slate-700 flex-1">{t}</p>
              <CopyButton text={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SCRIPT GENERATOR ─────────────────────────────────────────────────────────

function ScriptGenerator() {
  const [topic, setTopic] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [videoType, setVideoType] = useState("blog_video");
  const [result, setResult] = useState<{ hook: string; hooks: string[]; script: string; cta: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeHook, setActiveHook] = useState(0);

  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, city, state, videoType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setActiveHook(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate script");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Video topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Why buyers are leaving the city for the suburbs"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">City <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Charlotte"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">State <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="NC"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Video type</label>
            <div className="relative">
              <select value={videoType} onChange={(e) => setVideoType(e.target.value)}
                className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white text-slate-700 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-300">
                <option value="blog_video">Blog Video (3-5 min)</option>
                <option value="short_form">Short / Reel (60-90 sec)</option>
                <option value="youtube_16x9">Long YouTube (8-15 min — algorithm sweet spot, mid-roll ad ready)</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <button onClick={generate} disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Generating…" : "Generate Script"}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          {result.title && (
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Suggested Title</p>
                <CopyButton text={result.title} />
              </div>
              <p className="text-sm font-medium text-slate-700">{result.title}</p>
            </div>
          )}

          {result.hooks?.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Hook Options</p>
              <div className="space-y-2">
                {result.hooks.map((h, i) => (
                  <div key={i} onClick={() => setActiveHook(i)}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${activeHook === i ? "border-primary-300 bg-primary-50" : "border-slate-100 hover:border-slate-200"}`}>
                    <span className={`text-xs font-bold mt-0.5 shrink-0 w-4 ${activeHook === i ? "text-primary-500" : "text-slate-300"}`}>{i + 1}</span>
                    <p className="text-sm text-slate-700 flex-1">{h}</p>
                    <CopyButton text={h} small />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Script</p>
              <CopyButton text={result.script} />
            </div>
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">{result.script}</pre>
          </div>

          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Call to Action</p>
              <CopyButton text={result.cta} />
            </div>
            <p className="text-sm text-slate-700">{result.cta}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHANNEL NAME GENERATOR ───────────────────────────────────────────────────

function ChannelNameGenerator() {
  const [agentName, setAgentName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [niche, setNiche] = useState("");
  const [names, setNames] = useState<{ name: string; rationale: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!agentName.trim()) { toast.error("Enter your name"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/channel-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, city, state, niche }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNames(data.names);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate names");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Your name</label>
          <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)}
            placeholder="e.g. Sarah Johnson"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">City <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Charlotte"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">State <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="NC"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Niche <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="luxury, first-time buyers…"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
        </div>
      </div>

      <button onClick={generate} disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Generating…" : "Generate Channel Names"}
      </button>

      {names.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-slate-500 mb-3">Generated {names.length} channel names</p>
          {names.map((n, i) => (
            <div key={i} className="flex items-start gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
              <span className="text-xs font-bold text-slate-300 w-5 mt-1 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{n.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.rationale}</p>
              </div>
              <CopyButton text={n.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── THUMBNAIL GENERATOR ──────────────────────────────────────────────────────

function ThumbnailGenerator({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState("");
  const [headline, setHeadline] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleProjectSelect = (p: Project | null) => {
    setProjectId(p?.id ?? "");
    if (p?.title) setHeadline(p.title);
  };

  // Custom background photo (e.g. a listing exterior) — overrides the AI scene.
  const [customBg, setCustomBg] = useState("");
  const [bgUploading, setBgUploading] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);

  // The thumbnail lives on the storage origin, where <a download> is ignored
  // (browsers only honor it same-origin) — fetch as a blob and save instead.
  async function downloadThumbnail() {
    if (!thumbUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(thumbUrl);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(headline || "thumbnail").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "thumbnail"}-1280x720.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Thumbnail downloaded!");
    } catch {
      // Last resort: open in a new tab so the user can right-click → save
      window.open(thumbUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  async function handleBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }

    setBgUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/thumb-bg-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      setCustomBg(publicUrl);
      toast.success("Background photo uploaded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBgUploading(false);
    }
  }

  const generate = async () => {
    if (!headline.trim()) { toast.error("Enter a headline for the thumbnail"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline,
          projectId: projectId || undefined,
          backgroundUrl: customBg || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThumbUrl(data.url);
      toast.success(projectId ? "Thumbnail generated and saved to the project!" : "Thumbnail generated!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate thumbnail");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <ProjectSelector projects={projects} selectedId={projectId} onSelect={handleProjectSelect} />

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Thumbnail Headline</label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
          placeholder="e.g. Moving To Blue Bell? Watch This First"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
        />
        <p className="text-xs text-slate-400 mt-1">
          Short and punchy wins — 5–8 bold words. Your headshot, logo, and market badge are added automatically from your profile.
        </p>
      </div>

      {/* Background — AI scene by default, or the user's own photo (e.g. listing exterior) */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Background</label>
        <div className="flex flex-wrap items-start gap-2">
          <button
            onClick={() => setCustomBg("")}
            className={`flex flex-col items-center justify-center gap-1 w-28 h-[4.5rem] rounded-xl border-2 transition-colors ${
              customBg === "" ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <Sparkles size={16} className="text-slate-500" />
            <span className="text-[10px] text-slate-500 font-medium">AI Scene</span>
          </button>

          {customBg ? (
            <div className={`relative rounded-xl border-2 overflow-hidden ${customBg ? "border-primary-500" : "border-slate-200"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={customBg} alt="Custom background" className="w-32 h-[4.5rem] object-cover" />
              <button
                onClick={() => setCustomBg("")}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
                title="Remove custom background"
              >
                <X size={11} className="text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => bgFileRef.current?.click()}
              disabled={bgUploading}
              className="flex flex-col items-center justify-center gap-1 w-28 h-[4.5rem] rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all disabled:opacity-50"
            >
              {bgUploading ? (
                <Loader2 size={16} className="text-primary-500 animate-spin" />
              ) : (
                <Upload size={16} className="text-slate-400" />
              )}
              <span className="text-[10px] text-slate-500 font-medium">
                {bgUploading ? "Uploading…" : "Upload Photo"}
              </span>
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {customBg
            ? "Your photo is the backdrop — headline, cutout, and market badge are layered on top."
            : "Upload a listing photo to use as the backdrop instead of the AI-generated scene."}
        </p>
        <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFile} />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Rendering…" : "Generate Thumbnail"}
      </button>

      {thumbUrl && (
        <div className="mt-6">
          <div className="rounded-xl overflow-hidden border border-slate-200 max-w-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl} alt="Generated thumbnail" className="w-full h-auto" />
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={downloadThumbnail}
              disabled={downloading}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {downloading ? "Downloading…" : "Download PNG (1280×720)"}
            </button>
            <button
              onClick={generate}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
            >
              <Sparkles size={12} /> Regenerate
            </button>
            <p className="text-xs text-slate-400">Upload it in YouTube Studio when you publish.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHANNEL BANNER GENERATOR ─────────────────────────────────────────────────

const BANNER_DEFAULTS = {
  headline: "WATCHING ON TV?",
  qr1Caption: "SCAN TO CHAT WITH US!",
  qr1Link: "",
  subscribeKicker: "NEW VIDEOS EVERY WEEK!",
  subscribeMain: "SUBSCRIBE",
  subscribeSub: "TO LEARN ALL ABOUT",
  qr2Caption: "CALL, TEXT OR MEET US ON ZOOM!!",
  qr2Link: "",
};

function BannerGenerator() {
  const [fields, setFields] = useState({ ...BANNER_DEFAULTS });
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [bannerUrl, setBannerUrl] = useState("");
  const photoFileRef = useRef<HTMLInputElement>(null);

  const setField = (k: keyof typeof BANNER_DEFAULTS, v: string) =>
    setFields((f) => ({ ...f, [k]: v }));

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }

    setPhotoUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/banner-photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      setPhotos((p) => [...p, publicUrl].slice(0, 2));
      toast.success("Photo added!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoUploading(false);
    }
  }

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tools/banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, photoUrls: photos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBannerUrl(data.url);
      toast.success("Banner generated!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate banner");
    } finally {
      setLoading(false);
    }
  };

  async function downloadBanner() {
    if (!bannerUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(bannerUrl);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "channel-banner-2560x1440.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Banner downloaded!");
    } catch {
      window.open(bannerUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  const labelCls = "block text-xs font-semibold text-slate-600 mb-1";
  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400";

  return (
    <div>
      <p className="text-sm text-slate-500 mb-5">
        Generate a 2560×1440 YouTube channel banner. Every field is pre-filled to match the template —
        edit any of it, add up to two QR codes and two photos, then download.
      </p>

      {/* Headline */}
      <div className="mb-4">
        <label className={labelCls}>Headline</label>
        <input type="text" value={fields.headline} onChange={(e) => setField("headline", e.target.value)}
          placeholder="WATCHING ON TV?" className={inputCls} />
      </div>

      {/* QR 1 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className={labelCls}>QR #1 caption</label>
          <input type="text" value={fields.qr1Caption} onChange={(e) => setField("qr1Caption", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>QR #1 link <span className="font-normal text-slate-400">(optional)</span></label>
          <input type="text" value={fields.qr1Link} onChange={(e) => setField("qr1Link", e.target.value)}
            placeholder="https://… or tel:+1…" className={inputCls} />
        </div>
      </div>

      {/* Subscribe block */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className={labelCls}>Above SUBSCRIBE</label>
          <input type="text" value={fields.subscribeKicker} onChange={(e) => setField("subscribeKicker", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Main word</label>
          <input type="text" value={fields.subscribeMain} onChange={(e) => setField("subscribeMain", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Below SUBSCRIBE</label>
          <input type="text" value={fields.subscribeSub} onChange={(e) => setField("subscribeSub", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* QR 2 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className={labelCls}>QR #2 caption</label>
          <input type="text" value={fields.qr2Caption} onChange={(e) => setField("qr2Caption", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>QR #2 link <span className="font-normal text-slate-400">(optional)</span></label>
          <input type="text" value={fields.qr2Link} onChange={(e) => setField("qr2Link", e.target.value)}
            placeholder="https://… or mailto:…" className={inputCls} />
        </div>
      </div>

      {/* Photos */}
      <div className="mb-5">
        <label className={labelCls}>Photos <span className="font-normal text-slate-400">(optional — up to 2)</span></label>
        <div className="flex flex-wrap gap-2">
          {photos.map((url, i) => (
            <div key={i} className="relative rounded-xl border-2 border-primary-500 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Banner photo ${i + 1}`} className="w-28 h-24 object-cover" />
              <button
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
                title="Remove photo"
              >
                <X size={11} className="text-white" />
              </button>
            </div>
          ))}
          {photos.length < 2 && (
            <button
              onClick={() => photoFileRef.current?.click()}
              disabled={photoUploading}
              className="flex flex-col items-center justify-center gap-1 w-28 h-24 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all disabled:opacity-50"
            >
              {photoUploading ? <Loader2 size={16} className="text-primary-500 animate-spin" /> : <Upload size={16} className="text-slate-400" />}
              <span className="text-[10px] text-slate-500 font-medium">{photoUploading ? "Uploading…" : "Add Photo"}</span>
            </button>
          )}
        </div>
        <input ref={photoFileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Creating your banner…" : "Generate Banner"}
      </button>

      {bannerUrl && (
        <div className="mt-6">
          {/* Preview with the mobile/TV safe-zone outline (center 1546×423). */}
          <div className="relative rounded-xl overflow-hidden border border-slate-200 max-w-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerUrl} alt="Generated banner" className="w-full h-auto block" />
            <div
              className="absolute border-2 border-dashed border-white/70 pointer-events-none"
              style={{ left: "19.8%", top: "35.3%", width: "60.4%", height: "29.4%" }}
              title="Safe zone — visible on all devices"
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            The dashed box is YouTube&apos;s safe zone — the only part guaranteed to show on phones and TVs.
            Everything else appears on desktop.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={downloadBanner}
              disabled={downloading}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {downloading ? "Downloading…" : "Download PNG (2560×1440)"}
            </button>
            <p className="text-xs text-slate-400">
              Download it, then upload in YouTube Studio → Customization → Branding → Banner image.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

// ─── HOW TO USE PANEL ──────────────────────────────────────────────────────────

const HOW_TO_STEPS: { step: string; title: string; when: string; detail: string }[] = [
  { step: "1", title: "Title Generator", when: "Before you commit to a topic",
    detail: "Generate 8 title angles (question, data hook, urgency…), pick the strongest — a sharp title keeps the whole video focused." },
  { step: "2", title: "Script Generator", when: "Draft & compare without creating a project",
    detail: "Iterate on scripts freely here, then paste your favorite into Create Video → Paste / Upload when you're ready to render." },
  { step: "3", title: "Create Your Video", when: "The main event",
    detail: "Use the Create Video page — it researches your market and generates the script, title, description, and tags in one flow." },
  { step: "4", title: "Description Generator", when: "After the video renders",
    detail: "A keyword-rich YouTube description with an FAQ block — regenerate a better one, or refresh an older video's description." },
  { step: "5", title: "Tag Generator", when: "Same moment — the YouTube upload form",
    detail: "20 tags mixing broad, local, and long-tail. Copy All into YouTube's tag field and save them to the project." },
];

function HowToUsePanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5 relative">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600" title="Close">
        <X size={16} />
      </button>
      <p className="text-sm font-bold text-brand-text mb-3">How These Tools Fit Your Workflow</p>

      {/* The de-confusion callout — Create Video already does all of this */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4">
        <Video size={15} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-600 leading-relaxed">
          <strong>Making a video? You don&apos;t need to start here.</strong>{" "}
          <Link href="/create" className="text-blue-600 font-semibold hover:underline">Create Video</Link>{" "}
          automatically generates the script, title, description, and tags for every project. These tools
          are your workbench — brainstorm angles, compare versions, or refresh older videos.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {HOW_TO_STEPS.map(({ step, title, when, detail }) => (
          <div key={step} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{step}</span>
            <div>
              <p className="text-sm font-semibold text-brand-text">
                {title} <span className="font-normal text-slate-400">· {when}</span>
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">{detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
        <strong>Rule of thumb:</strong> titles &amp; scripts <em>before</em> you render, descriptions &amp; tags{" "}
        <em>after</em> — so the metadata matches what the video actually says. The Channel Name Generator is
        one-time: use it when setting up or rebranding your YouTube channel.
      </p>
    </div>
  );
}

// ─── MAIN PAGE (cont.) ─────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("title");
  const [projects, setProjects] = useState<Project[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string | undefined>(undefined);

  // Deep links from the project editor: /tools?tab=description&project=<id>
  // (window.location keeps this client page free of a useSearchParams Suspense boundary)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab | null;
    if (tab && TABS.some((t) => t.id === tab && !t.soon)) setActiveTab(tab);
    const project = params.get("project");
    if (project) setInitialProjectId(project);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("projects")
      .select("id, title, ai_script, seo_data")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setProjects(data as Project[]);
      });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6 p-6 rounded-2xl bg-gradient-to-br from-primary-500 to-orange-400 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <h1 className="text-xl font-bold">AI Tools</h1>
          </div>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition-colors"
          >
            <HelpCircle size={13} /> How To Use
          </button>
        </div>
        <p className="text-sm text-white/80 mt-1">Supercharge your content creation with AI</p>
      </div>

      {/* How-to-use workflow panel */}
      {showHelp && <HowToUsePanel onClose={() => setShowHelp(false)} />}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon, soon }) => (
          <button
            key={id}
            onClick={() => !soon && setActiveTab(id)}
            disabled={soon}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab === id
                ? "border-primary-500 text-primary-600"
                : soon
                ? "border-transparent text-slate-300 cursor-not-allowed"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Icon size={15} />
            {label}
            {soon && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full leading-none">
                Soon
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tool panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        {activeTab === "tags"        && <TagGenerator projects={projects} initialProjectId={initialProjectId} />}
        {activeTab === "description" && <DescriptionGenerator projects={projects} initialProjectId={initialProjectId} />}
        {activeTab === "title"       && <TitleGenerator projects={projects} />}
        {activeTab === "script"      && <ScriptGenerator />}
        {activeTab === "channel"     && <ChannelNameGenerator />}
        {activeTab === "thumbnail"   && <ThumbnailGenerator projects={projects} />}
        {activeTab === "banner"      && <BannerGenerator />}
      </div>
    </div>
  );
}
