"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, RefreshCw, Send, X } from "lucide-react";
import { EmailResult } from "@/components/email/email-result";
import { BoldTrailPeople, BT_MAX, type BtContact } from "@/components/email/boldtrail-send";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";
import { greetingName, videoEmailAsHtml, videoEmailAsText, type SellerVideo } from "@/lib/utils/newsletter-html";
import type { EmailSignature } from "@/lib/utils/email-html";
import { showTrialLock } from "@/lib/utils/trial-lock";

/**
 * Email it, for a finished video in My Sparks (/video-email?video=<id>), the
 * owner's mock 2026-10-15. Up to ten people from the agent's BoldTrail, each
 * sent their own email from the agent's BoldTrail address after a
 * confirmation. Without BoldTrail it is still a copy-and-paste email.
 */

type Contact = { id?: string; name: string; email: string };
const MAX = BT_MAX;
const eyebrow = "mb-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-spark-ink";
const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]";
const firstOf = (c?: Contact) => greetingName(c?.name);

export default function VideoEmailPage() {
  const [videoId, setVideoId] = useState("");
  const [video, setVideo] = useState<(SellerVideo & { title: string }) | null>(null);
  const [signature, setSignature] = useState<EmailSignature>({});
  const [boldtrail, setBoldtrail] = useState(false);
  const [picks, setPicks] = useState<Contact[]>([]);
  const [lastSent, setLastSent] = useState<{ at: string; to: { name: string; sent: boolean }[] } | null>(null);
  /** Every send of this video, newest first (2026-10-29). */
  const [history, setHistory] = useState<{ at: string; subject: string | null; to: { name: string; email?: string; sent: boolean }[] }[]>([]);
  /** Just sent: the panel with Done and Send to more people (2026-10-29). */
  const [justSent, setJustSent] = useState<{ name: string; sent: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [to, setTo] = useState<Contact[]>([]);
  // Typed in, for sending without BoldTrail (2026-10-27, the owner's ask).
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [copyMe, setCopyMe] = useState(false);
  /** The Google review button (2026-10-29): the agent's link, and whether to add it. */
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [addReview, setAddReview] = useState(false);
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
        setHistory(Array.isArray(d.history) ? d.history : []);
        setReviewUrl(typeof d.reviewUrl === "string" && d.reviewUrl.startsWith("https://") ? d.reviewUrl : null);
        // Ticked to begin with for a video made to ask for a review.
        setAddReview(!!d.isReview);
        void write(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't open that video.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addTyped() {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter their whole email address."); return; }
    if (to.length >= MAX) { toast.error(`Up to ${MAX} people at a time.`); return; }
    if (to.some((c) => c.email === email)) return;
    setTo([...to, { name: newName.trim(), email }]);
    setNewName(""); setNewEmail("");
  }

  /** The Send button under the To box: says what's missing instead of doing nothing. */
  function startSend() {
    if (to.length === 0) { toast.error("Add at least one person first: type a name or email above."); return; }
    if (!subject.trim()) { toast.error("Add a subject first."); return; }
    setConfirming(true);
  }

  /** Only from Send now in the confirmation. */
  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/video-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, subject, note, contacts: to, copyMe, reviewButton: addReview && !!reviewUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't send it.");
      const results = (d.results ?? []) as { name: string; sent: boolean }[];
      setLastSent({ at: d.sentAt, to: results });
      setHistory((h) => [{ at: d.sentAt, subject, to: results }, ...h]);
      if (results.some((r) => r.sent)) setJustSent(results);
      const failed = results.filter((r) => !r.sent);
      if (failed.length) toast.error(`Not sent to ${failed.map((r) => r.name).join(", ")}.`);
      else toast.success(`Sent to ${results.length} ${results.length === 1 ? "person" : "people"}.`);
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
      html: videoEmailAsHtml({ subject, note, firstName: first, video, signature, reviewUrl: addReview ? reviewUrl : null }),
      text: videoEmailAsText({ note, firstName: first, video, signature, reviewUrl: addReview ? reviewUrl : null }),
    };
  }, [video, subject, note, signature, to, addReview, reviewUrl]);

  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="w-full px-4 pb-10 pt-5 sm:px-6">
      <Link href="/videos" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted hover:text-spark-ink">
        <ArrowLeft size={15} /> My Sparks
      </Link>
      <h1 className="mb-1 font-display text-[28px] font-bold leading-[1.15] text-[#A3660F] sm:text-[32px]">Email this video</h1>
      {video && <p className="mb-4 text-[14px] text-spark-ink-muted">{video.title}</p>}

      {/* Sent (2026-10-29, the owner's ask): a clear end, with the way back. */}
      {justSent && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
          <div className="mr-auto">
            <p className="text-[16px] font-bold text-green-800">✓ Sent</p>
            <p className="text-[14px] text-green-800">
              To {justSent.filter((r) => r.sent).map((r) => r.name).join(", ")}
              {justSent.some((r) => !r.sent) && <span className="text-red-700"> · not sent to {justSent.filter((r) => !r.sent).map((r) => r.name).join(", ")}</span>}
            </p>
          </div>
          <button type="button" onClick={() => setJustSent(null)} className="rounded-[10px] border border-green-300 bg-white px-4 py-2 text-[14px] font-semibold text-green-800">
            Send to more people
          </button>
          <Link href="/videos" className="rounded-[10px] bg-green-700 px-5 py-2 text-[14px] font-bold text-white">Done</Link>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</div>
      ) : !video ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-spark-rule bg-white px-5 py-8 text-[15px] text-spark-ink-muted">
          <Loader2 size={18} className="animate-spin text-[#A3660F]" /> Getting your video ready…
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <p className={eyebrow}>{boldtrail ? "To · from your BoldTrail, or anyone new" : "To"}</p>
            {boldtrail ? (
              <>
                {/* Same people box as the Share Kit (2026-10-24, the owner's
                    ask): search BoldTrail by name or email, or add someone new. */}
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-2.5">
                  <BoldTrailPeople
                    to={to.filter((c): c is BtContact => !!c.id)}
                    onChange={(next) => setTo([...next, ...to.filter((c) => !c.id)])}
                    picks={picks.filter((c): c is BtContact => !!c.id)}
                    onAddPlain={(c) => { if (!to.some((x) => x.email === c.email)) setTo([...to, c]); }}
                    extra={to.filter((c) => !c.id).length}
                  />
                  {to.some((c) => !c.id) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {to.filter((c) => !c.id).map((c) => (
                        <span key={c.email} className="inline-flex items-center gap-1 rounded-full border border-spark-rule bg-white px-2.5 py-1 text-[12.5px]">
                          {c.name ? `${c.name} · ` : ""}<span className="text-[11px] text-spark-ink-muted">{c.email}</span>
                          <button type="button" aria-label="Remove" onClick={() => setTo(to.filter((x) => x.email !== c.email || x.id))}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-spark-ink-muted">Up to {MAX} people, each sent their own email.</p>
                <button
                  type="button"
                  onClick={startSend}
                  disabled={sending}
                  className="mt-2.5 flex w-fit items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  <Send size={13} /> Send email{to.length ? ` to ${to.length}` : ""}
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                  <input className={input} placeholder="First name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <input className={input} placeholder="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }} />
                  <button type="button" onClick={addTyped} className="rounded-[10px] border border-spark-rule bg-white px-3 text-[13px] font-semibold text-spark-ink hover:border-[#d9c6a8]">Add</button>
                </div>
                {to.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {to.map((c) => (
                      <span key={c.email} className="inline-flex items-center gap-1 rounded-full border border-spark-rule bg-[#faf9f5] px-2.5 py-1 text-[13px]">
                        {c.name ? `${c.name} · ` : ""}{c.email}
                        <button type="button" aria-label="Remove" onClick={() => setTo(to.filter((x) => x.email !== c.email))}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[11.5px] text-spark-ink-muted">
                  Up to {MAX} people. It comes from &ldquo;{signature.name || "you"} via SparkReels&rdquo; and replies go to your email; send yourself a test first.{" "}
                  <Link href="/settings#crm" className="font-semibold text-[#A3660F] hover:underline">Connect BoldTrail</Link> to send from your own address.
                </p>
                <button
                  type="button"
                  onClick={startSend}
                  disabled={sending}
                  className="mt-2.5 flex w-fit items-center gap-1.5 rounded-[10px] bg-spark-amber px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  <Send size={13} /> Send{to.length ? ` to ${to.length}` : ""}
                </button>
              </>
            )}

            <p className={`${eyebrow} mt-4`}>Subject</p>
            <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={writing ? "Writing…" : "Subject line"} />

            <p className={`${eyebrow} mt-4 flex items-center justify-between`}>
              Your note
              <FieldMic title="Say your note" silenceMs={PROSE_SILENCE_MS} onTranscript={(t) => setNote((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
            </p>
            <textarea rows={5} className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder={writing ? "Writing…" : "Hi {first name}, …"} />
            <p className="mt-1 text-[11.5px] text-spark-ink-muted">{"{first name}"} becomes each person&apos;s first name.</p>
            {/* The Google review button (2026-10-29). */}
            {reviewUrl ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13.5px] text-spark-ink-soft">
                <input type="checkbox" checked={addReview} onChange={(e) => setAddReview(e.target.checked)} className="h-4 w-4 accent-orange-600" />
                ⭐ Add my Google review button
              </label>
            ) : (
              <p className="mt-3 text-[12.5px] text-spark-ink-muted">
                Asking for a review? <a href="/settings#review-link" className="font-semibold text-[#A3660F] underline">Add your Google review link</a> to put a review button in this email.
              </p>
            )}

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
                leading={(
                  <button type="button" onClick={startSend} className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90">
                    <Send size={13} /> Send email{to.length ? ` to ${to.length}` : ""}
                  </button>
                )}
                footer={history.length ? (
                  // Every send of this video (2026-10-29), not just the last.
                  <div className="mt-2">
                    <p className="text-[12.5px] font-semibold text-green-700">✉ Sent {history.length} {history.length === 1 ? "time" : "times"}</p>
                    <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[12.5px] text-spark-ink-muted">
                      {history.map((h, i) => (
                        <li key={i}>
                          {when(h.at)} · {h.to.filter((r) => r.sent).map((r) => r.name || r.email).join(", ") || "nobody"}
                          {h.subject ? <span className="text-spark-ink-faint"> · &ldquo;{h.subject}&rdquo;</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : lastSent ? (
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
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>To:</b> {to.map((c) => c.name || c.email).join(", ")}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>Subject:</b> {subject}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>From:</b> {to.every((c) => c.id) ? "your BoldTrail email" : to.some((c) => c.id) ? `your BoldTrail email for BoldTrail contacts; ${signature.name || "you"} via SparkReels for the others (replies go to you)` : `${signature.name || "you"} via SparkReels (replies go to you)`}</p>
            <p className="my-2 text-[12.5px] text-spark-ink-muted">Each person gets their own email with their first name.</p>
            <label className="my-2 flex cursor-pointer items-center gap-2 text-[13.5px] text-spark-ink-soft">
              <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} className="h-4 w-4 accent-orange-600" />
              Send me a copy
            </label>
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
