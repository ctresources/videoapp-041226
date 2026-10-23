"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

const HELPS = [
  "Buyers", "Sellers", "First-time buyers", "Move-up buyers", "Downsizing",
  "Luxury", "Investors", "Relocation", "New construction", "VA loans",
];

export interface IntroDefaults {
  name?: string | null;
  brokerage?: string | null;
  city?: string | null;
  state?: string | null;
  years?: string | null;
}

/**
 * "About you" for the Agent Intro (2026-10-23, the owner's approved mockup).
 * Filled from Settings, with chips for who they help, two optional personal
 * boxes, an optional profile link and 30 or 60 seconds. Writes the intro and
 * opens it in the editor.
 */
export function AgentIntroPanel({ defaults, onClose }: { defaults: IntroDefaults; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(defaults.name ?? "");
  const [brokerage, setBrokerage] = useState(defaults.brokerage ?? "");
  const [city, setCity] = useState(defaults.city ?? "");
  const [state, setState] = useState(defaults.state ?? "");
  const [years, setYears] = useState(defaults.years ?? "");
  const [helps, setHelps] = useState<string[]>(["Buyers", "Sellers"]);
  const [different, setDifferent] = useState("");
  const [about, setAbout] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [seconds, setSeconds] = useState<30 | 60>(30);
  const [busy, setBusy] = useState(false);

  async function write() {
    if (!name.trim() || !city.trim()) { toast.error("Add your name and the area you serve."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/ai/agent-intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brokerage, city, state, years, helps, different, about, profileUrl, seconds }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.projectId) throw new Error(d.error || "Couldn't write your intro.");
      router.push(`/create/${d.projectId}?source=paste`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write your intro.");
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-spark-rule bg-white px-3 py-2 text-[14px] text-spark-ink focus:border-spark-amber focus:outline-none";
  const label = "mb-1 block text-[12px] font-bold text-spark-ink";
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink hover:border-spark-rule-dim"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => !busy && onClose()}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-[19px] font-bold text-spark-ink">👋 Agent Intro</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-spark-ink-muted hover:text-spark-ink"><X size={18} /></button>
        </div>
        <p className="mb-4 text-[13.5px] text-spark-ink-muted">Meet you before the first call. Filled in from Settings; change anything.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className={label}>Brokerage</span><input className={field} value={brokerage} onChange={(e) => setBrokerage(e.target.value)} /></label>
          <label className="block"><span className={label}>Area you serve</span>
            <span className="flex gap-2">
              <input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City or town" />
              <input className={`${field} w-20`} value={state} onChange={(e) => setState(e.target.value)} placeholder="ST" />
            </span>
          </label>
          <label className="block"><span className={label}>Years in real estate</span><input className={field} value={years} onChange={(e) => setYears(e.target.value)} inputMode="numeric" /></label>
        </div>

        <p className={`${label} mt-4`}>Who you help most</p>
        <div className="flex flex-wrap gap-1.5">
          {HELPS.map((h) => (
            <button key={h} type="button" aria-pressed={helps.includes(h)} className={chip(helps.includes(h))}
              onClick={() => setHelps((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]))}>
              {h}
            </button>
          ))}
        </div>

        <label className="mt-4 block"><span className={label}>What makes you different <span className="font-normal text-spark-ink-faint">· optional</span></span>
          <textarea className={`${field} min-h-[64px]`} value={different} onChange={(e) => setDifferent(e.target.value)} placeholder="e.g. I answer texts nights and weekends, and I walk every home with a contractor's eye." />
        </label>
        <label className="mt-3 block"><span className={label}>A little about you <span className="font-normal text-spark-ink-faint">· optional, makes it sound like you</span></span>
          <textarea className={`${field} min-h-[64px]`} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="e.g. Grew up here, coach youth soccer, love the Saturday farmers market." />
        </label>
        <label className="mt-3 block"><span className={label}>Your profile link <span className="font-normal text-spark-ink-faint">· optional, we read it for reviews, sales and specialties</span></span>
          <input className={field} value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="zillow.com/profile/… or your website" inputMode="url" />
        </label>

        <p className={`${label} mt-4`}>Length</p>
        <div className="flex gap-2">
          {([30, 60] as const).map((s) => (
            <button key={s} type="button" aria-pressed={seconds === s} className={chip(seconds === s)} onClick={() => setSeconds(s)}>
              {s} seconds
            </button>
          ))}
        </div>

        <button type="button" disabled={busy} onClick={() => void write()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl spark-cta-gradient px-5 py-3 text-[15px] font-bold text-white disabled:opacity-60">
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Writing your intro…" : "Write my intro →"}
        </button>
      </div>
    </div>
  );
}
