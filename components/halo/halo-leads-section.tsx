"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, ExternalLink, Film, Loader2, Play, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldMic } from "@/components/ui/field-mic";

/**
 * Halo leads on AutoSparks (2026-11-09, the owner's approved mockup and
 * change). Nothing is made on its own: Write it writes the email and the
 * video script; the agent edits the script (typing or saying it), then picks
 * Avatar video, Me on camera or Email only; watches; Approve sends it right
 * away. Calling, texting and the lead's status stay in Halo (Open in Halo).
 */

interface LeadEmail { subject: string; note: string; videoLine: string; tools: boolean; toolsIntro: string; after: string }
interface Lead {
  id: string; kind: "buyer" | "business"; name: string | null; email: string | null; site: string | null; forms: string[];
  summary: string | null; businessName: string | null; town: string | null; message: string | null; leadLink: string | null;
  status: "new" | "writing" | "written" | "making" | "camera" | "ready" | "sending" | "sent" | "skipped" | "failed";
  mode: "video" | "camera" | "email" | "saved" | null; script: string | null; draft: LeadEmail | null; error: string | null;
  sentAt: string | null; sentVia: string | null; receivedAt: string; haloDraft: boolean;
  video: { id: string; url: string; title: string | null; seconds: number | null; thumbnail: string | null } | null;
}
interface SavedVideo { id: string; title: string; seconds: number | null; createdAt: string; thumbnail: string | null; lastUsed: boolean }

const clock = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="relative flex h-[54px] w-24 flex-none items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#3a3a36] to-[#6b5a3a]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <Play size={14} className="relative text-white" />
    </span>
  );
}

/**
 * Saved video (2026-11-11, the owner's approved mockup): one of the agent's
 * finished videos instead of a new one. The one used last is on top, so the
 * next lead it fits is one tap.
 */
function SavedPicker({ leadId, onUse, onCancel, busy }: { leadId: string; onUse: (id: string) => void; onCancel: () => void; busy: boolean }) {
  const [videos, setVideos] = useState<SavedVideo[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void post({ leadId, action: "saved-list" }).then(({ ok, out }) => {
      if (!live) return;
      const list = ok && Array.isArray(out.videos) ? (out.videos as SavedVideo[]) : [];
      setVideos(list);
      setPick(list[0]?.id ?? null);
    });
    return () => { live = false; };
  }, [leadId]);
  const shown = (videos ?? []).filter((v) => !q.trim() || v.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="mt-3 rounded-2xl border border-[#f1d9b0] bg-spark-amber-tint p-3">
      <p className="mb-2 text-[14px] font-semibold text-spark-ink">Saved video</p>
      <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search your videos" className={`${field} mb-2 bg-white`} />
      {videos === null && <p className="flex items-center gap-1.5 text-[13px] text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Loading…</p>}
      {videos !== null && shown.length === 0 && <p className="text-[13px] text-spark-ink-muted">{videos.length ? "No video matches that." : "No finished videos yet."}</p>}
      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
        {shown.map((v) => (
          <button key={v.id} type="button" onClick={() => setPick(v.id)} aria-pressed={pick === v.id}
            className={`flex items-center gap-3 rounded-xl bg-white p-2 text-left ${pick === v.id ? "border-2 border-spark-amber" : "border border-spark-rule"}`}>
            <span className={`h-[18px] w-[18px] flex-none rounded-full ${pick === v.id ? "border-[5px] border-spark-amber" : "border-2 border-spark-rule"}`} />
            <Thumb src={v.thumbnail} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-snug text-spark-ink">
                {v.title}
                {v.lastUsed && <span className="ml-1.5 rounded-full border border-[#bfe3cf] bg-[#e8f5ee] px-1.5 text-[11px] font-bold text-[#0f7a52]">Last used</span>}
              </span>
              <span className="text-[12px] text-spark-ink-muted">{[clock(v.seconds), day(v.createdAt)].filter(Boolean).join(" · ")}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" disabled={!pick} loading={busy} onClick={() => pick && onUse(pick)}>Use this video</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
interface Data { paidOnly?: boolean; boldtrail: boolean; leads: Lead[] }

function ago(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 2) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/halo-leads/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, out };
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function Steps({ l }: { l: Lead }) {
  const early = ["new", "failed", "writing"].includes(l.status);
  const steps = [
    { label: "Write", done: !early, now: early },
    { label: l.status === "camera" ? "Recording" : l.status === "making" ? "Being made" : "Video", done: ["ready", "sending", "sent"].includes(l.status), now: ["written", "making", "camera"].includes(l.status) },
    { label: "Approve", done: l.status === "sent" || l.status === "sending", now: l.status === "ready" },
    { label: "Sent", done: l.status === "sent", now: false },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-spark-ink-faint">→</span>}
          <span className={`rounded-full border px-2.5 py-0.5 ${s.done && !s.now ? "border-[#bfe3cf] bg-[#e8f5ee] text-[#0f7a52]" : s.now ? "border-[#f1d9b0] bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule text-spark-ink-faint"}`}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

const field = "w-full rounded-[10px] border border-spark-rule px-2.5 py-1.5 text-[15px] leading-relaxed outline-none focus:border-spark-amber";

function LeadCard({ l, boldtrail, reload }: { l: Lead; boldtrail: boolean; reload: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [script, setScript] = useState(l.script ?? "");
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [e, setE] = useState<LeadEmail>(l.draft ?? { subject: "", note: "", videoLine: "", tools: false, toolsIntro: "", after: "" });
  const business = l.kind === "business";
  const forms = l.forms.length;
  const hasVideo = l.mode === "video" || l.mode === "camera" || l.mode === "saved";
  const [picking, setPicking] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    const r = await post({ leadId: l.id, action, ...extra });
    setBusy(null);
    if (!r.ok) { toast.error(String(r.out.error ?? "Couldn't do that. Try again.")); reload(); return null; }
    return r.out;
  }
  const then = (p: Promise<Record<string, unknown> | null>) => void p.then((o) => { if (o) reload(); });

  function openCamera(words: string) {
    try { if (words) sessionStorage.setItem("camera-record-script", words); } catch { /* unavailable */ }
    router.push("/create?tab=camera");
  }

  async function onCamera() {
    const out = await act("camera", { script });
    if (out) openCamera(String(out.script ?? script));
  }

  async function saveEdit() {
    const out = await act("edit", { ...e });
    if (out) { setEditing(false); setPreview(null); toast.success("Saved."); reload(); }
  }

  async function showPreview() {
    if (preview) { setPreview(null); return; }
    const out = await act("preview");
    if (out?.html) setPreview(String(out.html));
  }

  const sendLine = !l.email
    ? "No email address on this lead. Reply from Halo."
    : !business && boldtrail
      ? `Sends right away to ${l.email} through BoldTrail.`
      : `Sends right away to ${l.email}, from you via SparkReels. Replies come to you.`;

  return (
    <div className="rounded-2xl border border-spark-rule bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-spark-ink-muted">
        <span className="font-bold text-spark-ink">{ago(l.receivedAt)}</span>
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${business ? "border-[#f1d9b0] bg-spark-amber-tint text-[#A3660F]" : "border-[#cfe2ec] bg-[#eef5f9] text-spark-blue"}`}>
          {business ? "Spotlight" : "Welcome"}
        </span>
        {(l.site || forms > 0) && <span>{[l.site, l.forms.join(", ")].filter(Boolean).join(" · ")}</span>}
        {forms > 1 && <span>· {forms} forms, merged</span>}
      </div>
      <p className="mt-1.5 text-base font-semibold leading-snug text-spark-ink">
        {business ? [l.businessName || l.name, l.town].filter(Boolean).join(" · ") : (l.name || l.email || "New lead")}
      </p>
      {(l.summary || l.message) && <p className="mt-0.5 line-clamp-2 text-[14px] text-spark-ink-soft">{l.summary || l.message}</p>}
      <Steps l={l} />

      {(l.status === "new" || l.status === "failed") && (
        <div className="mt-3">
          {l.error && <p className="mb-2 text-[13px] text-red-600">{l.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={busy === "write"} onClick={() => then(act("write"))}>Write it</Button>
            <Button size="sm" variant="ghost" loading={busy === "skip"} onClick={() => then(act("skip"))}>Skip</Button>
          </div>
        </div>
      )}

      {l.status === "writing" && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Writing…</p>
      )}

      {l.status === "written" && (
        <div className="mt-3">
          {l.error && <p className="mb-2 text-[13px] text-red-600">{l.error}</p>}
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[13px] text-spark-ink-muted">Video script · {wordCount(script)} words</span>
            <FieldMic onTranscript={(t) => setScript((s) => (s ? `${s} ${t}` : t))} title="Say it" />
          </div>
          <textarea rows={6} value={script} onChange={(ev) => setScript(ev.target.value)}
            onBlur={() => { if (script !== (l.script ?? "")) void post({ leadId: l.id, action: "script", script }); }}
            className={field} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" loading={busy === "video"} onClick={() => then(act("video", { script }))}><UserRound size={13} /> Avatar video</Button>
            <Button size="sm" variant="outline" className="gap-1.5" loading={busy === "camera"} onClick={() => void onCamera()}><Camera size={13} /> Me on camera · unlimited</Button>
            <Button size="sm" variant="outline" className="gap-1.5" aria-pressed={picking} onClick={() => setPicking((x) => !x)}><Film size={13} /> Saved video</Button>
            <Button size="sm" variant="outline" loading={busy === "email"} onClick={() => then(act("email", { script }))}>Email only</Button>
            <Button size="sm" variant="ghost" loading={busy === "skip"} onClick={() => then(act("skip"))}>Skip</Button>
          </div>
          {picking && (
            <SavedPicker leadId={l.id} busy={busy === "saved"} onCancel={() => setPicking(false)}
              onUse={(videoId) => then(act("saved", { videoId }).then((o) => { if (o) setPicking(false); return o; }))} />
          )}
          <p className="mt-2 text-[12.5px] text-spark-ink-faint">
            Avatar video uses 1 short video. Saved video uses none.{business ? " An approved avatar spotlight also goes in your Halo drafts to post." : ""}
          </p>
        </div>
      )}

      {l.status === "making" && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Making your video, about 5–10 minutes. Watch it here when it&apos;s done.</p>
      )}

      {l.status === "camera" && (
        <div className="mt-3">
          <p className="text-[13px] text-spark-ink-muted">Record it on the camera with the script in the teleprompter, then come back here. Your recording shows up on this card.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openCamera(l.script ?? "")}><Camera size={13} /> Open the camera</Button>
            <Button size="sm" variant="ghost" loading={busy === "back"} onClick={() => then(act("back"))}>Back</Button>
          </div>
        </div>
      )}

      {l.status === "ready" && (
        <div className="mt-3">
          {l.error && <p className="mb-2 text-[13px] text-red-600">{l.error}</p>}
          {l.mode === "saved" && l.video && (
            <div className="mb-2.5 flex items-center gap-2.5">
              <Thumb src={l.video.thumbnail} />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-snug text-spark-ink">{l.video.title || "Saved video"}</span>
                <span className="text-[12px] text-spark-ink-muted">{["Saved video", clock(l.video.seconds)].filter(Boolean).join(" · ")}</span>
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {l.video && hasVideo && <a href={l.video.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button></a>}
            <Button size="sm" variant="outline" onClick={() => setEditing((x) => !x)}>{editing ? "Close" : "Edit email"}</Button>
            <Button size="sm" variant="outline" loading={busy === "preview"} onClick={() => void showPreview()}>{preview ? "Hide email" : "Preview email"}</Button>
            {l.email && <Button size="sm" loading={busy === "approve"} onClick={() => void act("approve").then((o) => { if (o) { toast.success("Sent."); reload(); } })}>Approve to send</Button>}
            <Button size="sm" variant="ghost" loading={busy === "back"} onClick={() => then(act("back"))}>Change video</Button>
            <Button size="sm" variant="ghost" loading={busy === "skip"} onClick={() => then(act("skip"))}>Skip</Button>
          </div>
          <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-900">
            {sendLine}{business && l.mode === "video" && l.email ? " The spotlight also goes in your Halo drafts to post." : ""}
          </p>
        </div>
      )}

      {editing && l.status === "ready" && (
        <div className="mt-3 space-y-2">
          <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">Subject</span>
            <input value={e.subject} onChange={(ev) => setE({ ...e, subject: ev.target.value })} maxLength={150} className={field} />
          </label>
          <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">Note</span>
            <textarea rows={6} value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} className={field} />
          </label>
          {hasVideo && (
            <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">Above the video</span>
              <input value={e.videoLine} onChange={(ev) => setE({ ...e, videoLine: ev.target.value })} className={field} />
            </label>
          )}
          {e.tools && (
            <>
              <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">Above the Halo and SparkReels boxes</span>
                <textarea rows={2} value={e.toolsIntro} onChange={(ev) => setE({ ...e, toolsIntro: ev.target.value })} className={field} />
              </label>
              <label className="block"><span className="mb-1 block text-[13px] text-spark-ink-muted">After the boxes</span>
                <textarea rows={6} value={e.after} onChange={(ev) => setE({ ...e, after: ev.target.value })} className={field} />
              </label>
            </>
          )}
          <Button size="sm" loading={busy === "edit"} onClick={() => void saveEdit()}>Save</Button>
        </div>
      )}

      {preview && (
        <iframe title="Email preview" srcDoc={preview} sandbox="" className="mt-3 h-[560px] w-full rounded-xl border border-spark-rule bg-white" />
      )}

      {l.status === "sending" && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Sending…</p>
      )}
      {l.status === "sent" && (
        <p className="mt-3 text-[13px] font-medium text-[#0f7a52]">
          ✓ Sent {l.sentAt ? ago(l.sentAt).toLowerCase() : ""}{l.sentVia === "boldtrail" ? " through BoldTrail" : ""}{l.haloDraft ? " · in your Halo drafts" : ""}
        </p>
      )}

      {l.leadLink && (
        <p className="mt-2 text-[12.5px] text-spark-ink-faint">
          <a href={l.leadLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-spark-blue underline">Open in Halo <ExternalLink size={11} /></a> to call, text or change the status.
        </p>
      )}
    </div>
  );
}

export function HaloLeadsSection() {
  const [data, setData] = useState<Data | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/halo-leads");
    if (!res.ok) return;
    const out = (await res.json()) as Data;
    if (out.paidOnly) return;
    setData(out);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data?.leads.some((l) => ["writing", "making", "camera", "sending"].includes(l.status))) return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [data, load]);

  if (!data || !data.leads.length) return null;
  const open = data.leads.filter((l) => l.status !== "sent");
  const done = data.leads.filter((l) => l.status === "sent");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-spark-ink-faint">Halo leads</p>
      {open.map((l) => <LeadCard key={`${l.id}-${l.status}`} l={l} boldtrail={data.boldtrail} reload={() => void load()} />)}
      {done.length > 0 && (
        <div className="rounded-2xl border border-spark-rule bg-white px-4 py-3">
          <button type="button" onClick={() => setShowDone((s) => !s)} className="flex w-full items-center justify-between text-left">
            <span className="text-[14px] text-spark-ink-soft">Done · {done.length} sent this week</span>
            <span className="text-[12.5px] text-spark-ink-faint">{showDone ? "Hide ▴" : "Show ▾"}</span>
          </button>
          {showDone && <div className="mt-3 flex flex-col gap-3">{done.map((l) => <LeadCard key={l.id} l={l} boldtrail={data.boldtrail} reload={() => void load()} />)}</div>}
        </div>
      )}
    </div>
  );
}
