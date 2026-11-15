"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Upload, Wand2, X } from "lucide-react";
import { downloadAsset } from "@/lib/utils/video-url";
import { currentUserId, uploadVideoPhoto } from "@/lib/utils/upload-photo";

/**
 * Photo Touch-Up (2026-11-15, the owner's approved mockup,
 * docs/mockups/gemini-five-mockup.html #6). In Spark Tools, and as a panel
 * from the wand on a listing photo (`onUse` then puts the result in place).
 */

type Mode = "stage" | "declutter" | "twilight" | "sky";
const MODES: { id: Mode; label: string }[] = [
  { id: "stage", label: "Stage room" },
  { id: "declutter", label: "Declutter" },
  { id: "twilight", label: "Twilight" },
  { id: "sky", label: "Blue sky" },
];
const STYLES = ["Modern", "Farmhouse", "Coastal", "Traditional"];

export interface TouchupListing { id: string; title: string; photoUrls: string[] }

interface Info { ready: boolean; paid: boolean; limit: number | null; left: number | null }

function Chip({ on, onClick, children, soft }: { on: boolean; onClick: () => void; children: React.ReactNode; soft?: boolean }) {
  const onCls = soft ? "border-[#f1d9b0] bg-spark-amber-tint text-spark-amber" : "border-brand-text bg-brand-text text-white";
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${on ? onCls : "border-slate-200 bg-white text-slate-600"}`}>
      {children}
    </button>
  );
}

export function PhotoTouchup({ initialUrl, listings = [], onUse, onClose }: {
  initialUrl?: string;
  listings?: TouchupListing[];
  onUse?: (url: string) => void;
  onClose?: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<Mode>("stage");
  const [style, setStyle] = useState("Modern");
  const [label, setLabel] = useState(true);
  const [source, setSource] = useState(initialUrl ?? "");
  const [listingId, setListingId] = useState(listings[0]?.id ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/tools/photo-touchup").then((r) => r.json()).then((d) => setInfo(d as Info)).catch(() => setInfo(null));
  }, []);

  const listing = listings.find((l) => l.id === listingId) ?? null;

  async function upload(f: File) {
    setUploading(true);
    try {
      const { url } = await uploadVideoPhoto(f, await currentUserId());
      setSource(url); setResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload it.");
    } finally { setUploading(false); }
  }

  async function run() {
    if (!source) return toast.error("Pick a photo first.");
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/tools/photo-touchup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: source, mode, style, label }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Couldn't touch up this photo.");
      setResult(b.url);
      setInfo((i) => (i ? { ...i, left: b.left ?? i.left } : i));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't touch up this photo.");
    } finally { setBusy(false); }
  }

  async function saveToListing() {
    if (!result || !listing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tools/photo-touchup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", projectId: listing.id, url: result, replace: source }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Couldn't save it.");
      toast.success("Saved to the listing.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save it.");
    } finally { setBusy(false); }
  }

  if (info && !info.paid) {
    return <p className="text-sm text-slate-500">Photo Touch-Up comes with a SparkReels plan.</p>;
  }

  const outOf = info?.limit != null && info.left != null ? `${info.left} of ${info.limit} left this month` : "";

  return (
    <div className="space-y-4">
      {onClose && (
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-brand-text"><Wand2 size={16} /> Photo Touch-Up</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => <Chip key={m.id} on={mode === m.id} onClick={() => { setMode(m.id); setResult(null); }}>{m.label}</Chip>)}
      </div>
      {mode === "stage" && (
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => <Chip key={s} soft on={style === s} onClick={() => { setStyle(s); setResult(null); }}>{s}</Chip>)}
        </div>
      )}

      {/* Pick a photo: from a listing, or upload one. Hidden when opened on one photo. */}
      {!initialUrl && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {listings.length > 0 && (
              <select
                value={listingId} onChange={(e) => { setListingId(e.target.value); setSource(""); setResult(null); }}
                className="min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            )}
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {uploading ? "Uploading…" : "Upload a photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </div>
          {listing && listing.photoUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {listing.photoUrls.map((u) => (
                <button
                  key={u} type="button" onClick={() => { setSource(u); setResult(null); }} aria-pressed={source === u}
                  className={`aspect-video overflow-hidden rounded-lg border-2 ${source === u ? "border-amber-500" : "border-transparent hover:border-slate-300"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Before and after, even columns. */}
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {source
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={source} alt="Before" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center text-sm text-slate-400">Pick a photo</div>}
          <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-bold">Before</span>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {busy && !result
            ? <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Working…</div>
            : result
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={result} alt="After" className="h-full w-full object-cover" />
              : <div className="flex h-full items-center justify-center text-sm text-slate-400">After</div>}
          <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-bold">After</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!result ? (
            <button type="button" onClick={run} disabled={busy || !source || !info?.ready || info?.left === 0} className="rounded-xl bg-spark-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Working…" : "Touch it up"}
            </button>
          ) : (
            <>
              {onUse ? (
                <button type="button" onClick={() => onUse(result)} className="rounded-xl bg-spark-amber px-4 py-2 text-sm font-semibold text-white">Use this photo</button>
              ) : listing ? (
                <button type="button" onClick={saveToListing} disabled={busy} className="rounded-xl bg-spark-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save to listing</button>
              ) : null}
              <button type="button" onClick={() => void downloadAsset(result, `touch-up-${mode}`, "jpg").catch(() => window.open(result, "_blank"))} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Download</button>
              <button type="button" onClick={run} disabled={busy || info?.left === 0} className="px-2 text-sm font-semibold text-slate-500 disabled:opacity-50">Try again</button>
            </>
          )}
          <label className="ml-1 flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={label} onChange={(e) => setLabel(e.target.checked)} className="accent-amber-600" />
            {mode === "stage" ? "\"Virtually staged\" label" : "\"Digitally enhanced\" label"}
          </label>
        </div>
        {outOf && <span className="text-sm text-slate-500">{outOf}</span>}
      </div>
    </div>
  );
}
