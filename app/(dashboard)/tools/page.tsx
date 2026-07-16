"use client";

import { createClient } from "@/lib/supabase/client";
import {
  Tag, FileText, Heading, ScrollText, Tv2, Image, Copy, Check,
  Sparkles, ChevronDown, Save, Loader2, HelpCircle, Video, X, User,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

type Tab = "description" | "script" | "title" | "tags" | "channel" | "thumbnail";

interface Project {
  id: string;
  title: string;
  ai_script?: { hook?: string; script?: string; description?: string; hashtags?: string[] } | null;
  seo_data?: { hashtags?: string[]; youtube_title?: string } | null;
}

// Ordered to match the video workflow: title & script BEFORE rendering,
// description, tags & thumbnail AFTER — channel name is a one-time setup tool.
const TABS: { id: Tab; label: string; icon: React.ElementType; soon?: boolean }[] = [
  { id: "title",       label: "Title Generator",      icon: Heading },
  { id: "script",      label: "Script Generator",     icon: ScrollText },
  { id: "description", label: "Description Generator", icon: FileText },
  { id: "tags",        label: "Tag Generator",        icon: Tag },
  { id: "thumbnail",   label: "Thumbnail Generator",  icon: Image },
  { id: "channel",     label: "Channel Name Generator", icon: Tv2 },
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
  const [savingProject, setSavingProject] = useState(false);
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

  const saveToProject = async () => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    setSavingProject(true);
    try {
      const supabase = createClient();
      const existingSeo = project.seo_data ?? {};
      const { error } = await supabase
        .from("projects")
        .update({ seo_data: { ...existingSeo, hashtags: tags } })
        .eq("id", projectId);
      if (error) throw error;
      toast.success(`Saved ${tags.length} tags to "${project.title}"`);
    } catch {
      toast.error("Failed to save tags");
    } finally {
      setSavingProject(false);
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
                  onClick={saveToProject}
                  disabled={savingProject}
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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Script or topic notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
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

function TitleGenerator() {
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
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Charlotte"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">State <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="NC"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400" />
          </div>
        </div>
      </div>

      <button onClick={generate} disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Generating…" : "Generate Titles"}
      </button>

      {titles.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">Generated {titles.length} titles</p>
            <button onClick={() => { navigator.clipboard.writeText(titles.join("\n")); toast.success("Copied all titles"); }}
              className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              <Copy size={12} /> Copy All
            </button>
          </div>
          {titles.map((t, i) => (
            <div key={i} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
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
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Why buyers are leaving the city for the suburbs"
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Video type</label>
            <div className="relative">
              <select value={videoType} onChange={(e) => setVideoType(e.target.value)}
                className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white text-slate-700 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-300">
                <option value="blog_video">Blog Video (3-5 min)</option>
                <option value="short_form">Short / Reel (60-90 sec)</option>
                <option value="youtube_16x9">Long YouTube (8-10 min — algorithm sweet spot, mid-roll ad ready)</option>
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
          <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Sarah Johnson"
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
  const [looks, setLooks] = useState<{ id: string; name: string; preview_image_url: string }[]>([]);
  const [photoUrl, setPhotoUrl] = useState(""); // "" = profile headshot
  const [photoSide, setPhotoSide] = useState<"left" | "right">("right");

  useEffect(() => {
    fetch("/api/avatar/looks")
      .then((r) => (r.ok ? r.json() : { looks: [] }))
      .then((d) => setLooks(
        ((d.looks || []) as { id: string; name: string; preview_image_url: string | null }[])
          .filter((l): l is { id: string; name: string; preview_image_url: string } => !!l.preview_image_url),
      ))
      .catch(() => {});
  }, []);

  const handleProjectSelect = (p: Project | null) => {
    setProjectId(p?.id ?? "");
    // Leave the headline blank — AI writes the 3–4 word hook from the title
    setHeadline("");
  };

  const [bgUrl, setBgUrl] = useState("");

  // reuseBackground=true re-renders just the text/photo over the same scene —
  // takes seconds instead of regenerating a whole new AI background.
  const generate = async (reuseBackground = false) => {
    if (!headline.trim() && !projectId) {
      toast.error("Select a project (AI writes the text) or type a 3–4 word headline");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: headline.trim() || undefined,
          projectId: projectId || undefined,
          photoUrl: photoUrl || undefined,
          photoSide,
          backgroundUrl: reuseBackground && bgUrl ? bgUrl : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThumbUrl(data.url);
      if (data.headline) setHeadline(data.headline);
      if (data.backgroundUrl) setBgUrl(data.backgroundUrl);
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
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Thumbnail Text <span className="font-normal text-slate-400">(optional — leave blank and AI writes it)</span>
        </label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
          placeholder="Leave blank — AI writes a 3–4 word curiosity hook"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
        />
        <p className="text-xs text-slate-400 mt-1">
          3–4 words max, ALL CAPS, curiosity-driven — AI avoids repeating words from your title.
          A bright AI scene with a vivid blue sky is generated behind it, and your photo and market badge are added automatically.
        </p>
      </div>

      {/* Photo position — text takes the opposite side */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Photo Position</label>
        <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-sm font-semibold">
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              onClick={() => setPhotoSide(side)}
              className={`px-4 py-2 transition-colors ${
                photoSide === side ? "bg-primary-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {side === "left" ? "◀ Photo Left" : "Photo Right ▶"}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-1">Your text and market badge move to the opposite side automatically.</p>
      </div>

      {/* Photo picker — profile headshot by default, or any avatar look */}
      {looks.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Photo On Thumbnail</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPhotoUrl("")}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-colors ${
                photoUrl === "" ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                <User size={20} className="text-slate-400" />
              </span>
              <span className="text-[10px] text-slate-500">Headshot</span>
            </button>
            {looks.map((l) => (
              <button
                key={l.id}
                onClick={() => setPhotoUrl(l.preview_image_url)}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-colors ${
                  photoUrl === l.preview_image_url ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.preview_image_url} alt={l.name} className="w-14 h-14 rounded-full object-cover" />
                <span className="text-[10px] text-slate-500 max-w-[64px] truncate">{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => generate(false)}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Creating your thumbnail…" : "Generate Thumbnail"}
      </button>

      {thumbUrl && (
        <div className="mt-6">
          <div className="rounded-xl overflow-hidden border border-slate-200 max-w-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl} alt="Generated thumbnail" className="w-full h-auto" />
          </div>
          {/* Inline text editor — edit here, then Update Text Only */}
          <div className="mt-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Edit Thumbnail Text</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && generate(true)}
              placeholder="Type new text (3–4 words), then Update"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={() => generate(true)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
              title="Redraws the text above on this same background"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {loading ? "Updating…" : "Update Text Only"}
            </button>
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              New Background
            </button>
            <a href={thumbUrl} download target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              <Save size={12} /> Download PNG (1280×720)
            </a>
            <p className="text-xs text-slate-400 w-full">
              Change the text above, then hit &ldquo;Update Text Only&rdquo; — it redraws in seconds on the same background.{" "}
              {projectId ? "Saved to this project — it appears in the Publish window when your video is ready." : "Download it, then upload in YouTube Studio when you publish."}
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
    <div className="max-w-6xl mx-auto px-6 py-8">
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

      {/* Tab bar — wraps so every tool is visible without horizontal scrolling */}
      <div className="flex flex-wrap gap-1 pb-1 mb-6 border-b border-slate-200">
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
        {activeTab === "title"       && <TitleGenerator />}
        {activeTab === "script"      && <ScriptGenerator />}
        {activeTab === "channel"     && <ChannelNameGenerator />}
        {activeTab === "thumbnail"   && <ThumbnailGenerator projects={projects} />}
      </div>
    </div>
  );
}
