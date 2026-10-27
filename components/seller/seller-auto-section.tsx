"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Play, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Seller Updates on AutoSparks (2026-10-26, the owner's mockup): a settings
 * box, then one card per listing per send day. Numbers → the email is written
 * and a short Avatar in circle video made → watch → Approve, and it sends by
 * itself on its day through BoldTrail.
 */

interface Settings { enabled: boolean; weekday: number; time: string; video: "circle" | "none"; text: boolean }
interface Update {
  update_on: string; views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null; feedback: string | null; next_steps: string | null;
  email: { subjects: string[]; greeting: string; opening: string; paragraphs: string[]; closing: string } | null;
  video_url: string | null; sent_at: string | null;
}
interface CardData {
  id: string; listing_id: string; update_on: string; slot_at: string;
  status: "open" | "making" | "ready" | "approved" | "sent" | "failed";
  mode: "video" | "camera" | "email"; also_text: boolean; error: string | null; sent_at: string | null;
  current: Update | null; before: Update | null;
  video: { id: string; url: string } | "making" | "failed" | null;
}
interface Listing { id: string; address: string; sellers: string[] }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const names = (list: string[]) => list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, out };
}

function Steps({ c }: { c: CardData }) {
  const made = c.status === "ready" || c.status === "approved" || c.status === "sent";
  const steps = [
    { label: "Draft", done: true, now: c.status === "open" || c.status === "failed" },
    { label: c.status === "making" ? "Being made" : "Made", done: made, now: c.status === "making" },
    { label: `Approved · ${when(c.slot_at)}`, done: c.status === "approved" || c.status === "sent", now: false },
    { label: "Sent", done: c.status === "sent", now: false },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-spark-ink-faint">→</span>}
          <span className={`rounded-full border px-2.5 py-0.5 ${s.done && !s.now ? "border-[#bfe3cf] bg-[#e8f5ee] text-[#0f7a52]" : s.now ? "border-[#f1d9b0] bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule text-spark-ink-faint"}`}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

function Num({ label, value, before, onChange }: { label: string; value: string; before: number | null | undefined; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-spark-ink-muted">{label}</span>
      <span className="flex items-center gap-1.5 rounded-[10px] border border-spark-rule bg-white px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-spark-amber">
        <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} className="w-full min-w-0 bg-transparent text-[15px] text-spark-ink outline-none" />
        {before != null && <span className="shrink-0 text-[12px] text-spark-ink-faint">/ {before.toLocaleString()}</span>}
      </span>
    </label>
  );
}

function Card({ c, listing, settings, reload }: { c: CardData; listing?: Listing; settings: Settings; reload: () => void }) {
  const cur = c.current;
  const [v, setV] = useState({
    views: cur?.views?.toString() ?? "", saves: cur?.saves?.toString() ?? "", showings: cur?.showings?.toString() ?? "",
    openHouse: cur?.open_house_visitors?.toString() ?? "", offers: cur?.offers?.toString() ?? "",
    feedback: cur?.feedback ?? "", nextSteps: cur?.next_steps ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const sellers = listing?.sellers ?? [];
  const video = c.video && typeof c.video === "object" ? c.video : null;
  const canApprove = !!cur?.email && (c.mode === "email" || !!video);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action === "write" ? String(extra.mode) : action);
    const r = await post("/api/seller-auto/draft", { draftId: c.id, action, ...extra });
    setBusy(null);
    if (!r.ok) { toast.error(String(r.out.error ?? "Couldn't do that. Try again.")); return null; }
    reload();
    return r.out;
  }

  return (
    <div className="rounded-2xl border border-spark-rule bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-spark-ink-muted">
        <span className="font-bold text-spark-ink">{when(c.slot_at)}</span>
        <span className="rounded-full border border-[#cfe2ec] bg-[#eef5f9] px-2 py-0.5 font-semibold text-spark-blue">Seller update</span>
        {sellers.length > 0 && <span>to {names(sellers)} · BoldTrail</span>}
      </div>
      <p className="mt-1.5 text-base font-semibold leading-snug text-spark-ink">{listing?.address ?? "Listing"}</p>
      <div className="mt-2"><Steps c={c} /></div>

      {(c.status === "open" || c.status === "failed") && !canApprove && (
        <div className="mt-3">
          <p className="mb-1.5 text-[13px] text-spark-ink-muted">This week&apos;s numbers <span className="text-spark-ink-faint">(last week in grey, all optional)</span></p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Num label="Views" value={v.views} before={c.before?.views} onChange={(x) => setV({ ...v, views: x })} />
            <Num label="Saves" value={v.saves} before={c.before?.saves} onChange={(x) => setV({ ...v, saves: x })} />
            <Num label="Showings" value={v.showings} before={c.before?.showings} onChange={(x) => setV({ ...v, showings: x })} />
            <Num label="Open house" value={v.openHouse} before={c.before?.open_house_visitors} onChange={(x) => setV({ ...v, openHouse: x })} />
            <Num label="Offers" value={v.offers} before={c.before?.offers} onChange={(x) => setV({ ...v, offers: x })} />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">What buyers said</span>
              <textarea rows={2} value={v.feedback} onChange={(e) => setV({ ...v, feedback: e.target.value })} className="w-full resize-none rounded-[10px] border border-spark-rule px-2.5 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-spark-amber" />
            </label>
            <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">Next steps</span>
              <textarea rows={2} value={v.nextSteps} onChange={(e) => setV({ ...v, nextSteps: e.target.value })} className="w-full resize-none rounded-[10px] border border-spark-rule px-2.5 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-spark-amber" />
            </label>
          </div>
          {c.error && <p className="mt-2 text-[13px] text-red-600">{c.error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {settings.video === "circle" && (
              <Button size="sm" loading={busy === "video"} onClick={() => void act("write", { mode: "video", ...v })}>Write it &amp; make video</Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" loading={busy === "camera"} onClick={async () => {
              const out = await act("camera");
              if (out?.href) window.location.href = String(out.href);
            }}><Camera size={13} /> Record it myself · unlimited</Button>
            <Button size="sm" variant={settings.video === "circle" ? "outline" : "primary"} loading={busy === "email"} onClick={() => void act("write", { mode: "email", ...v })}>Email only</Button>
            <Button size="sm" variant="ghost" loading={busy === "skip"} onClick={() => void act("skip")}>Skip this week</Button>
          </div>
          {c.mode === "camera" && (
            <p className="mt-2 text-[13px] text-spark-ink-muted">
              Recording it yourself: <Link href={`/tools?tab=seller&listing=${c.listing_id}&on=${c.update_on}`} className="font-semibold text-spark-blue underline">open it in Spark Tools</Link>, write the email and record the video there, then come back to approve it.
            </p>
          )}
        </div>
      )}

      {c.status === "making" && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Making your video, about 5–10 minutes. Watch it here when it&apos;s done.
        </p>
      )}

      {(c.status === "ready" || ((c.status === "open" || c.status === "failed") && canApprove)) && (
        <div className="mt-3">
          {c.error && <p className="mb-2 text-[13px] text-red-600">{c.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {video && <a href={video.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button></a>}
            <Button size="sm" variant="outline" onClick={() => setPreview((p) => !p)}>{preview ? "Hide email" : "Preview email"}</Button>
            <Button size="sm" variant="outline" loading={busy === "reopen"} onClick={() => void act("reopen")}>Edit numbers</Button>
            <Button size="sm" loading={busy === "approve"} onClick={() => void act("approve")}>Approve to send</Button>
          </div>
          <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-900">
            Approve and it sends by itself on {when(c.slot_at)} to {names(sellers) || "the sellers"} through BoldTrail{c.also_text ? ", with a text" : ""}.{" "}
            <strong>Don&apos;t send it yourself</strong> from Spark Tools, or they get it twice.
          </p>
        </div>
      )}

      {preview && cur?.email && (
        <div className="mt-3 rounded-xl border border-dashed border-spark-rule p-3.5 text-[14px] leading-relaxed text-spark-ink">
          <p className="font-semibold">{cur.email.subjects[0]}</p>
          <p className="mt-2">{cur.email.greeting}</p>
          <p className="mt-1">{cur.email.opening}</p>
          {cur.email.paragraphs.map((p, i) => <p key={i} className="mt-1">{p}</p>)}
          <p className="mt-1">{cur.email.closing}</p>
          <p className="mt-2 text-[12px] text-spark-ink-faint">The numbers{video || cur.video_url ? ", the video" : ""} and your sign-off are added as in Spark Tools&apos; preview.</p>
        </div>
      )}

      {c.status === "approved" && (
        <div className="mt-3 rounded-xl border border-spark-rule bg-[#faf9f5] px-3.5 py-3 text-[13px] text-spark-ink-soft">
          Sends by itself on {when(c.slot_at)} to {names(sellers) || "the sellers"} through BoldTrail{c.also_text ? ", with a text" : ""}. Don&apos;t send it yourself.
          <div className="mt-2 flex flex-wrap gap-2">
            {video && <a href={video.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button></a>}
            <Button size="sm" variant="outline" loading={busy === "unapprove"} onClick={() => void act("unapprove")}>Stop it sending</Button>
          </div>
        </div>
      )}

      {c.status === "sent" && (
        <p className="mt-3 text-[13px] font-medium text-[#0f7a52]">✓ Sent {c.sent_at ? when(c.sent_at) : ""}{sellers.length ? ` · ${names(sellers)}` : ""}</p>
      )}
    </div>
  );
}

type SectionData = { settings: Settings; boldtrail: boolean; listings: Listing[]; cards: CardData[] };

export function SellerAutoSection({ preview }: { /** Shown as is (screenshots). */ preview?: SectionData } = {}) {
  const [data, setData] = useState<SectionData | null>(preview ?? null);
  const [paidOnly, setPaidOnly] = useState(false);

  const load = useCallback(async () => {
    if (preview) return;
    const res = await fetch("/api/seller-auto");
    if (!res.ok) return;
    const out = await res.json();
    if (out.paidOnly) { setPaidOnly(true); return; }
    setData(out);
  }, [preview]);
  useEffect(() => { void load(); }, [load]);
  // Watch videos being made.
  useEffect(() => {
    if (!data?.cards.some((c) => c.status === "making")) return;
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, [data, load]);

  if (paidOnly || !data) return null;
  // Nothing to show until there is a listing.
  if (!data.listings.length) return null;
  const { settings } = data;

  async function save(patch: Partial<Settings>) {
    setData((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d));
    const r = await post("/api/seller-auto", patch);
    if (!r.ok) toast.error(String(r.out.error ?? "Couldn't save that."));
    void load();
  }

  const select = "rounded-lg border border-spark-rule bg-white px-2 py-1 text-[14px] font-semibold text-spark-ink";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-spark-ink-faint">Seller updates</p>
      <div className="rounded-2xl border border-spark-rule bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[17px] font-bold text-spark-ink">Seller updates</p>
          <button type="button" onClick={() => void save({ enabled: !settings.enabled })}
            className={`rounded-lg border px-3 py-1 text-[14px] font-semibold ${settings.enabled ? "border-[#f1d9b0] bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule text-spark-ink-muted"}`}>
            {settings.enabled ? "On" : "Off"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] text-spark-ink-muted">
          <span>Every</span>
          <select className={select} value={settings.weekday} onChange={(e) => void save({ weekday: Number(e.target.value) })}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <span>at</span>
          <input type="time" className={select} value={settings.time} onChange={(e) => e.target.value && void save({ time: e.target.value })} />
          <span>·</span>
          <span>Video:</span>
          <select className={select} value={settings.video} onChange={(e) => void save({ video: e.target.value as Settings["video"] })}>
            <option value="circle">Avatar in circle</option>
            <option value="none">Email only</option>
          </select>
          <span>·</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={settings.text} onChange={(e) => void save({ text: e.target.checked })} className="size-4 accent-spark-amber" />
            Also text the sellers
          </label>
        </div>
        <p className="mt-2 text-[13px] text-spark-ink-faint">
          Listings:{" "}
          {data.listings.map((l, i) => (
            <span key={l.id}>
              {i > 0 && " · "}
              {l.address}{" "}
              {l.sellers.length
                ? <span className="text-[#0f7a52]">✓ sellers added</span>
                : <Link href={`/tools?tab=seller&listing=${l.id}`} className="rounded-md border border-spark-rule px-2 py-0.5 font-semibold text-spark-ink">Add sellers</Link>}
            </span>
          ))}
        </p>
        {!data.boldtrail && (
          <p className="mt-2 text-[13px] text-amber-800">Connect BoldTrail in <Link href="/settings#crm" className="font-semibold underline">Settings</Link> so these can send.</p>
        )}
        {settings.enabled && settings.video === "circle" && (
          <p className="mt-1 text-[12.5px] text-spark-ink-faint">The video uses 1 short video per listing each week. Recording it yourself is unlimited.</p>
        )}
      </div>
      {settings.enabled && data.cards.map((c) => (
        <Card key={`${c.id}-${c.status}`} c={c} listing={data.listings.find((l) => l.id === c.listing_id)} settings={settings} reload={() => void load()} />
      ))}
    </div>
  );
}
