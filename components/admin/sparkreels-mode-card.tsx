"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Admin → Users: which accounts promote SparkReels instead of real estate
 * (2026-11-01, lib/sparkreels-mode.ts). On for the demo account,
 * support@sparkreels.ai.
 */
export function SparkreelsModeCard() {
  const [accounts, setAccounts] = useState<{ id: string; email: string; full_name: string | null }[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/sparkreels-mode").then((r) => (r.ok ? r.json() : null)).then((d) => setAccounts(d?.accounts ?? [])).catch(() => setAccounts([]));
  }, []);
  useEffect(load, [load]);

  async function set(e: string, on: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sparkreels-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, on }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't change it."); return; }
      toast.success(on ? `${e} now promotes SparkReels.` : `${e} is back to real estate.`);
      setEmail("");
      load();
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-800">What these accounts promote: SparkReels</h3>
      <p className="mt-0.5 text-sm text-slate-500">
        Their Sparklee plans, AutoSparks ideas, idea chips and scripts promote SparkReels to agents, from the website&apos;s
        features and prices, with no town. Every other account stays real estate.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {accounts === null && <Loader2 size={16} className="animate-spin text-slate-400" />}
        {accounts?.length === 0 && <span className="text-sm text-slate-400">None yet.</span>}
        {accounts?.map((a) => (
          <span key={a.id} className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900">
            {a.email}
            <button type="button" onClick={() => void set(a.email, false)} disabled={busy} aria-label={`Turn off for ${a.email}`} className="text-amber-700 hover:text-red-600"><X size={14} /></button>
          </span>
        ))}
      </div>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) void set(email.trim(), true); }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Account email" type="email"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
        <button type="submit" disabled={busy || !email.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Turn on</button>
      </form>
    </div>
  );
}
