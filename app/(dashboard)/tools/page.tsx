"use client";

import { createClient } from "@/lib/supabase/client";
import {
  Tag, FileText, Heading, ScrollText, Tv2, Image, Copy, Check,
  Sparkles, ChevronDown, Save, Loader2, RefreshCw,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";

type Tab = "description" | "script" | "title" | "tags" | "channel" | "thumbnail";

interface Project {
  id: string;
  title: string;
  ai_script?: { hook?: string; script?: string; description?: string; hashtags?: string[] } | null;
  seo_data?: { hashtags?: string[]; youtube_title?: string } | null;
}

const TABS: { id: Tab; label: string; icon: React.ElementType; soon?: boolean }[] = [
  { id: "description", label: "Description Generator", icon: FileText },
  { id: "script",      label: "Script Generator",     icon: ScrollText },
  { id: "title",       label: "Title Generator",      icon: Heading },
  { id: "tags",        label: "Tag Generator",        icon: Tag },
  { id: "channel",     label: "Channel Name Generator", icon: Tv2 },
  { id: "thumbnail",   label: "Thumbnail Generator",  icon: Image, soon: true },
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

function TagGenerator({ projects }: { projects: Project[] }) {
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

function DescriptionGenerator({ projects }: { projects: Project[] }) {
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
                <option value="youtube_16x9">Long YouTube (8-12 min)</option>
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

// ─── THUMBNAIL GENERATOR (SOON) ───────────────────────────────────────────────

function ThumbnailSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Image size={28} className="text-slate-400" />
      </div>
      <p className="text-base font-semibold text-slate-700 mb-1.5">Thumbnail Generator</p>
      <p className="text-sm text-slate-400 max-w-xs">AI-powered thumbnail creation is coming soon. Generate click-worthy YouTube thumbnails automatically from your video content.</p>
      <span className="mt-4 inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">Coming Soon</span>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("tags");
  const [projects, setProjects] = useState<Project[]>([]);

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
      <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-primary-500 to-orange-400 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <h1 className="text-xl font-bold">AI Tools</h1>
        </div>
        <p className="text-sm text-white/80">Supercharge your content creation with AI</p>
      </div>

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
        {activeTab === "tags"        && <TagGenerator projects={projects} />}
        {activeTab === "description" && <DescriptionGenerator projects={projects} />}
        {activeTab === "title"       && <TitleGenerator projects={projects} />}
        {activeTab === "script"      && <ScriptGenerator />}
        {activeTab === "channel"     && <ChannelNameGenerator />}
        {activeTab === "thumbnail"   && <ThumbnailSoon />}
      </div>
    </div>
  );
}
