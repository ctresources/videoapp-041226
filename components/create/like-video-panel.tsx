"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";
import { createClient } from "@/lib/supabase/client";
import { uploadWithProgress } from "@/lib/utils/upload-with-progress";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import type { LikePicks, LikeStyle, OnScreen } from "@/lib/video/like-video";

/**
 * Make one like this (2026-11-16, the owner's plan in
 * docs/mockups/like-this-video-mockup.html): the agent adds a video they love
 * and their topic; Gemini reads how the video is built and Perplexity writes
 * the agent's own script that way. On Video / Reel the matching settings are
 * picked (each can be changed) and Spark It opens setup with them; on the
 * camera tab the script goes into the teleprompter.
 */

const MAX_SECONDS = 180;
const MAX_BYTES = 200 * 1024 * 1024;

const ON_SCREEN: { key: OnScreen; label: string }[] = [
  // AI Avatar in Circle first (2026-11-25, the owner's ask).
  { key: "circle", label: "AI Avatar in Circle" },
  { key: "full", label: "Full AI Avatar" },
  { key: "voice", label: "Voice over only" },
  { key: "self", label: "You on camera" },
];

const MUSIC = MUSIC_PRESETS.filter((m) => m.id !== "custom");

function clock(s: number) {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

function youtubeId(link: string): string | null {
  const m = link.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live)\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${
        on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink hover:border-spark-rule-dim"
      }`}
    >
      {children}
    </button>
  );
}

export function LikeVideoPanel({ mode, city, state, brief, initialTopic = "", onUse }: {
  mode: "render" | "camera";
  city: string;
  state: string;
  brief: { audience?: string; tone?: string; purpose?: string };
  initialTopic?: string;
  /** Camera tab: the finished script, for the teleprompter. */
  onUse?: (script: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [duration, setDuration] = useState(0);
  const [link, setLink] = useState("");
  const [topic, setTopic] = useState(initialTopic);
  const [interim, setInterim] = useState("");

  const [phase, setPhase] = useState<"add" | "uploading" | "reading" | "done">("add");
  const [progress, setProgress] = useState(0);
  const [left, setLeft] = useState<number | null>(null);

  const [style, setStyle] = useState<LikeStyle | null>(null);
  const [picks, setPicks] = useState<LikePicks | null>(null);
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ai/like-video").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && typeof d.left === "number") setLeft(d.left);
    }).catch(() => {});
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)) {
      toast.error("Pick a video file.");
      return;
    }
    if (f.size > MAX_BYTES) { toast.error("That video is over 200 MB."); return; }
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > MAX_SECONDS + 1) {
        URL.revokeObjectURL(url);
        toast.error("Up to 3 minutes. Pick a shorter video.");
        return;
      }
      setDuration(Number.isFinite(d) ? d : 0);
      setFile(f);
      setPreview(url);
      setLink("");
    };
    v.onerror = () => { setDuration(0); setFile(f); setPreview(url); setLink(""); };
    v.src = url;
  }

  function startOver() {
    setFile(null);
    setPreview("");
    setDuration(0);
    setLink("");
    setStyle(null);
    setPicks(null);
    setScript("");
    setTitle("");
    setPhase("add");
  }

  const ytId = !file && link.trim() ? youtubeId(link) : null;
  const canRead = !!topic.trim() && (!!file || !!ytId) && phase === "add";

  async function read() {
    if (!canRead) {
      if (!file && !ytId) toast.error(link.trim() ? "That isn't a YouTube link." : "Add a video first.");
      else toast.error("Say or type your topic first.");
      return;
    }
    let path = "";
    try {
      if (file) {
        setPhase("uploading");
        setProgress(0);
        const { data: { user } } = await createClient().auth.getUser();
        if (!user) throw new Error("Sign in again.");
        const ext = (file.name.match(/\.(mp4|mov|webm|m4v)$/i)?.[1] ?? "mp4").toLowerCase();
        path = `${user.id}/like-video/${crypto.randomUUID()}.${ext}`;
        await uploadWithProgress("assets", path, file, setProgress);
      }
      setPhase("reading");
      const res = await fetch("/api/ai/like-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          ...(path ? { path } : { youtube: link.trim() }),
          topic: topic.trim(), city, state, for: mode, ...brief,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't watch that video.");
      setStyle(d.style);
      setPicks(d.picks);
      setScript(d.script || "");
      setTitle(d.title || "");
      if (typeof d.left === "number") setLeft(d.left);
      if (!d.script) toast.error("The script didn't come back. Press Write it again.");
      setPhase("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("add");
    }
  }

  async function writeAgain() {
    if (!style || !topic.trim()) return;
    setRewriting(true);
    try {
      const res = await fetch("/api/ai/like-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", style, topic: topic.trim(), city, state, for: mode, ...brief }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The script didn't come back.");
      setScript(d.script);
      setTitle(d.title || title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRewriting(false);
    }
  }

  async function sparkIt() {
    if (!script.trim() || !picks) return;
    if (mode === "camera") { onUse?.(script.trim()); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/ai/paste-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || undefined,
          script: script.trim(),
          city: city || undefined,
          state: state || undefined,
          length: "rendered_short",
          ...brief,
          like: { platform: picks.shape, onScreen: picks.onScreen, music: picks.music, captions: picks.captions },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save the script.");
      router.push(`/create/${d.project.id}?source=paste${picks.onScreen === "self" ? "&onscreen=self" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      setSaving(false);
    }
  }

  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const box = "flex flex-col rounded-[14px] border-[1.5px] border-spark-rule bg-white p-4";

  // ── Add the video and the topic ──
  if (phase !== "done") {
    const busy = phase === "uploading" || phase === "reading";
    return (
      <div id="like-video" className="mt-4 scroll-mt-20">
        <div className={`grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <div className={box}>
            <h4 className="mb-2.5 text-[16px] font-bold text-spark-ink">The video you love</h4>
            {file ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-spark-rule bg-spark-paper p-3">
                <video src={preview} className="max-h-[220px] rounded-lg" controls playsInline muted />
                <p className="max-w-full truncate text-[13px] text-spark-ink-muted">
                  {file.name}{duration ? ` · ${clock(duration)}` : ""}
                </p>
                <button type="button" onClick={startOver} className="text-[13px] font-semibold text-[#A3660F] underline">
                  Use a different video
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
                  className="flex min-h-[150px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#f1d9b0] bg-spark-amber-tint px-3 py-5 text-center"
                >
                  <Clapperboard size={28} className="text-[#A3660F]" />
                  <span className="text-[16px] font-bold text-spark-ink">Upload a video</span>
                  <span className="text-[13.5px] text-spark-ink-muted">Up to 3 minutes</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
                />
                <div className="my-3 flex items-center gap-2.5 text-[13px] text-spark-ink-faint before:h-px before:flex-1 before:bg-spark-rule after:h-px after:flex-1 after:bg-spark-rule">or</div>
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Paste a YouTube link"
                  className="w-full rounded-xl border-[1.5px] border-spark-rule px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-spark-amber"
                />
              </>
            )}
          </div>

          <div className={box}>
            <h4 className="mb-2.5 text-[16px] font-bold text-spark-ink">Your topic</h4>
            <textarea
              value={interim ? `${topic}${topic ? " " : ""}${interim}` : topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What's your video about?"
              className="min-h-[150px] w-full flex-1 resize-none rounded-xl border-[1.5px] border-spark-rule px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-spark-amber"
            />
            <div className="mt-3.5 flex items-center justify-between gap-3">
              <FieldMic
                size="md"
                title="Say it"
                silenceMs={PROSE_SILENCE_MS}
                onInterim={setInterim}
                onTranscript={(t) => setTopic((cur) => (cur.trim() ? `${cur.trim()} ${t}` : t))}
              />
              <Button onClick={read} disabled={!topic.trim() || (!file && !ytId)} className="gap-1.5">
                Read the video
              </Button>
            </div>
            {left !== null && left <= 5 && (
              <p className="mt-2 text-right text-[12px] text-spark-ink-faint">{left} left this month</p>
            )}
          </div>
        </div>

        {busy && (
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-spark-rule bg-white px-4 py-3 text-[15px] font-semibold text-spark-ink">
            <Loader2 size={18} className="animate-spin text-spark-amber" />
            {phase === "uploading" ? `Uploading your video… ${Math.round(progress * 100)}%` : "Watching your video, about 30 seconds."}
          </div>
        )}
      </div>
    );
  }

  // ── What we picked up, and the script ──
  const recipe: [string, string][] = style ? ([
    ["Hook", style.hook],
    ["Length", `${style.seconds} seconds`],
    ["Pace", style.pace],
    ["Order", style.order],
    ["Tone", style.tone],
    ["Captions", style.captions],
    ["Music", style.music],
    ["Shape", style.shape === "horizontal" ? "Horizontal 16:9" : "Vertical 9:16"],
  ] as [string, string][]).filter(([, v]) => v) : [];
  const ytThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : "";
  const setPick = <K extends keyof LikePicks>(k: K, v: LikePicks[K]) => setPicks((p) => (p ? { ...p, [k]: v } : p));

  return (
    <div id="like-video" className="mt-4 scroll-mt-20">
      <div className="grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2">
        <div className={box}>
          <h4 className="mb-2.5 text-[16px] font-bold text-spark-ink">Your video</h4>
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            {file ? (
              <video src={preview} className="max-h-[300px] rounded-[14px]" controls playsInline muted />
            ) : ytThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ytThumb} alt="" className="max-h-[300px] rounded-[14px]" />
            ) : null}
            <p className="max-w-full truncate text-[14px] text-spark-ink-muted">
              {file ? `${file.name}${duration ? ` · ${clock(duration)}` : ""}` : "YouTube video"}
            </p>
          </div>
          <div className="mt-auto pt-3 text-center">
            <button type="button" onClick={startOver} className="text-[14px] font-semibold text-[#A3660F] underline">
              Use a different video
            </button>
          </div>
        </div>

        <div className={box}>
          <h4 className="mb-2.5 text-[16px] font-bold text-spark-ink">Its style</h4>
          <ul className="flex-1">
            {recipe.map(([k, v], i) => (
              <li key={k} className={`grid grid-cols-[88px_1fr] gap-2.5 py-2 text-[15px] ${i ? "border-t border-spark-rule" : "pt-0"}`}>
                <b className="pt-px text-[12.5px] font-bold uppercase tracking-[0.05em] text-[#A3660F]">{k}</b>
                <span className="text-spark-ink-soft">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border-[1.5px] border-spark-rule bg-white p-4">
        {mode === "render" && picks && (
          <div className="mb-4 flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              {ON_SCREEN.map((o) => (
                <Chip key={o.key} on={picks.onScreen === o.key} onClick={() => setPick("onScreen", o.key)}>{o.label}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip on={picks.shape === "reel"} onClick={() => setPick("shape", "reel")}>Vertical 9:16</Chip>
              <Chip on={picks.shape === "youtube"} onClick={() => setPick("shape", "youtube")}>Horizontal 16:9</Chip>
              <span className="mx-1 w-px self-stretch bg-spark-rule" />
              <Chip on={picks.captions} onClick={() => setPick("captions", !picks.captions)}>
                Captions {picks.captions ? "on" : "off"}
              </Chip>
              <select
                value={picks.music}
                onChange={(e) => setPick("music", e.target.value)}
                aria-label="Music"
                className="rounded-full border border-spark-rule bg-white px-3 py-1.5 text-[13.5px] font-semibold text-spark-ink"
              >
                {MUSIC.map((m) => (
                  <option key={m.id} value={m.id}>{m.id === "none" ? "No music" : `${m.label} music`}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={10}
          className="w-full resize-y rounded-xl border-[1.5px] border-spark-rule px-3.5 py-3 text-[15.5px] leading-[1.65] text-spark-ink-soft focus:outline-none focus:ring-2 focus:ring-spark-amber"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-[13px] text-spark-ink-faint">{words} words</span>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={writeAgain} loading={rewriting} disabled={rewriting || saving}>
              Write it again
            </Button>
            <Button onClick={sparkIt} loading={saving} disabled={!script.trim() || rewriting || saving} className="gap-1.5">
              {mode === "camera" ? "Use this script" : <><Sparkles size={16} /> Spark It</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
