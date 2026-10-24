"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HALO_KINDS } from "@/lib/halo/kinds";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import type { PromoAngle } from "@/lib/halo";
import type { Halo } from "@/components/halo/use-halo";

/**
 * The Halo sites box on the AutoSparks page (2026-10-24, the owner's mockup):
 * the agent's websites, and the defaults for every Halo video.
 */

export const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", google_business: "Google Business",
  linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads",
};
export const PLATFORM_ORDER = ["facebook", "instagram", "youtube", "google_business", "linkedin", "tiktok", "x", "threads"];
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const ANGLES: { id: PromoAngle; label: string }[] = [
  { id: "why", label: "Why I use Halo" },
  { id: "free", label: "Free authority page" },
  { id: "pro", label: "Halo Pro" },
];

export const pill = (on: boolean) =>
  `rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
    on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
  }`;
export const tile = (on: boolean) =>
  `rounded-xl border px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${
    on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-rule-dim"
  }`;
export function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex items-center gap-2 text-xs font-medium text-spark-ink-muted">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-spark-amber" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[110px_1fr] sm:items-start sm:gap-3">
      <span className="text-[13px] font-medium text-spark-ink-muted sm:pt-1.5">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
export function LookPicker({ looks, twinLookId, value, onChange }: {
  looks: Halo["looks"]; twinLookId: string | null; value: string | null; onChange: (id: string | null) => void;
}) {
  if (!looks.length) return <span className="text-[13px] text-spark-ink-faint">Your headshot</span>;
  return (
    <>
      {looks.slice(0, 8).map((l, i) => {
        const on = value ? value === l.id : i === 0;
        return (
          <button key={l.id} type="button" onClick={() => onChange(l.id)} title={l.id === twinLookId ? "Digital Twin" : l.name}
            className={`relative h-11 w-11 overflow-hidden rounded-full border-2 border-white transition-shadow ${on ? "ring-2 ring-spark-amber" : "ring-1 ring-spark-rule"}`}>
            {l.preview_image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={l.preview_image_url} alt="" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center bg-spark-amber-tint text-[10px] font-bold text-[#A3660F]">{l.id === twinLookId ? "Twin" : i + 1}</span>}
            {l.id === twinLookId && <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-center text-[8px] font-bold text-white">TWIN</span>}
          </button>
        );
      })}
    </>
  );
}
export function PlatformPicker({ connected, value, onChange }: { connected: string[] | null; value: string[]; onChange: (v: string[]) => void }) {
  if (connected === null) return <Loader2 size={14} className="animate-spin text-spark-amber" />;
  const list = PLATFORM_ORDER.filter((p) => connected.includes(p));
  if (!list.length) return <a href="/settings/social" className="text-[13px] font-semibold text-spark-blue">Connect your accounts →</a>;
  return (
    <>
      {list.map((p) => {
        const on = value.includes(p);
        return (
          <button key={p} type="button" className={pill(on)} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}>
            {PLATFORM_LABELS[p]}
          </button>
        );
      })}
    </>
  );
}

const host = (u: string) => u.replace(/^https?:\/\//, "");

export function HaloSitesCard({ halo }: { halo: Halo }) {
  const { settings, sites, looks, twinLookId, connected } = halo;
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [promoFor, setPromoFor] = useState<string | null>(null);
  const [angle, setAngle] = useState<PromoAngle>("why");
  const [writing, setWriting] = useState(false);
  if (!settings) return null;
  const s = settings;
  const lastChecked = sites.map((x) => x.last_checked_at).filter((x): x is string => !!x).sort().pop();

  async function add() {
    if (!url.trim()) return;
    setAdding(true);
    const ok = await halo.addSite(url.trim());
    setAdding(false);
    if (ok) setUrl("");
  }

  return (
    <div className="rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-base font-bold text-spark-ink">Halo sites</p>
        <Switch on={s.enabled} onClick={() => void halo.saveSettings({ enabled: !s.enabled })} label={s.enabled ? "On" : "Off"} />
      </div>

      <div className="flex flex-col gap-2">
        {sites.map((site) => (
          <div key={site.id} className="rounded-xl border border-spark-rule px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[15px] text-spark-ink">
              <span className={`h-2 w-2 shrink-0 rounded-full ${site.last_error ? "bg-amber-500" : "bg-green-500"}`} title={site.last_error ?? undefined} />
              <span className="min-w-0 truncate">{host(site.url)}</span>
              {site.is_affiliate && (
                <span className="rounded-full border border-[#f1d9b0] bg-spark-amber-tint px-2 py-0.5 text-[11.5px] font-semibold text-[#A3660F]">Affiliate</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                {site.is_affiliate && (
                  <Button size="sm" onClick={() => setPromoFor(promoFor === site.id ? null : site.id)}>Make promo video</Button>
                )}
                <button type="button" aria-label={`Remove ${host(site.url)}`} className="p-1 text-spark-ink-faint hover:text-spark-ink"
                  onClick={() => { if (window.confirm(`Remove ${host(site.url)}?`)) void halo.removeSite(site.id); }}>
                  <X size={15} />
                </button>
              </span>
            </div>
            {site.last_error && <p className="mt-1 text-xs text-amber-700">{site.last_error}</p>}
            {promoFor === site.id && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-spark-rule pt-3">
                {ANGLES.map((a) => (
                  <button key={a.id} type="button" className={tile(angle === a.id)} onClick={() => setAngle(a.id)}>{a.label}</button>
                ))}
                <Button size="sm" loading={writing} className="ml-auto" onClick={async () => {
                  setWriting(true);
                  const ok = await halo.promo(site.id, angle);
                  setWriting(false);
                  if (ok) setPromoFor(null);
                }}>Write it</Button>
              </div>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder="yoursite.com" inputMode="url"
            className="min-w-0 flex-1 rounded-xl border border-spark-rule px-3 py-2 text-[15px] text-spark-ink outline-none focus:border-spark-amber" />
          <Button variant="outline" size="sm" onClick={() => void add()} loading={adding} className="gap-1"><Plus size={14} /> Add</Button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <Row label="Videos from">
          {HALO_KINDS.map((k) => {
            const on = s.types.includes(k.id);
            return (
              <button key={k.id} type="button" className={pill(on)} aria-pressed={on}
                onClick={() => void halo.saveSettings({ types: on ? s.types.filter((t) => t !== k.id) : [...s.types, k.id] })}>
                {k.label}
              </button>
            );
          })}
        </Row>
        <Row label="Each month">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={pill(s.perMonth === n)} onClick={() => void halo.saveSettings({ perMonth: n })}>{n}</button>
          ))}
        </Row>
        <Row label="Post on">
          <select value={s.weekday} onChange={(e) => void halo.saveSettings({ weekday: Number(e.target.value) })}
            className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-[13px] text-spark-ink outline-none focus:border-spark-amber">
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <span className="text-[13px] text-spark-ink-muted">at</span>
          <select value={s.time} onChange={(e) => void halo.saveSettings({ time: e.target.value })}
            className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-[13px] text-spark-ink outline-none focus:border-spark-amber">
            {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => {
              const v = `${String(h).padStart(2, "0")}:00`;
              return <option key={v} value={v}>{h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}</option>;
            })}
          </select>
        </Row>
        <div className="border-t border-spark-rule" />
        <Row label="Look">
          {([["circle", "Avatar in circle"], ["full", "Avatar video"], ["mix", "Mix"]] as const).map(([v, label]) => (
            <button key={v} type="button" className={tile(s.look === v)} onClick={() => void halo.saveSettings({ look: v })}>{label}</button>
          ))}
        </Row>
        <Row label="Avatar">
          <LookPicker looks={looks} twinLookId={twinLookId} value={s.lookId} onChange={(id) => void halo.saveSettings({ lookId: id })} />
        </Row>
        <Row label="Size">
          <button type="button" className={tile(s.size === "vertical")} onClick={() => void halo.saveSettings({ size: "vertical" })}>Vertical 9:16</button>
          <button type="button" className={tile(s.size === "horizontal")} onClick={() => void halo.saveSettings({ size: "horizontal" })}>Horizontal 16:9</button>
        </Row>
        <Row label="Post to">
          <PlatformPicker connected={connected} value={s.platforms} onChange={(v) => void halo.saveSettings({ platforms: v })} />
        </Row>
        <Row label="Captions">
          <Switch on={s.captions} onClick={() => void halo.saveSettings({ captions: !s.captions })} />
        </Row>
        <Row label="Music">
          <select value={s.music} onChange={(e) => void halo.saveSettings({ music: e.target.value })}
            className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-[13px] text-spark-ink outline-none focus:border-spark-amber">
            {MUSIC_PRESETS.filter((m) => m.id !== "custom").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Row>
        <div className="border-t border-spark-rule" />
        {/* Forwarded emails become drafts too (2026-10-24, the owner's ask). */}
        <Row label="Forwarded emails">
          <Switch on={s.emails} onClick={() => void halo.saveSettings({ emails: !s.emails })} label={s.emails ? "Make drafts" : "Off"} />
        </Row>
      </div>
      {lastChecked && (
        <p className="mt-4 text-[12.5px] text-spark-ink-faint">
          Checked {new Date(lastChecked).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
