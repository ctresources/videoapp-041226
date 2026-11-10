"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Copy, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Halo leads in Settings → CRM (2026-11-09, the owner's approved mockup): the
 * link and secret to paste into Halo's Send to my CRM → Custom webhook, and
 * what to draft for each kind of lead. The drafts show on AutoSparks.
 */

interface Settings {
  enabled: boolean; buyer: "on" | "off"; business: "on" | "off";
  haloLink: string | null; bookingUrl: string | null; lastTestAt: string | null; lastLeadAt: string | null;
}
interface Data { paidOnly?: boolean; settings: Settings; link: string; secret: string }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function CopyRow({ label, value, shown }: { label: string; value: string; shown: string }) {
  return (
    <div className="mt-3">
      <span className="mb-1 block text-[13px] text-spark-ink-muted">{label}</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 truncate rounded-[10px] border border-spark-rule bg-[#faf9f5] px-2.5 py-2 font-mono text-[13px] text-spark-ink-soft">{shown}</code>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
          navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`), () => toast.error("Couldn't copy. Select it and copy instead."));
        }}><Copy size={13} /> Copy</Button>
      </div>
    </div>
  );
}

export function HaloLeadsCard() {
  const [data, setData] = useState<Data | null>(null);
  const [haloLink, setHaloLink] = useState("");
  const [booking, setBooking] = useState("");

  useEffect(() => {
    fetch("/api/halo-leads").then((r) => (r.ok ? r.json() : null)).then((d: Data | null) => {
      if (!d || d.paidOnly) return;
      setData(d);
      setHaloLink(d.settings.haloLink ?? "");
      setBooking(d.settings.bookingUrl ?? "");
    }).catch(() => {});
  }, []);

  if (!data) return null;
  const s = data.settings;

  async function save(patch: Partial<Settings>) {
    setData((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d));
    const res = await fetch("/api/halo-leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error ?? "Couldn't save that."); return; }
    setData((d) => (d ? { ...d, settings: out.settings } : d));
  }

  const select = "rounded-lg border border-spark-rule bg-white px-2 py-1 text-[14px] font-semibold text-spark-ink";
  const input = "w-full rounded-[10px] border border-spark-rule bg-white px-2.5 py-2 text-[14px] text-spark-ink outline-none focus:border-spark-amber";
  const heard = s.lastLeadAt ?? s.lastTestAt;

  return (
    <Card id="halo-leads" className="scroll-mt-28">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-spark-amber-tint">
          <Inbox size={18} className="text-spark-amber" />
        </div>
        <h3 className="flex-1 font-semibold text-brand-text">Halo leads</h3>
        <button type="button" onClick={() => void save({ enabled: !s.enabled })}
          className={`rounded-lg border px-3 py-1 text-[14px] font-semibold ${s.enabled ? "border-[#f1d9b0] bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule text-spark-ink-muted"}`}>
          {s.enabled ? "On" : "Off"}
        </button>
      </div>

      <CopyRow label="Link" value={data.link} shown={data.link} />
      <CopyRow label="Secret" value={data.secret} shown={"•".repeat(20)} />
      <p className="mt-2 text-[12.5px] text-spark-ink-faint">In Halo: Send to my CRM → Custom webhook → paste both → Connect and send a test.</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] text-spark-ink-muted">
        <span>Buyer &amp; seller leads:</span>
        <select className={select} value={s.buyer} onChange={(e) => void save({ buyer: e.target.value as Settings["buyer"] })}>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <span>·</span>
        <span>Business forms:</span>
        <select className={select} value={s.business} onChange={(e) => void save({ business: e.target.value as Settings["business"] })}>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[13px] text-spark-ink-muted">Your Halo link or code</span>
          <input className={input} value={haloLink} placeholder="huzihalo.com/subscribe?affiliate=…"
            onChange={(e) => setHaloLink(e.target.value)}
            onBlur={() => { if (haloLink.trim() !== (s.haloLink ?? "")) void save({ haloLink: haloLink.trim() }); }} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-spark-ink-muted">Booking link</span>
          <input className={input} value={booking} placeholder="calendly.com/…"
            onChange={(e) => setBooking(e.target.value)}
            onBlur={() => { if (booking.trim() !== (s.bookingUrl ?? "")) void save({ bookingUrl: booking.trim() }); }} />
        </label>
      </div>

      {heard
        ? <p className="mt-3 text-[13px] font-semibold text-[#0f7a52]">✓ Connected · {s.lastLeadAt ? "last lead" : "test lead received"} {day(heard)}</p>
        : <p className="mt-3 text-[13px] text-spark-ink-faint">Waiting for Halo&apos;s test.</p>}
    </Card>
  );
}
