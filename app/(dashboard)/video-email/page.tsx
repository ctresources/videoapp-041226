"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Plus, RefreshCw, Send, X } from "lucide-react";
import { EmailResult } from "@/components/email/email-result";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";
import { videoEmailAsHtml, videoEmailAsText, type SellerVideo } from "@/lib/utils/newsletter-html";
import type { EmailSignature } from "@/lib/utils/email-html";
import { showTrialLock } from "@/lib/utils/trial-lock";

/**
 * Email it, for a finished video in My Sparks (/video-email?video=<id>), the
 * owner's mock 2026-10-15. Up to ten people from the agent's BoldTrail, each
 * sent their own email from the agent's BoldTrail address after a
 * confirmation. Without BoldTrail it is still a copy-and-paste email.
 */

type Contact = { id: string; name: string; email: string };
const MAX = 10;
const eyebrow = "mb-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-spark-ink";
const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]";
const firstOf = (c?: Contact) => (c && !c.name.includes("@") ? c.name.split(/\s+/)[0] : "");

export default function VideoEmailPage() {
  const [videoId, setVideoId] = useState("");
  const [video, setVideo] = useState<(SellerVideo & { title: string }) | null>(null);
  const [signature, setSignature] = useState<EmailSignature>({});
  const [boldtrail, setBoldtrail] = useState(false);
  const [picks, setPicks] = useState<Contact[]>([]);
  const [lastSent, setLastSent] = useState<{ at: string; to: { name: string; sent: boolean }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [to, setTo] = useState<Contact[]>([]);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  async function write(id = videoId) {
    setWriting(true);
    try {
      const res = await fetch("/api/video-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id, action: "write" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (showTrialLock(d)) return;
        throw new Error(d?.error || "Couldn't write the note.");
      }
      setSubject(d.subject);
      setNote(d.note);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write the note.");
    } finally {
      setWriting(false);
    }
  }

  // The video comes in the address; the window keeps this page free of a
  // useSearchParams Suspense boundary.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("video") ?? "";
    setVideoId(id);
    (async () => {
      try {
        const res = await fetch("/api/video-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: id, action: "load" }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || "Couldn't open that video.");
        setVideo(d.video);
        setSignature(d.signature ?? {});
        setBoldtrail(!!d.boldtrail);
        setPicks(d.picks ?? []);
        setLastSent(d.lastSent ?? null);
        void write(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't open that video.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addContact(c: Contact) {
    setTo((prev) => (prev.some((x) => x.id === c.id) ? prev : prev.length >= MAX ? (toast.error(`Up to ${MAX} people at a time.`), prev) : [...prev, c]));
  }

  async function addByEmail() {
    if (!addEmail.includes("@")) return;
    setAdding(true);
    try {
      const res = await fetch("/api/video-email/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't find that contact.");
      addContact(d.contact);
      setAddEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't find that contact.");
    } finally {
      setAdding(false);
    }
  }

  /** Only from Send now in the confirmation. */
  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/video-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, subject, note, contacts: to }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't send it.");
      const results = (d.results ?? []) as { name: string; sent: boolean }[];
      setLastSent({ at: d.sentAt, to: results });
      const failed = results.filter((r) => !r.sent);
      if (failed.length) toast.error(`Not sent to ${failed.map((r) => r.name).join(", ")}.`);
      else toast.success(`Sent to ${results.length} ${results.length === 1 ? "person" : "people"} through BoldTrail.`);
      setConfirming(false);
      setTo([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send it.");
    } finally {
      setSending(false);
    }
  }

  // The preview reads as the first person on the list would see it.
  const built = useMemo(() => {
    if (!video || !note.trim()) return null;
    const first = firstOf(to[0]);
    return {
      html: videoEmailAsHtml({ subject, note, firstName: first, video, signature }),
      text: videoEmailAsText({ note, firstName: first, video, signature }),
    };
  }, [video, subject, note, signature, to]);

  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-10 pt-5 sm:px-6">
      <Link href="/videos" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted hover:text-spark-ink">
        <ArrowLeft size={15} /> My Sparks
      </Link>
      <h1 className="mb-1 font-display text-[28px] font-bold leading-[1.15] text-[#A3660F] sm:text-[32px]">Email this video</h1>
      {video && <p className="mb-4 text-[14px] text-spark-ink-muted">{video.title}</p>}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</div>
      ) : !video ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-spark-rule bg-white px-5 py-8 text-[15px] text-spark-ink-muted">
          <Loader2 size={18} className="animate-spin text-[#A3660F]" /> Getting your video ready…
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <p className={eyebrow}>To · from your BoldTrail</p>
            {boldtrail ? (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/60 p-2.5">
                  {to.map((c) => (
                    <span key={c.id} className="flex items-center gap-1.5 rounded-full border border-orange-300 bg-white px-2.5 py-1 text-[12.5px] text-spark-ink">
                      {c.name}<span className="text-[11px] text-orange-800">{c.email}</span>
                      <button type="button" onClick={() => setTo((p) => p.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} className="text-spark-ink-muted hover:text-red-600"><X size={12} /></button>
                    </span>
                  ))}
                  {to.length < MAX && (
                    <span className="flex min-w-[220px] flex-1 items-center gap-1.5">
                      <input
                        type="email"
                        name="video-email-contact"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        value={addEmail}
                        onChange={(e) => setAddEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addByEmail(); } }}
                        placeholder="Add by email"
                        className={`${input} py-1.5`}
                      />
                      <button type="button" onClick={addByEmail} disabled={adding || !addEmail.includes("@")} className="flex shrink-0 items-center gap-1 rounded-[10px] border border-orange-300 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-orange-800 disabled:opacity-50">
                        {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                      </button>
                    </span>
                  )}
                </div>
                {picks.filter((p) => !to.some((t) => t.id === p.id)).length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-spark-ink-muted">
                    Quick picks:
                    {picks.filter((p) => !to.some((t) => t.id === p.id)).map((p) => (
                      <button key={p.id} type="button" onClick={() => addContact(p)} className="rounded-full border border-dashed border-[#d9c6a8] bg-white px-2.5 py-0.5 text-spark-ink hover:border-[#A3660F]">
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[11.5px] text-spark-ink-muted">Up to {MAX} people, each sent their own email.</p>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-spark-rule p-3 text-[13px] text-spark-ink-muted">
                <Link href="/settings" className="font-semibold text-[#A3660F] hover:underline">Connect BoldTrail in Settings</Link> to send it from here. You can still copy it below.
              </p>
            )}

            <p className={`${eyebrow} mt-4`}>Subject</p>
            <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={writing ? "Writing…" : "Subject line"} />

            <p className={`${eyebrow} mt-4 flex items-center justify-between`}>
              Your note
              <FieldMic title="Say your note" silenceMs={PROSE_SILENCE_MS} onTranscript={(t) => setNote((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
            </p>
            <textarea rows={5} className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder={writing ? "Writing…" : "Hi {first name}, …"} />
            <p className="mt-1 text-[11.5px] text-spark-ink-muted">{"{first name}"} becomes each person&apos;s first name.</p>

            <div className="mt-auto pt-4">
              <button type="button" onClick={() => write()} disabled={writing} className="flex items-center gap-1.5 rounded-[10px] border border-spark-rule bg-white px-3.5 py-2 text-[13px] font-semibold text-spark-ink hover:border-[#d9c6a8] disabled:opacity-50">
                {writing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Write it again
              </button>
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <p className={eyebrow}>Preview</p>
            {built ? (
              <EmailResult
                subject={subject}
                html={built.html}
                text={built.text}
                leading={boldtrail && to.length > 0 && subject.trim() ? (
                  <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90">
                    <Send size={13} /> Send through BoldTrail
                  </button>
                ) : undefined}
                footer={lastSent ? (
                  <p className="mt-2 text-[12.5px] font-semibold text-green-700">
                    ✓ Last sent {when(lastSent.at)} to {lastSent.to.filter((r) => r.sent).map((r) => r.name).join(", ")}
                  </p>
                ) : undefined}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-spark-rule p-8 text-[14px] text-spark-ink-muted">
                {writing ? <><Loader2 size={15} className="animate-spin" /> Writing your note…</> : "Write a note to see the email."}
              </div>
            )}
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setConfirming(false)}>
          <div role="dialog" aria-label="Send this video?" className="w-full max-w-[460px] rounded-2xl border border-spark-rule bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-[17px] font-bold text-spark-ink">Send this video?</h3>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>To:</b> {to.map((c) => c.name).join(", ")}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>Subject:</b> {subject}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>From:</b> your BoldTrail email</p>
            <p className="my-2 text-[12.5px] text-spark-ink-muted">Each person gets their own email with their first name.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="rounded-[10px] border border-spark-rule bg-white px-4 py-2 text-[13.5px] font-semibold text-spark-ink">Cancel</button>
              <button type="button" onClick={send} disabled={sending} className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-60">
                {sending && <Loader2 size={14} className="animate-spin" />} Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
