"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { AiConnectSteps } from "@/components/settings/ai-connect-steps";
import type { Scope } from "@/lib/agent/types";

/**
 * Settings → AI connections (2026-11-22, the owner's approved mockup:
 * docs/mockups/agent-connections.html). The AI apps connected to SparkReels,
 * what each may do, when it was last used, and Disconnect. Personal access
 * keys can't be created here since 2026-11-23; existing ones can be revoked.
 */

interface Conn {
  id: string;
  kind: "oauth" | "key";
  client_name: string;
  scopes: string[];
  key_prefix: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

const SHORT: Record<Scope, string> = {
  "account:read": "Account",
  "sparks:plan": "Plan",
  "sparks:write": "Write",
  "videos:create": "Make videos",
  "videos:read": "Check videos",
  "publish:write": "Publish (you confirm)",
  "contacts:email": "Email contacts (you confirm)",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return h < 48 ? "yesterday" : day(iso);
}

function Chips({ scopes }: { scopes: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {scopes.filter((s): s is Scope => s in SHORT).map((s) => (
        <span key={s} className="rounded-full border border-spark-rule bg-spark-paper px-2.5 py-0.5 text-xs text-spark-ink-muted">{SHORT[s]}</span>
      ))}
    </div>
  );
}

type Acct = { id: string; name: string | null; email: string | null };

/**
 * Your accounts (2026-11-25, the owner's approved mockup:
 * docs/mockups/switch-accounts.html): accounts linked by signing in to each,
 * which AI apps can switch between when asked. Linking opens a new tab.
 */
function YourAccounts() {
  const [me, setMe] = useState<Acct | null>(null);
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/accounts/links").catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { me: Acct; accounts: Acct[] };
    setMe(d.me); setAccounts(d.accounts);
  }, []);
  useEffect(() => {
    void load();
    // Back from the link tab: show the new account without a reload.
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function linkAnother() {
    // Opened first, filled after: a window opened after an await is blocked as a pop-up.
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const r = await fetch("/api/accounts/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error();
      if (win) win.location.href = d.url; else window.location.href = d.url;
    } catch {
      win?.close();
      toast.error("Couldn't start linking. Try again.");
    } finally { setBusy(false); }
  }

  async function unlinkOne(a: Acct) {
    if (!window.confirm(`Unlink ${a.email ?? a.name ?? "this account"}?`)) return;
    const r = await fetch("/api/accounts/links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otherId: a.id }) });
    if (r.ok) { toast.success("Unlinked."); void load(); } else toast.error("Couldn't do that. Try again.");
  }

  const row = (a: Acct, right: ReactNode) => (
    <div key={a.id} className="mt-2 flex items-center gap-3 rounded-xl border border-spark-rule px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-spark-ink">{a.name || a.email}</p>
        {a.email && a.name && <p className="truncate text-[13px] text-spark-ink-muted">{a.email}</p>}
      </div>
      {right}
    </div>
  );

  return (
    <div className="mt-4 border-t border-spark-rule pt-3.5">
      <p className="text-base font-bold text-spark-ink">Your accounts</p>
      {me && row(me, <span className="shrink-0 rounded-full bg-spark-amber-tint px-2 py-0.5 text-[11px] font-bold text-[#A3660F]">This account</span>)}
      {accounts.map((a) => row(a, (
        <button type="button" onClick={() => void unlinkOne(a)} className="shrink-0 text-[13.5px] font-semibold text-[#A3660F] hover:underline">Unlink</button>
      )))}
      <button type="button" disabled={busy} onClick={() => void linkAnother()}
        className="mt-3 rounded-xl bg-spark-amber px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        Link another account
      </button>
      <p className="mt-2 text-[13px] text-spark-ink-muted">Your AI apps can switch to any account here when you ask. Unlink to stop it.</p>
    </div>
  );
}

export function AiConnectionsCard() {
  const [apps, setApps] = useState<Conn[]>([]);
  const [keys, setKeys] = useState<Conn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canConnect, setCanConnect] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/connections");
      if (r.ok) {
        const d = (await r.json()) as { apps: Conn[]; keys: Conn[]; canConnect?: boolean };
        setApps(d.apps); setKeys(d.keys); setCanConnect(d.canConnect !== false);
      }
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The website's "How to connect" lands here, once the steps have loaded.
  useEffect(() => {
    if (loaded && window.location.hash === "#ai-connections") cardRef.current?.scrollIntoView({ block: "start" });
  }, [loaded]);

  async function remove(c: Conn) {
    const what = c.kind === "oauth" ? `Disconnect ${c.client_name}?` : `Revoke the key "${c.client_name}"? Anything using it stops working.`;
    if (!window.confirm(what)) return;
    const r = await fetch("/api/agent/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) });
    if (r.ok) { toast.success(c.kind === "oauth" ? "Disconnected." : "Key revoked."); void load(); }
    else toast.error("Couldn't do that. Try again.");
  }

  return (
    <Card id="ai-connections" className="scroll-mt-28">
      <div ref={cardRef} className="scroll-mt-28" />
      <h3 className="mb-1 text-[19px] font-semibold text-spark-ink">AI connections</h3>

      {loaded && apps.length === 0 && (
        <p className="py-3 text-sm text-spark-ink-muted">No AI apps connected yet.</p>
      )}
      {apps.map((c) => (
        <div key={c.id} className="flex flex-col gap-3 border-t border-spark-rule py-3.5 first-of-type:border-t-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-bold text-spark-ink">{c.client_name}</p>
            <p className="mt-0.5 text-[13px] text-spark-ink-faint">Connected {day(c.created_at)} · Last used {ago(c.last_used_at)}</p>
            <Chips scopes={c.scopes} />
          </div>
          <button type="button" onClick={() => void remove(c)} className="self-start rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 sm:self-center">
            Disconnect
          </button>
        </div>
      ))}

      {loaded && canConnect && <YourAccounts />}

      {loaded && !canConnect && (
        <p className="text-sm text-spark-ink-muted">
          AI connections come with a SparkReels plan.{" "}
          <Link href="/settings/billing" className="font-semibold text-[#A3660F] hover:underline">See plans</Link>
        </p>
      )}
      {loaded && canConnect && apps.length === 0 && <AiConnectSteps />}
      {loaded && canConnect && apps.length > 0 && (
        <details className="mt-4 border-t border-spark-rule pt-3.5">
          <summary className="cursor-pointer text-sm font-semibold text-spark-ink-muted">How to connect</summary>
          <AiConnectSteps />
        </details>
      )}

      {/* Hidden 2026-11-23 (the owner's ask): no new keys from Settings. A key
          that already exists still shows here so it can be revoked. */}
      {keys.length > 0 && (
        <details className="mt-4 border-t border-spark-rule pt-3.5">
          <summary className="cursor-pointer text-sm font-semibold text-spark-ink-muted">Advanced · Personal access keys</summary>

          {keys.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 border-t border-spark-rule py-3.5 first-of-type:border-t-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-bold text-spark-ink">{c.client_name}</p>
                <p className="mt-0.5 text-[13px] text-spark-ink-faint">
                  {c.key_prefix}… · Created {day(c.created_at)} · Last used {ago(c.last_used_at)}{c.expires_at ? ` · Expires ${day(c.expires_at)}` : ""}
                </p>
                <Chips scopes={c.scopes} />
              </div>
              <button type="button" onClick={() => void remove(c)} className="self-start rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 sm:self-center">
                Revoke
              </button>
            </div>
          ))}
        </details>
      )}
    </Card>
  );
}
