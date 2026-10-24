"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { FieldMic } from "@/components/ui/field-mic";

/**
 * Digital Twin backgrounds (2026-10-24, the owner's mockup): the agent's
 * saved backgrounds, Describe your background, the town photo, a listing's
 * front photo, and a color. One component for the editor's Video setup
 * (pick for this video) and Settings (pick the default, rename, delete, and
 * the Wide videos choice).
 */

export type TwinBgChoice =
  | { type: "saved"; id: string }
  | { type: "color"; value: string }
  | { type: "circle" };

interface Bg { id: string; name: string; kind: string; wide_url: string; tall_url: string | null }

const COLORS = ["#E9E3D6", "#F1EFE8", "#BA7517", "#1B5E82", "#2C2C2A", "#FFFFFF"];
const IDEAS = ["Modern office", "Cozy living room", "Downtown street", "Kitchen with an island", "Front porch"];

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/avatar/twin-backgrounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error || "Something went wrong.");
  return out as Record<string, unknown>;
}

/** The background behind a person outline, for the editor's preview. */
function Preview({ choice, bgs }: { choice: TwinBgChoice | null; bgs: Bg[] }) {
  const saved = choice?.type === "saved" ? bgs.find((b) => b.id === choice.id) : null;
  const color = choice?.type === "color" ? choice.value : "#E9E3D6";
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-spark-rule"
      style={saved ? { backgroundImage: `url(${saved.wide_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: color }}>
      <svg viewBox="0 0 160 90" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g fill="rgba(0,0,0,0.28)">
          <circle cx="80" cy="32" r="11" />
          <path d="M56 90 C56 62 66 50 80 50 C94 50 104 62 104 90 Z" />
        </g>
      </svg>
      <span className="absolute bottom-1.5 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">You stand here, full height</span>
    </div>
  );
}

export function TwinBackgrounds({
  mode, value, onChange, orientation = "landscape", city, state, projectId, hasListing,
}: {
  /** "pick" in Video setup; "manage" in Settings. */
  mode: "pick" | "manage";
  value?: TwinBgChoice | null;
  onChange?: (c: TwinBgChoice) => void;
  orientation?: "landscape" | "portrait";
  city?: string | null;
  state?: string | null;
  projectId?: string;
  hasListing?: boolean;
}) {
  const [bgs, setBgs] = useState<Bg[]>([]);
  const [wideMode, setWideMode] = useState<"background" | "circle">("background");
  const [defaultBg, setDefaultBg] = useState<TwinBgChoice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/avatar/twin-backgrounds");
    if (res.ok) {
      const b = await res.json();
      setBgs(b.backgrounds ?? []);
      setWideMode(b.mode === "circle" ? "circle" : "background");
      setDefaultBg(b.defaultBg ?? null);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // In Video setup, start on the agent's default.
  useEffect(() => {
    if (mode === "pick" && !value && defaultBg && onChange) onChange(defaultBg);
  }, [mode, value, defaultBg, onChange]);

  const current = mode === "pick" ? value ?? null : defaultBg;
  const choose = async (c: TwinBgChoice) => {
    if (mode === "pick") { onChange?.(c); return; }
    setDefaultBg(c);
    try { await call({ action: "settings", defaultBg: c }); toast.success("Default background saved."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save that."); void load(); }
  };

  async function make(action: "describe" | "town" | "listing", prompt?: string) {
    setBusy(action);
    try {
      const out = await call({ action, prompt, city, state, projectId, orientation });
      const bg = out.background as Bg;
      setBgs((list) => [bg, ...list]);
      await choose({ type: "saved", id: bg.id });
      setDescribing(false); setText("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make it."); }
    finally { setBusy(null); }
  }

  if (!loaded) return <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-spark-amber" /></div>;

  const isOn = (c: TwinBgChoice) =>
    !!current && current.type === c.type
    && (c.type === "saved" ? (current as { id: string }).id === c.id : c.type === "color" ? (current as { value: string }).value === c.value : true);

  return (
    <div className="flex flex-col gap-3">
      {mode === "manage" && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-spark-ink-muted">Wide videos</p>
          <div className="flex flex-wrap gap-2">
            {([["background", "Me on my background"], ["circle", "Avatar in circle"]] as const).map(([m, label]) => (
              <button key={m} type="button"
                onClick={async () => { setWideMode(m); try { await call({ action: "settings", mode: m }); } catch { void load(); } }}
                className={`rounded-xl border px-3 py-1.5 text-[13.5px] font-semibold ${wideMode === m ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-spark-ink-muted">{mode === "manage" ? "Your backgrounds" : "Background"}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {bgs.map((b) => (
            <div key={b.id} className="group relative">
              <button type="button" onClick={() => void choose({ type: "saved", id: b.id })}
                className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 ${isOn({ type: "saved", id: b.id }) ? "border-spark-amber shadow-[0_0_0_2px_#fbeacc]" : "border-transparent"}`}
                style={{ backgroundImage: `url(${b.wide_url})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/55 px-1.5 py-0.5 text-left text-[11px] font-semibold text-white">
                  {mode === "manage" && isOn({ type: "saved", id: b.id }) ? "★ " : ""}{b.name}
                </span>
              </button>
              {mode === "manage" && (
                <button type="button" aria-label={`Delete ${b.name}`}
                  onClick={async () => {
                    if (!window.confirm(`Delete "${b.name}"?`)) return;
                    try { await call({ action: "delete", id: b.id }); setBgs((l) => l.filter((x) => x.id !== b.id)); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete it."); }
                  }}
                  className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-red-600 group-hover:block">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setDescribing((d) => !d)}
            className="flex aspect-video items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-spark-rule bg-[#faf9f5] text-[13px] font-semibold text-spark-ink-muted hover:border-spark-amber">
            <Plus size={14} /> Describe
          </button>
        </div>
      </div>

      {describing && (
        <div className="rounded-xl border border-spark-rule bg-white p-3">
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) void make("describe", text.trim()); }}
              placeholder="A bright living room with big windows and plants"
              className="min-w-0 flex-1 rounded-xl border border-spark-rule px-3 py-2 text-[15px] text-spark-ink outline-none focus:border-spark-amber" />
            <FieldMic onTranscript={(t) => setText((s) => (s ? `${s} ${t}` : t))} title="Say the place" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button key={i} type="button" onClick={() => setText(i)}
                className="rounded-full border border-spark-rule bg-white px-2.5 py-1 text-xs text-spark-ink-muted hover:border-spark-amber">{i}</button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={!text.trim() || !!busy} onClick={() => void make("describe", text.trim())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-spark-amber px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "describe" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Make it
            </button>
            <span className="text-xs text-spark-ink-faint">About 20 seconds. No people or words.</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {city && (
          <button type="button" disabled={!!busy} onClick={() => void make("town")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-[13px] font-semibold text-spark-ink-soft hover:border-spark-amber disabled:opacity-50">
            {busy === "town" && <Loader2 size={13} className="animate-spin" />} Town photo · {city}
          </button>
        )}
        {hasListing && projectId && (
          <button type="button" disabled={!!busy} onClick={() => void make("listing")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-[13px] font-semibold text-spark-ink-soft hover:border-spark-amber disabled:opacity-50">
            {busy === "listing" && <Loader2 size={13} className="animate-spin" />} Listing front photo
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-spark-ink-muted">Or a color</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => void choose({ type: "color", value: c })}
              className={`h-8 w-8 rounded-full border-2 border-white ${isOn({ type: "color", value: c }) ? "ring-2 ring-spark-amber" : "ring-1 ring-spark-rule"}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>

      {mode === "pick" && <Preview choice={current} bgs={bgs} />}
    </div>
  );
}
