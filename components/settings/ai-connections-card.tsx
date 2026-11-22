"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ALL_SCOPES, type Scope } from "@/lib/agent/types";

/**
 * Settings → AI connections (2026-11-22, the owner's approved mockup:
 * docs/mockups/agent-connections.html). The AI apps connected to SparkReels,
 * what each may do, when it was last used, and Disconnect. Personal access
 * keys sit under Advanced: shown once, revocable, optional expiry.
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
};
const FORM_LABEL: Record<Scope, string> = {
  "account:read": "See plan and accounts",
  "sparks:plan": "Plan Sparks",
  "sparks:write": "Write scripts and copy",
  "videos:create": "Make videos",
  "videos:read": "Check videos",
  "publish:write": "Ask to publish",
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

export function AiConnectionsCard() {
  const [apps, setApps] = useState<Conn[]>([]);
  const [keys, setKeys] = useState<Conn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Scope[]>(["account:read", "sparks:plan", "videos:read"]);
  const [expires, setExpires] = useState<number | null>(90);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/connections");
      if (r.ok) {
        const d = (await r.json()) as { apps: Conn[]; keys: Conn[] };
        setApps(d.apps); setKeys(d.keys);
      }
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function remove(c: Conn) {
    const what = c.kind === "oauth" ? `Disconnect ${c.client_name}?` : `Revoke the key "${c.client_name}"? Anything using it stops working.`;
    if (!window.confirm(what)) return;
    const r = await fetch("/api/agent/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) });
    if (r.ok) { toast.success(c.kind === "oauth" ? "Disconnected." : "Key revoked."); void load(); }
    else toast.error("Couldn't do that. Try again.");
  }

  async function createKey() {
    setBusy(true);
    try {
      const r = await fetch("/api/agent/connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_key", name, scopes: picked, expiresInDays: expires }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Couldn't create the key."); return; }
      setNewKey(d.key); setName(""); void load();
    } finally { setBusy(false); }
  }

  return (
    <Card id="ai-connections" className="scroll-mt-28">
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

        <div className="mt-3.5 grid gap-3 rounded-xl border border-spark-rule p-4">
          <label className="text-[13px] font-semibold text-spark-ink-muted">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier"
              className="mt-1.5 w-full rounded-xl border border-spark-rule px-3 py-2.5 text-[15px] font-normal text-spark-ink outline-none focus:border-spark-amber" />
          </label>
          <div>
            <p className="text-[13px] font-semibold text-spark-ink-muted">Can</p>
            <div className="mt-1.5 grid gap-x-4 gap-y-1.5 text-sm text-spark-ink sm:grid-cols-2">
              {ALL_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.includes(s)} className="accent-spark-amber"
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} />
                  {FORM_LABEL[s]}
                </label>
              ))}
            </div>
          </div>
          <label className="text-[13px] font-semibold text-spark-ink-muted">
            Expires
            <select value={expires ?? "never"} onChange={(e) => setExpires(e.target.value === "never" ? null : Number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-spark-rule bg-white px-3 py-2.5 text-[15px] font-normal text-spark-ink">
              <option value={90}>In 90 days</option>
              <option value={30}>In 30 days</option>
              <option value={365}>In 1 year</option>
              <option value="never">Never</option>
            </select>
          </label>
          <button type="button" disabled={busy || !picked.length} onClick={() => void createKey()}
            className="justify-self-start rounded-xl bg-spark-amber px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-60">
            Create key
          </button>
        </div>

        {newKey && (
          <div className="mt-3 rounded-xl bg-spark-ink p-3.5 font-mono text-sm text-white">
            <div className="flex items-start justify-between gap-3">
              <span className="break-all">{newKey}</span>
              <button type="button" aria-label="Copy key" className="shrink-0 text-white/80 hover:text-white"
                onClick={() => { void navigator.clipboard.writeText(newKey); toast.success("Copied."); }}>
                <Copy size={16} />
              </button>
            </div>
            <p className="mt-2 font-sans text-xs text-white/70">Copy it now. You won&apos;t see it again.</p>
          </div>
        )}
      </details>
    </Card>
  );
}
