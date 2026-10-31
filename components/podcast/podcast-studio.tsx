"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowDownUp, Loader2, Mic, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LookPicker } from "@/components/halo/halo-sites-card";

/**
 * Spark Podcast, step 1 (2026-10-30, the owner's approved mockup): source →
 * hosts → the conversation, edited line by line → Make episode. Behind the
 * "spark_podcast" switch (app/(dashboard)/podcast/page.tsx).
 */

type Source = "topic" | "url" | "spark" | "text";
interface Turn { speaker: "host" | "guest"; text: string }
interface CoHost { id: string; name: string; image: string | null; gender: string | null }
interface Setup {
  coHosts: CoHost[]; sets: { id: string; label: string; url: string }[];
  sparks: { id: string; title: string; createdAt: string }[];
  name: string | null; city: string | null; state: string | null; videosLeft: number | null; cost: number;
}
type LookItem = { id: string; name: string; preview_image_url: string | null; status: string | null; shape?: "landscape" | "portrait" | "square" | null };

const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14.5px]";
const chip = (on: boolean) => `rounded-xl border px-3 py-1.5 text-[13.5px] font-semibold ${on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-amber"}`;
const FEELS = [["chat", "Friendly chat"], ["interview", "Expert interview"], ["myths", "Myth vs fact"], ["qa", "Q&A"]] as const;
const words = (t: Turn[]) => t.reduce((n, x) => n + x.text.split(/\s+/).filter(Boolean).length, 0);

export function PodcastStudio() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [source, setSource] = useState<Source>("topic");
  const [topic, setTopic] = useState("");
  const [url, setUrl] = useState("");
  const [sparkId, setSparkId] = useState("");
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState(3);
  const [feel, setFeel] = useState<string>("chat");

  const [looks, setLooks] = useState<LookItem[]>([]);
  const [twinLookId, setTwinLookId] = useState<string | null>(null);
  const [twinLookIds, setTwinLookIds] = useState<string[]>([]);
  const [lookId, setLookId] = useState<string | null>(null);
  const [coHostId, setCoHostId] = useState<string | null>(null);
  const [setId, setSetId] = useState("warm");

  const [title, setTitle] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [writing, setWriting] = useState(false);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<{ videoId: string } | null>(null);

  useEffect(() => {
    fetch("/api/podcast/setup").then((r) => (r.ok ? r.json() : null)).then((d: Setup | null) => {
      if (!d) { toast.error("Couldn't open Spark Podcast."); return; }
      setSetup(d);
      setCoHostId((c) => c ?? d.coHosts[0]?.id ?? null);
      if (d.city && !topic) setTopic(`Should you downsize now or wait? ${[d.city, d.state].filter(Boolean).join(", ")}`);
    }).catch(() => {});
    fetch("/api/avatar/looks").then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) return;
      const ids: string[] = Array.isArray(b.twinLookIds) ? b.twinLookIds : [];
      const ready = ((b.looks ?? []) as LookItem[]).filter((l) => !l.status || l.status === "completed" || l.status === "active");
      setLooks([...ready.filter((l) => ids.includes(l.id)), ...ready.filter((l) => !ids.includes(l.id))]);
      setTwinLookIds(ids);
      setTwinLookId(typeof b.twinLookId === "string" ? b.twinLookId : null);
      const wide = b.formatLooks?.wide as string | null | undefined;
      setLookId((cur) => cur ?? (wide && ready.some((l) => l.id === wide) ? wide : ready[0]?.id ?? null));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function write() {
    setWriting(true); setMade(null);
    try {
      const res = await fetch("/api/podcast/script", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, source, url, projectId: sparkId, text, minutes, feel, coHostId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't write it."); return; }
      setTitle(out.title ?? ""); setTurns(out.turns ?? []);
      setTimeout(() => document.getElementById("conversation")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } finally { setWriting(false); }
  }

  async function make() {
    if (!window.confirm(`Make this episode? It uses ${setup?.cost ?? 2} short videos from your plan.`)) return;
    setMaking(true);
    try {
      const res = await fetch("/api/podcast/make", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, turns, lookId, coHostId, setId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't make the episode."); return; }
      setMade({ videoId: out.videoId });
      toast.success("Your episode is being made.");
    } finally { setMaking(false); }
  }

  if (!setup) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-spark-amber" /></div>;
  const host = setup.name?.split(/\s+/)[0] || "You";
  const guest = setup.coHosts.find((c) => c.id === coHostId)?.name || "Co-host";
  const w = words(turns);
  const tooLong = w > 3 * 150 + 60;
  const market = [setup.city, setup.state].filter(Boolean).join(", ");

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-[24px] font-bold text-spark-ink">🎙 Spark Podcast</h1>
        <span className="rounded-full bg-[#eee9de] px-2.5 py-0.5 text-[12px] font-bold text-spark-ink-soft">Only on your account for now</span>
      </div>
      <p className="-mt-2 mb-4 text-[14.5px] text-spark-ink-muted">Turn one idea into a conversation: you and a co-host, in a studio.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1 Source */}
        <section className="rounded-2xl border border-spark-rule bg-white p-4">
          <p className="mb-2 text-[16px] font-bold text-spark-ink">1 · What&apos;s it about?</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([["topic", "💡 Topic"], ["spark", "✨ Existing Spark or blog"], ["url", "🔗 Link"], ["text", "📄 Paste a document"]] as const).map(([id, l]) => (
              <button key={id} type="button" className={chip(source === id)} onClick={() => setSource(id)}>{l}</button>
            ))}
          </div>
          {source === "url" && <input className={`${input} mb-2`} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
          {source === "spark" && (
            <select className={`${input} mb-2`} value={sparkId} onChange={(e) => setSparkId(e.target.value)}>
              <option value="">Pick one of your Sparks</option>
              {setup.sparks.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          {source === "text" && <textarea rows={5} className={`${input} mb-2 resize-y`} placeholder="Paste the text of a PDF, report or article" value={text} onChange={(e) => setText(e.target.value)} />}
          <label className="mb-1 block text-[13px] font-semibold text-spark-ink-soft">{source === "topic" ? "Topic" : "Topic (optional)"}</label>
          <input className={`${input} mb-2`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should the episode cover?" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              ["📈 Market update", `What's happening in the ${market || "local"} housing market this month`],
              ["🏡 Listing", "Inside our newest listing: what makes it special"],
              ["🔎 Buyer question", `Is ${setup.city || "our town"} a good place to live?`],
            ].map(([l, t]) => <button key={l} type="button" className={chip(false)} onClick={() => { setSource("topic"); setTopic(t); }}>{l}</button>)}
          </div>
          <p className="mb-1 text-[13px] font-semibold text-spark-ink-soft">Length</p>
          <div className="mb-3 flex gap-1.5">{[1, 2, 3].map((m) => <button key={m} type="button" className={chip(minutes === m)} onClick={() => setMinutes(m)}>{m} min</button>)}</div>
          <p className="mb-1 text-[13px] font-semibold text-spark-ink-soft">Feel</p>
          <div className="flex flex-wrap gap-1.5">{FEELS.map(([id, l]) => <button key={id} type="button" className={chip(feel === id)} onClick={() => setFeel(id)}>{l}</button>)}</div>
        </section>

        {/* 2 Hosts */}
        <section className="rounded-2xl border border-spark-rule bg-white p-4">
          <p className="mb-2 text-[16px] font-bold text-spark-ink">2 · Who&apos;s talking?</p>
          <p className="mb-1 text-[13px] font-semibold text-spark-ink-soft">You, the host · your voice</p>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {looks.length ? <LookPicker looks={looks} twinLookId={twinLookId} twinLookIds={twinLookIds} fitShape="landscape" value={lookId} onChange={setLookId} />
              : <span className="text-[13px] text-spark-ink-muted">Your headshot. <Link href="/settings" className="underline">Add looks in Settings</Link></span>}
          </div>
          <p className="mb-1 text-[13px] font-semibold text-spark-ink-soft">Co-host</p>
          <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {setup.coHosts.map((c) => (
              <button key={c.id} type="button" onClick={() => setCoHostId(c.id)} title={c.name}
                className={`overflow-hidden rounded-xl border-2 text-center ${coHostId === c.id ? "border-spark-amber" : "border-transparent hover:border-spark-rule"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.image && <img src={c.image} alt="" loading="lazy" className="aspect-square w-full object-cover" />}
                <span className="block truncate px-1 py-0.5 text-[12px] font-semibold">{c.name}</span>
              </button>
            ))}
            {setup.coHosts.length === 0 && <p className="col-span-6 text-[13px] text-spark-ink-muted">Co-hosts couldn&apos;t load. Refresh to try again.</p>}
          </div>
          <p className="mb-1 text-[13px] font-semibold text-spark-ink-soft">Studio</p>
          <div className="grid grid-cols-3 gap-2">
            {setup.sets.map((s) => (
              <button key={s.id} type="button" onClick={() => setSetId(s.id)}
                className={`overflow-hidden rounded-xl border-2 ${setId === s.id ? "border-spark-amber" : "border-transparent hover:border-spark-rule"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt="" loading="lazy" className="aspect-video w-full bg-[#3a2b17] object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                <span className="block py-0.5 text-[12px] font-semibold">{s.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-spark-ink-faint">A studio is made the first time someone picks it.</p>
        </section>
      </div>

      <div className="mt-4">
        <Button onClick={() => void write()} loading={writing} className="gap-1.5">
          <Mic size={15} /> {turns.length ? "Write it again" : "Write the conversation"}
        </Button>
        <span className="ml-3 text-[13px] text-spark-ink-muted">Free. Nothing is made until you press Make episode.</span>
      </div>

      {/* 3 Conversation */}
      {turns.length > 0 && (
        <section id="conversation" className="mt-4 scroll-mt-20 rounded-2xl border border-spark-rule bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-bold text-spark-ink">3 · The conversation</p>
            <span className={`text-[13px] ${tooLong ? "font-semibold text-red-600" : "text-spark-ink-muted"}`}>{turns.length} turns · {w} words · about {Math.max(1, Math.round((w / 150) * 60))} sec{tooLong ? " · too long, 3 minutes at most" : ""}</span>
            <button type="button" onClick={() => void write()} disabled={writing} className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-[#A3660F]"><RefreshCw size={13} /> Rewrite</button>
          </div>
          <label className="mb-1 block text-[13px] font-semibold text-spark-ink-soft">Episode title</label>
          <input className={`${input} mb-3`} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-col gap-2">
            {turns.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <button type="button" title="Switch speaker" onClick={() => setTurns(turns.map((x, j) => (j === i ? { ...x, speaker: x.speaker === "host" ? "guest" : "host" } : x)))}
                  className={`mt-1.5 flex w-[96px] shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-extrabold uppercase ${t.speaker === "host" ? "bg-spark-amber-tint text-[#A3660F]" : "bg-[#e7f0f6] text-spark-blue"}`}>
                  <ArrowDownUp size={11} /> <span className="truncate">{t.speaker === "host" ? host : guest}</span>
                </button>
                <textarea rows={2} value={t.text} onChange={(e) => setTurns(turns.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className={`${input} resize-y`} />
                <button type="button" aria-label="Remove" onClick={() => setTurns(turns.filter((_, j) => j !== i))} className="mt-2 text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setTurns([...turns, { speaker: turns[turns.length - 1]?.speaker === "host" ? "guest" : "host", text: "" }])}
            className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-[#A3660F]"><Plus size={13} /> Add a line</button>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-spark-rule pt-3">
            {made ? (
              <p className="text-[14.5px] font-semibold text-[#0f7a52]">
                ✓ Your episode is being made. <Link href={`/videos?highlight=${made.videoId}`} className="underline">Watch for it in My Sparks</Link>
              </p>
            ) : (
              <>
                <Button onClick={() => void make()} loading={making} disabled={tooLong || !coHostId || turns.some((t) => !t.text.trim())}>Make episode</Button>
                <span className="text-[13px] text-spark-ink-muted">
                  Uses {setup.cost} short videos{setup.videosLeft !== null ? ` · you have ${setup.videosLeft}` : ""}. 16:9, captions, about {Math.max(5, Math.round(w / 15))}–{Math.max(10, Math.round(w / 8))} minutes to make.
                </span>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
