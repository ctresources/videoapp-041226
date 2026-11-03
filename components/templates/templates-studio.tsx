"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { BackgroundPicker } from "@/components/templates/background-picker";

/**
 * Video templates (2026-11-02, the owner's approved mockup): pick a design,
 * check the words on screen (filled in from the listing and Settings), add
 * photos, see a live preview, then the script, then make. The words stay
 * editable after it's made (My Sparks → Edit the words).
 */
type DesignId = "just_listed" | "luxury" | "market_update" | "neighborhood" | "agent_intro";
interface Field { key: string; label: string; placeholder?: string }
interface Design { id: DesignId; name: string; blurb: string; photos: "listing" | "place" | "none"; fields: Field[]; defaults: Record<string, string> }
interface Listing { id: string; address: string; price: string | number; beds: string | number; baths: string | number; sqft: string | number; photos: string[] }
interface Setup { designs: Design[]; listings: Listing[]; videosLeft: number | null; accent: string; faces?: { twin: boolean; avatar: boolean } }
interface Found { period: string; source: string; sourceUrl: string }

const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F]";
const chip = (on: boolean) => `rounded-xl border px-3.5 py-2 text-[15px] font-semibold ${on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-amber"}`;
/** 160000, "160000" or "$160000" → "$160,000"; anything else as typed. */
const money = (v: string | number) => {
  const s = String(v ?? "").trim();
  return /^\$?\d{4,}$/.test(s) ? `$${Number(s.replace("$", "")).toLocaleString("en-US")}` : s;
};

export function TemplatesStudio() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [design, setDesign] = useState<DesignId>("just_listed");
  const [shape, setShape] = useState<"vertical" | "horizontal">("vertical");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [listingId, setListingId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [script, setScript] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [face, setFace] = useState<"twin" | "avatar">("twin");
  const [lookingUp, setLookingUp] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [bg, setBg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const d = setup?.designs.find((x) => x.id === design) ?? null;
  // The background color travels with the words (fields.bg), kept across designs.
  const words = bg ? { ...fields, bg } : fields;

  useEffect(() => {
    fetch("/api/templates").then((r) => (r.ok ? r.json() : null)).then((s: Setup | null) => {
      if (!s) { toast.error("Couldn't open video templates."); return; }
      setSetup(s);
      setFields(s.designs.find((x) => x.id === "just_listed")?.defaults ?? {});
    }).catch(() => {});
  }, []);

  function pickDesign(id: DesignId) {
    if (!setup) return;
    setDesign(id);
    setScript(null); setMade(null); setFound(null);
    const next = { ...(setup.designs.find((x) => x.id === id)?.defaults ?? {}) };
    // Keep what was already typed for words both designs share.
    for (const k of Object.keys(next)) if (k !== "headline" && fields[k]) next[k] = fields[k];
    setFields(next);
  }

  function pickListing(id: string) {
    setListingId(id);
    const l = setup?.listings.find((x) => x.id === id);
    if (!l) return;
    const price = money(l.price);
    const details = [l.beds && `${l.beds} beds`, l.baths && `${l.baths} baths`, l.sqft && `${Number(l.sqft).toLocaleString("en-US")} sq ft`].filter(Boolean).join(" · ");
    setFields((f) => ({ ...f, address: l.address, price: design === "luxury" && price ? `Offered at ${price}` : price, details }));
    setPhotos(l.photos);
  }

  // The live preview, a moment after the last change.
  useEffect(() => {
    if (!setup) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", design, shape, fields: words, photo: photos[0] ?? null }) });
        if (!r.ok) return;
        const url = URL.createObjectURL(await r.blob());
        setPreview((old) => { if (old) URL.revokeObjectURL(old); return url; });
      } finally { setPreviewing(false); }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, design, shape, fields, photos, bg]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, 12 - photos.length)) {
        if (file.size > 12 * 1024 * 1024) { toast.error(`${file.name} is over 12 MB.`); continue; }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const p = `${user.id}/templates/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await sb.storage.from("assets").upload(p, file, { upsert: false, contentType: file.type || undefined });
        if (error) { toast.error("Couldn't upload a photo."); continue; }
        added.push(sb.storage.from("assets").getPublicUrl(p).data.publicUrl);
      }
      setPhotos((ps) => [...ps, ...added].slice(0, 12));
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function writeScript() {
    setWriting(true); setMade(null);
    try {
      const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "script", design, shape, fields }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(out.error || "Couldn't write the script."); return; }
      setScript(out.script);
    } finally { setWriting(false); }
  }

  async function lookUpNumbers() {
    setLookingUp(true);
    try {
      const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "numbers", design, shape, fields }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(out.error || "Couldn't look up the numbers."); return; }
      const n = out.numbers as Record<string, string>;
      setFields((f) => ({
        ...f, s1: n.s1, s1c: n.s1c, s2: n.s2, s2c: n.s2c, s3: n.s3, s3c: n.s3c,
        // The month the numbers are for, not this month.
        ...(n.period ? { headline: `Market Update · ${n.period.replace(/\s+\d{4}$/, "")}` } : {}),
      }));
      setFound({ period: n.period, source: n.source, sourceUrl: n.sourceUrl });
      setScript(null);
    } finally { setLookingUp(false); }
  }

  async function make() {
    if (!window.confirm("Make this video? It uses 1 short video from your plan.")) return;
    setMaking(true);
    try {
      const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make", design, shape, fields: words, photos, script, face }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(out.error || "Couldn't make the video."); return; }
      setMade(out.videoId);
      toast.success("Your video is being made.");
    } finally { setMaking(false); }
  }

  if (!setup || !d) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-spark-amber" /></div>;
  const needsPhotos = d.photos === "listing" && photos.length === 0;
  const needsNumbers = d.id === "market_update" && !["s1", "s2", "s3"].some((k) => (fields[k] ?? "").trim());
  const blocked = needsPhotos ? "Add a photo of the home first." : needsNumbers ? "Add at least one number first." : null;

  return (
    <div className="w-full">
      <h1 className="mb-4 text-[26px] font-bold text-spark-ink">Video templates</h1>

      {/* The five designs */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {setup.designs.map((x) => (
          <button key={x.id} type="button" onClick={() => pickDesign(x.id)}
            className={`rounded-xl border-2 px-3 py-3 text-left ${design === x.id ? "border-spark-amber bg-white shadow-[0_0_0_3px_#fbeacc]" : "border-spark-rule bg-white hover:border-spark-amber"}`}>
            <b className="block text-[16px] text-spark-ink">{x.name}</b>
            <span className="mt-0.5 block text-[13px] leading-snug text-spark-ink-muted">{x.blurb}</span>
          </button>
        ))}
      </div>

      {/* Two columns, even: the words and photos | the preview and script. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <section className="flex h-full flex-col rounded-2xl border border-spark-rule bg-white p-4">
          {d.photos === "listing" && setup.listings.length > 0 && (
            <>
              <label className="mb-1 block text-[14px] font-semibold text-spark-ink-soft">From a saved listing</label>
              <select className={`${input} mb-3`} value={listingId} onChange={(e) => pickListing(e.target.value)}>
                <option value="">Pick a listing (optional)</option>
                {setup.listings.map((l) => <option key={l.id} value={l.id}>{l.address}</option>)}
              </select>
            </>
          )}
          <p className="mb-1 text-[17px] font-bold text-spark-ink">Words on screen</p>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {d.fields.map((f) => (
              <Fragment key={f.key}>
                {/* Look up numbers sits right above the three numbers (2026-11-03). */}
                {d.id === "market_update" && f.key === "s1" && (
                  <div className="mt-3 sm:col-span-2">
                    <button type="button" onClick={() => void lookUpNumbers()} disabled={lookingUp} className={chip(false)}>
                      {lookingUp ? <Loader2 size={15} className="mr-1.5 inline animate-spin" /> : null}Look up numbers
                    </button>
                    {found && (
                      <p className="mt-1.5 text-[13px] text-spark-ink-muted">
                        {found.period && <>For {found.period}. </>}Source: {found.sourceUrl
                          ? <a href={found.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#A3660F] underline">{found.source || "open"}</a>
                          : found.source || "not given"}. Check them before you make the video.
                      </p>
                    )}
                  </div>
                )}
                <label className={`block ${d.id === "market_update" && /^s\d/.test(f.key) ? "" : "sm:col-span-2"}`}>
                  <span className="mb-1 mt-2 block text-[14px] font-semibold text-spark-ink-soft">{f.label}</span>
                  <input className={input} value={fields[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                </label>
              </Fragment>
            ))}
          </div>

          {d.photos !== "none" && (
            <>
              <p className="mb-1.5 mt-4 text-[17px] font-bold text-spark-ink">{d.photos === "listing" ? "Photos" : "Photo of the place (optional)"}</p>
              <div className="flex flex-wrap gap-2">
                {photos.map((u, i) => (
                  <div key={u + i} className="relative h-16 w-24 overflow-hidden rounded-lg bg-spark-rule">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"><X size={12} /></button>
                  </div>
                ))}
                {photos.length < 12 && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="flex h-16 w-24 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-spark-rule text-[13px] font-semibold text-[#A3660F] hover:border-spark-amber">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />} Add
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
              </div>
              {d.photos === "place" && photos.length === 0 && <p className="mt-1.5 text-[13px] text-spark-ink-muted">None added? A picture of the place is made for you.</p>}
            </>
          )}

          <p className="mb-1.5 mt-4 text-[17px] font-bold text-spark-ink">Shape</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(shape === "vertical")} onClick={() => setShape("vertical")}>Vertical 9:16</button>
            <button type="button" className={chip(shape === "horizontal")} onClick={() => setShape("horizontal")}>Horizontal 16:9</button>
          </div>

          <p className="mb-1.5 mt-4 text-[17px] font-bold text-spark-ink">Background</p>
          <BackgroundPicker value={bg} accent={setup.accent} onChange={setBg} />

          {setup.faces?.twin && setup.faces.avatar && (
            <>
              <p className="mb-1.5 mt-4 text-[17px] font-bold text-spark-ink">On screen</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(face === "twin")} onClick={() => setFace("twin")}>Digital Twin</button>
                <button type="button" className={chip(face === "avatar")} onClick={() => setFace("avatar")}>Avatar</button>
              </div>
            </>
          )}
        </section>

        <section className="flex h-full flex-col rounded-2xl border border-spark-rule bg-white p-4">
          <p className="mb-2 flex items-center gap-2 text-[17px] font-bold text-spark-ink">Preview {previewing && <Loader2 size={15} className="animate-spin text-spark-amber" />}</p>
          <div className={`mx-auto w-full overflow-hidden rounded-xl bg-[#1a1510] ${shape === "vertical" ? "max-w-[300px]" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="Preview" className="block w-full" /> : <div className={shape === "vertical" ? "aspect-[9/16]" : "aspect-video"} />}
          </div>

          {script === null ? (
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
              <Button onClick={() => void writeScript()} loading={writing} disabled={!!blocked}>Next · script</Button>
              <span className="text-[14px] text-spark-ink-muted">{blocked ?? "Uses 1 short video"}</span>
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col">
              <label className="mb-1 block text-[14px] font-semibold text-spark-ink-soft">Script · {script.split(/\s+/).filter(Boolean).length} words</label>
              <textarea rows={6} className={`${input} resize-y`} value={script} onChange={(e) => setScript(e.target.value)} />
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
                {made ? (
                  <p className="text-[15px] font-semibold text-[#0f7a52]">✓ Being made. <Link href={`/videos?highlight=${made}`} className="underline">Watch for it in My Sparks</Link></p>
                ) : (
                  <>
                    <Button onClick={() => void make()} loading={making} disabled={!script.trim() || !!blocked}>Make video</Button>
                    <button type="button" onClick={() => void writeScript()} disabled={writing} className="text-[14px] font-semibold text-[#A3660F] underline">Write it again</button>
                    <span className="text-[14px] text-spark-ink-muted">Uses 1 short video{setup.videosLeft !== null ? ` · you have ${setup.videosLeft}` : ""}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
