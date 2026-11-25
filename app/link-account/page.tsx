"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Linking another of your SparkReels accounts (2026-11-25, the owner's
 * approved mockup: docs/mockups/switch-accounts.html). "Link another
 * account" in Settings opens this page with a one-time code. You prove the
 * other account is yours by signing in to it here, then press Link. After
 * that, AI apps on either account can switch to the other when asked.
 */

type Acct = { id: string; name: string | null; email: string | null };

function Row({ a, tag }: { a: Acct; tag?: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-spark-rule px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-spark-ink">{a.name || a.email}</p>
        {a.email && a.name && <p className="truncate text-[13px] text-spark-ink-muted">{a.email}</p>}
      </div>
      {tag && <span className="shrink-0 rounded-full bg-spark-amber-tint px-2 py-0.5 text-[11px] font-bold text-[#A3660F]">{tag}</span>}
    </div>
  );
}

export default function LinkAccountPage() {
  const [code, setCode] = useState("");
  const [owner, setOwner] = useState<Acct | null>(null);
  const [me, setMe] = useState<Acct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code") ?? "";
    setCode(c);
    if (!c) { setError("This link is missing its code. Press Link another account in Settings again."); return; }
    void (async () => {
      const r = await fetch("/api/accounts/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", code: c }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "This link has expired. Press Link another account again."); return; }
      setOwner(d.owner as Acct);
      setMe(d.me as Acct);
    })();
  }, []);

  async function signInToOther() {
    setBusy(true);
    await createClient().auth.signOut().catch(() => null);
    window.location.assign(`/login?next=${encodeURIComponent(`/link-account?code=${encodeURIComponent(code)}`)}`);
  }

  async function link() {
    setBusy(true);
    const r = await fetch("/api/accounts/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finish", code }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Couldn't link them. Try again."); return; }
    setDone(true);
  }

  const same = !!owner && !!me && owner.id === me.id;
  return (
    <main className="flex min-h-screen items-center justify-center bg-spark-paper px-4 py-10">
      <div className="w-full max-w-[440px] rounded-2xl border border-spark-rule bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 text-lg font-bold text-spark-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-spark-amber text-white">✦</span> SparkReels
        </div>

        {error ? (
          <p className="mt-5 text-[15px] text-spark-ink-muted">{error}</p>
        ) : !owner || !me ? (
          <p className="mt-5 text-[15px] text-spark-ink-muted">Loading…</p>
        ) : done ? (
          <>
            <h1 className="mt-5 text-[22px] font-semibold text-spark-ink">Linked.</h1>
            <Row a={owner} />
            <Row a={me} tag="Signed in" />
            <p className="mt-3 text-[14px] text-spark-ink-muted">Your AI apps on either account can switch to the other.</p>
            <a href="/settings#ai-connections" className="mt-5 block rounded-xl bg-spark-amber px-4 py-3 text-center text-base font-semibold text-white">Back to Settings</a>
          </>
        ) : same ? (
          <>
            <h1 className="mt-5 text-[22px] font-semibold text-spark-ink">Sign in to the other account</h1>
            <Row a={me} tag="Signed in" />
            <p className="mt-3 text-[14px] text-spark-ink-muted">Sign in to the account you want to link. You come straight back here.</p>
            <div className="mt-5 flex gap-2.5">
              <a href="/settings#ai-connections" className="rounded-xl border border-spark-rule bg-white px-4 py-3 text-base font-semibold text-spark-ink-muted">Cancel</a>
              <button type="button" disabled={busy} onClick={() => void signInToOther()}
                className="flex-1 rounded-xl bg-spark-amber px-4 py-3 text-base font-semibold text-white disabled:opacity-60">
                Sign in to another account
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[22px] font-semibold text-spark-ink">Link these accounts?</h1>
            <Row a={owner} />
            <Row a={me} tag="Signed in" />
            <p className="mt-3 text-[14px] text-spark-ink-muted">Your AI apps on either account can switch to the other.</p>
            <div className="mt-5 flex gap-2.5">
              <a href="/settings#ai-connections" className="rounded-xl border border-spark-rule bg-white px-4 py-3 text-base font-semibold text-spark-ink-muted">Cancel</a>
              <button type="button" disabled={busy} onClick={() => void link()}
                className="flex-1 rounded-xl bg-spark-amber px-4 py-3 text-base font-semibold text-white disabled:opacity-60">
                Link
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
