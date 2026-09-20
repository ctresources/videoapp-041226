"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * The private address articles can be forwarded to, and the way to change it.
 *
 * The same address the Create screens show — this is where it lives when someone
 * wants to add it to their phone's contacts rather than copy it mid-task.
 */
export function EmailImportAddress() {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/email/imports")
      .then((res) => res.json())
      .then((body) => setAddress(body?.address ?? null))
      .catch(() => setAddress(null))
      .finally(() => setLoading(false));
  }, []);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the address and copy it by hand.");
    }
  }

  async function reset() {
    // Asked here rather than with a toast afterwards: mail sent to the old
    // address is ignored from this moment, and nothing bounces to say so.
    const sure = window.confirm(
      "Give you a new import address?\n\nAnything forwarded to the old one after this will be ignored. Articles already imported are kept.",
    );
    if (!sure) return;
    setResetting(true);
    try {
      const res = await fetch("/api/email/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Couldn't reset the address");
      setAddress(body.address as string);
      toast.success("New address ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset the address");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
        <p className="min-w-0 flex-1 text-sm font-medium text-brand-text break-all select-all">
          {loading
            ? <span className="inline-flex items-center gap-1.5 text-slate-400"><Loader2 size={13} className="animate-spin" /> Getting your address…</span>
            : address ?? "Unavailable — reload the page"}
        </p>
        <button
          type="button"
          onClick={copy}
          disabled={!address}
          aria-label="Copy your import address"
          className="shrink-0 p-1.5 rounded-lg hover:bg-white disabled:opacity-40 transition-colors"
        >
          {copied
            ? <Check size={15} className="text-emerald-600" />
            : <Copy size={15} className="text-slate-500" />}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
        Forward any email here — a newsletter, a market report, an article someone sent
        you — and it appears under <strong>From email</strong> when you write a script or
        an article in Spark Studio. Signatures, forwarding headers and unsubscribe
        footers are stripped out, and images come across as b-roll. Forwards are kept
        for 30 days.
      </p>

      <button
        type="button"
        onClick={reset}
        disabled={resetting || !address}
        className="mt-2 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
      >
        {resetting ? "Resetting…" : "Give me a new address"}
      </button>
    </div>
  );
}
