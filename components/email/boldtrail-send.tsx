"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Search, Send, UserPlus, X } from "lucide-react";

/**
 * Send through BoldTrail, for a blog post's email and a newsletter
 * (2026-10-15): up to ten people from the agent's BoldTrail, then a
 * confirmation, then each person gets their own email from the agent's
 * BoldTrail address. The page that uses it does the sending (onSend); this is
 * the choosing and the confirming.
 *
 * 2026-10-24 (the owner's ask, after Daniel Okiro's first try): people are
 * found by typing part of a name or email, from a dropdown of BoldTrail
 * contacts, instead of typing each full address; and Send always answers,
 * saying what is missing, instead of sitting greyed out with nothing said.
 */

export type BtContact = { id: string; name: string; email: string };
type Result = { name: string; sent: boolean };
const MAX = 10;
const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-1.5 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]";

export function BoldTrailSend({
  subject,
  blockedReason,
  onSend,
  numbered = false,
}: {
  subject: string;
  /** Why it can't go yet (e.g. a missing post link), said when Send is pressed. */
  blockedReason?: string | null;
  onSend: (contacts: BtContact[]) => Promise<{ sentAt: string; results: Result[] }>;
  /** Label the parts "3 · People" and "4 · Send" (the Share Kit's numbered steps). */
  numbered?: boolean;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<BtContact[]>([]);
  const [to, setTo] = useState<BtContact[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<BtContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<{ at: string; to: Result[] } | null>(null);
  // Someone not in BoldTrail yet: name + email, added to BoldTrail, then picked.
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    fetch("/api/boldtrail")
      .then((r) => (r.ok ? r.json() : { connected: false, picks: [] }))
      .then((d) => { setConnected(!!d.connected); setPicks(d.picks ?? []); })
      .catch(() => setConnected(false));
  }, []);

  // Search BoldTrail as they type: a short pause, and only the latest answer counts.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setFound([]); setSearching(false); return; }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/boldtrail/search?q=${encodeURIComponent(term)}`);
        const d = await res.json().catch(() => ({}));
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(d?.error || "Couldn't search BoldTrail.");
        setFound((d.contacts ?? []) as BtContact[]);
      } catch (err) {
        if (mine === seq.current) { setFound([]); toast.error(err instanceof Error ? err.message : "Couldn't search BoldTrail."); }
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function add(c: BtContact) {
    setTo((prev) => (prev.some((x) => x.id === c.id) ? prev : prev.length >= MAX ? (toast.error(`Up to ${MAX} people at a time.`), prev) : [...prev, c]));
    setQuery("");
    setFound([]);
  }

  function openNew() {
    const term = query.trim();
    if (term.includes("@")) { setNewEmail(term); setNewName(""); } else { setNewName(term); setNewEmail(""); }
    setNewOpen(true);
    setOpen(false);
  }

  async function addNew() {
    if (!newName.trim()) { toast.error("Enter their name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { toast.error("Enter their email."); return; }
    if (to.length >= MAX) { toast.error(`Up to ${MAX} people at a time.`); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/boldtrail/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't add them.");
      add(d.contact as BtContact);
      toast.success(d.created ? `${d.contact.name} added to your BoldTrail.` : `${d.contact.name} was already in your BoldTrail.`);
      setNewOpen(false);
      setNewName("");
      setNewEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add them.");
    } finally {
      setAdding(false);
    }
  }

  function pressSend() {
    if (blockedReason) { toast.error(blockedReason); return; }
    if (!to.length) { toast.error("Add at least one person first: type a name or email above."); return; }
    if (!subject.trim()) { toast.error("Pick a subject line first."); return; }
    setConfirming(true);
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
        <Link href="/settings#crm" className="font-semibold text-[#A3660F] hover:underline">Connect BoldTrail in Settings</Link> to send this to up to {MAX} people from here.
      </p>
    );
  }

  const free = picks.filter((p) => !to.some((t) => t.id === p.id));
  const shown = found.filter((c) => !to.some((t) => t.id === c.id));
  const term = query.trim();
  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
      <p className="mb-2 text-[12px] font-bold text-orange-800">
        {numbered ? "3 · " : ""}People from BoldTrail · up to {MAX}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {to.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 rounded-full border border-orange-300 bg-white px-2.5 py-1 text-[12.5px] text-spark-ink">
            {c.name}<span className="text-[11px] text-orange-800">{c.email}</span>
            <button type="button" onClick={() => setTo((p) => p.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} className="text-spark-ink-muted hover:text-red-600"><X size={12} /></button>
          </span>
        ))}
        {to.length < MAX && (
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-spark-ink-faint" />
            <input
              type="text"
              name="boldtrail-send-search"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); if (shown[0]) add(shown[0]); }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Type a name or email"
              className={`${input} pl-8`}
            />
            {open && term.length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-spark-rule bg-white shadow-lg">
                {searching && shown.length === 0 && (
                  <p className="flex items-center gap-1.5 px-3 py-2 text-[13px] text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Searching BoldTrail…</p>
                )}
                {!searching && shown.length === 0 && (
                  <p className="px-3 py-2 text-[13px] text-spark-ink-muted">No BoldTrail contact starts with &ldquo;{term}&rdquo;.</p>
                )}
                {shown.map((c) => (
                  <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(c)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-orange-50">
                    <span className="min-w-0 truncate font-semibold text-spark-ink">{c.name}</span>
                    <span className="shrink-0 text-[12px] text-spark-ink-muted">{c.email}</span>
                  </button>
                ))}
                {!searching && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openNew}
                    className="flex w-full items-center gap-1.5 border-t border-spark-rule px-3 py-2 text-left text-[13px] font-semibold text-[#A3660F] hover:bg-orange-50">
                    <UserPlus size={13} /> Add someone new
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {to.length < MAX && !newOpen && (
          <button type="button" onClick={openNew} className="flex items-center gap-1 text-[12.5px] font-semibold text-[#A3660F] hover:underline">
            <UserPlus size={13} /> Add someone new
          </button>
        )}
      </div>
      {newOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-orange-200 bg-white p-2">
          <input type="text" name="boldtrail-new-name" autoComplete="off" data-1p-ignore data-lpignore="true" value={newName}
            onChange={(e) => setNewName(e.target.value)} placeholder="Name" className={`${input} min-w-[140px] flex-1`} />
          <input type="email" name="boldtrail-new-email" autoComplete="off" data-1p-ignore data-lpignore="true" value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }}
            placeholder="Email" className={`${input} min-w-[180px] flex-[1.4]`} />
          <button type="button" onClick={addNew} disabled={adding}
            className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
            {adding ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Add
          </button>
          <button type="button" onClick={() => setNewOpen(false)} aria-label="Cancel" className="text-spark-ink-muted hover:text-red-600"><X size={14} /></button>
          <p className="w-full text-[11.5px] text-spark-ink-muted">Also saved to your BoldTrail as a Sphere contact.</p>
        </div>
      )}
      {free.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-spark-ink-muted">
          Recent:
          {free.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} className="rounded-full border border-dashed border-[#d9c6a8] bg-white px-2.5 py-0.5 text-spark-ink hover:border-[#A3660F]">
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pressSend}
          disabled={sending}
          className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Send size={13} /> {numbered ? "4 · " : ""}Send through BoldTrail{to.length ? ` to ${to.length}` : ""}
        </button>
        {blockedReason && <p className="text-[12.5px] text-amber-800">{blockedReason}</p>}
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
