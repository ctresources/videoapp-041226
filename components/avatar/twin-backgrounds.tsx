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
  | { type: "circle" }
  // In front of the video's own photos and footage, see-through (2026-10-31).
  | { type: "footage"; layout: "side" | "corner" };

type Layout = "side" | "corner";
type WideMode = "background" | "circle" | "footage";

interface Bg { id: string; name: string; kind: string; wide_url: string; tall_url: string | null }

/** The person outline, where they stand in the frame (viewBox 160×90). */
function Person({ layout }: { layout: "center" | Layout }) {
  const t = layout === "side" ? "translate(38 0)" : layout === "corner" ? "translate(133 40) scale(0.55) translate(-80 0)" : undefined;
  return (
    <g fill="rgba(0,0,0,0.32)" transform={t}>
      <circle cx="80" cy="32" r="11" />
      <path d="M56 90 C56 62 66 50 80 50 C94 50 104 62 104 90 Z" />
    </g>
  );
}

/** Side / Corner, with a little picture of each (the owner's mockup, 2026-10-31). */
function LayoutChips({ value, onPick }: { value: Layout; onPick: (l: Layout) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {([["side", "Side"], ["corner", "Corner"]] as const).map(([l, label]) => (
        <button key={l} type="button" onClick={() => onPick(l)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13.5px] font-semibold ${value === l ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft"}`}>
          <svg viewBox="0 0 26 15" className="h-[15px] w-[26px]" aria-hidden="true">
            <rect x=".5" y=".5" width="25" height="14" rx="2" fill="#e9e3d6" stroke="currentColor" />
            {l === "side"
              ? <rect x="17" y="3" width="6" height="12" rx="2" fill="currentColor" />
              : <rect x="19" y="8" width="4" height="7" rx="1.5" fill="currentColor" />}
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Stand-in for the photos and clips, which aren't known until the render. */
const FOOTAGE_BG = "linear-gradient(135deg, #5b7083 0%, #a39a86 45%, #d9cdb4 100%)";

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
  const footage = choice?.type === "footage" ? choice.layout : null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-spark-rule"
      style={footage ? { background: FOOTAGE_BG }
        : saved ? { backgroundImage: `url(${saved.wide_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: color }}>
      <svg viewBox="0 0 160 90" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <Person layout={footage ?? "center"} />
      </svg>
      <span className="absolute bottom-1.5 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">
        {footage ? "Your photos and clips play behind you" : "You stand here, full height"}
      </span>
    </div>
  );
}

export function TwinBackgrounds({
  mode, value, onChange, orientation = "landscape", city, state, projectId, hasListing, allowFootage = false,
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
  /** Offer "Photos & footage" (short videos only; the server holds to it too). */
  allowFootage?: boolean;
}) {
  const [bgs, setBgs] = useState<Bg[]>([]);
  const [wideMode, setWideMode] = useState<WideMode>("background");
  const [footageLayout, setFootageLayout] = useState<Layout>("side");
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
      setWideMode(b.mode === "circle" || b.mode === "footage" ? b.mode : "background");
      setFootageLayout(b.footageLayout === "corner" ? "corner" : "side");
      setDefaultBg(b.defaultBg ?? null);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // In Video setup, start on the agent's default: their footage choice when
  // Wide videos says so and this video can have it, else their background.
  useEffect(() => {
    if (mode !== "pick" || value || !onChange || !loaded) return;
    if (wideMode === "footage" && allowFootage) onChange({ type: "footage", layout: footageLayout });
    else if (defaultBg) onChange(defaultBg);
  }, [mode, value, defaultBg, onChange, loaded, wideMode, allowFootage, footageLayout]);

  // A footage pick left over when the video changes to one that can't have it.
  useEffect(() => {
    if (mode === "pick" && value?.type === "footage" && !allowFootage && defaultBg && onChange) onChange(defaultBg);
  }, [mode, value, allowFootage, defaultBg, onChange]);

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
            {([["footage", "Me on my footage"], ["background", "Me on my background"], ["circle", "Avatar in circle"]] as const).map(([m, label]) => (
              <button key={m} type="button"
                onClick={async () => { setWideMode(m); try { await call({ action: "settings", mode: m }); } catch { void load(); } }}
                className={`rounded-xl border px-3 py-1.5 text-[13.5px] font-semibold ${wideMode === m ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft"}`}>
                {label}
              </button>
            ))}
          </div>
          {wideMode === "footage" && (
            <div className="mt-3">
              <p className="mb-1.5 text-[13px] font-semibold text-spark-ink-muted">Where you stand</p>
              <LayoutChips value={footageLayout} onPick={async (l) => {
                setFootageLayout(l);
                try { await call({ action: "settings", footageLayout: l }); } catch { void load(); }
              }} />
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-spark-ink-muted">{mode === "manage" ? "Your backgrounds" : "Background"}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mode === "pick" && allowFootage && (
            <button type="button"
              onClick={() => void choose({ type: "footage", layout: current?.type === "footage" ? current.layout : footageLayout })}
              className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 ${current?.type === "footage" ? "border-spark-amber shadow-[0_0_0_2px_#fbeacc]" : "border-transparent"}`}
              style={{ background: FOOTAGE_BG }}>
              <svg viewBox="0 0 160 90" className="absolute inset-0 h-full w-full" aria-hidden="true"><Person layout="side" /></svg>
              <span className="absolute left-1.5 top-1.5 rounded-full bg-spark-amber px-1.5 py-px text-[10px] font-bold tracking-wide text-white">NEW</span>
              <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/55 px-1.5 py-0.5 text-left text-[11px] font-semibold text-white">
                Photos &amp; footage
              </span>
            </button>
          )}
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

      {mode === "pick" && current?.type === "footage" && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-spark-ink-muted">Where you stand</p>
          <LayoutChips value={current.layout} onPick={(l) => void choose({ type: "footage", layout: l })} />
        </div>
      )}

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
