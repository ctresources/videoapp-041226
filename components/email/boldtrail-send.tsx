"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Plus, Send, X } from "lucide-react";

/**
 * Send through BoldTrail, for a blog post's email and a newsletter
 * (2026-10-15): up to ten people from the agent's BoldTrail, chosen by exact
 * email or from quick picks, then a confirmation, then each person gets their
 * own email from the agent's BoldTrail address. The page that uses it does
 * the sending (onSend); this is the choosing and the confirming.
 */

export type BtContact = { id: string; name: string; email: string };
type Result = { name: string; sent: boolean };
const MAX = 10;
const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-1.5 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]";

export function BoldTrailSend({
  subject,
  blockedReason,
  onSend,
}: {
  subject: string;
  /** Why it can't go yet (e.g. a missing post link), shown instead of the button. */
  blockedReason?: string | null;
  onSend: (contacts: BtContact[]) => Promise<{ sentAt: string; results: Result[] }>;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<BtContact[]>([]);
  const [to, setTo] = useState<BtContact[]>([]);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<{ at: string; to: Result[] } | null>(null);

  useEffect(() => {
    fetch("/api/boldtrail")
      .then((r) => (r.ok ? r.json() : { connected: false, picks: [] }))
      .then((d) => { setConnected(!!d.connected); setPicks(d.picks ?? []); })
      .catch(() => setConnected(false));
  }, []);

  function add(c: BtContact) {
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
      add(d.contact);
      setAddEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't find that contact.");
    } finally {
      setAdding(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      const d = await onSend(to);
      setLast({ at: d.sentAt, to: d.results });
      const failed = d.results.filter((r) => !r.sent);
      if (failed.length) toast.error(`Not sent to ${failed.map((r) => r.name).join(", ")}.`);
      else toast.success(`Sent to ${d.results.length} ${d.results.length === 1 ? "person" : "people"} through BoldTrail.`);
      setConfirming(false);
      setTo([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send it.");
    } finally {
      setSending(false);
    }
  }

  if (connected === null) return null;
  if (!connected) {
    return (
      <p className="mt-3 text-[12.5px] text-spark-ink-muted">
        <Link href="/settings" className="font-semibold text-[#A3660F] hover:underline">Connect BoldTrail in Settings</Link> to send this to up to {MAX} people from here.
      </p>
    );
  }

  const free = picks.filter((p) => !to.some((t) => t.id === p.id));
  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
      <p className="mb-2 text-[12px] font-bold text-orange-800">Send through BoldTrail · up to {MAX} people</p>
      <div className="flex flex-wrap items-center gap-2">
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
              name="boldtrail-send-contact"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addByEmail(); } }}
              placeholder="Add by email"
              className={input}
            />
            <button type="button" onClick={addByEmail} disabled={adding || !addEmail.includes("@")} className="flex shrink-0 items-center gap-1 rounded-[10px] border border-orange-300 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-orange-800 disabled:opacity-50">
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
            </button>
          </span>
        )}
      </div>
      {free.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-spark-ink-muted">
          Quick picks:
          {free.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} className="rounded-full border border-dashed border-[#d9c6a8] bg-white px-2.5 py-0.5 text-spark-ink hover:border-[#A3660F]">
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {blockedReason ? (
          <p className="text-[12.5px] text-amber-800">{blockedReason}</p>
        ) : (
          <button
            type="button"
            disabled={!to.length || !subject.trim()}
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send size={13} /> Send through BoldTrail
          </button>
        )}
        {last && (
          <span className="text-[12.5px] font-semibold text-green-700">
            ✓ Sent {new Date(last.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} to{" "}
            {last.to.filter((r) => r.sent).map((r) => r.name).join(", ")}
          </span>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setConfirming(false)}>
          <div role="dialog" aria-label="Send this email?" className="w-full max-w-[460px] rounded-2xl border border-spark-rule bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-[17px] font-bold text-spark-ink">Send this email?</h3>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>To:</b> {to.map((c) => c.name).join(", ")}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>Subject:</b> {subject}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>From:</b> your BoldTrail email</p>
            <p className="my-2 text-[12.5px] text-spark-ink-muted">Each person gets their own email, greeted by their first name.</p>
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

/** Calls the send route and turns a refusal into an error the piece above shows. */
export async function postBoldTrailEmail(body: Record<string, unknown>) {
  const res = await fetch("/api/boldtrail/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error || "Couldn't send it.");
  return d as { sentAt: string; results: { name: string; sent: boolean }[] };
}
