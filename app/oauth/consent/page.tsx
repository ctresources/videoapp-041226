"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clientLabel } from "@/lib/agent/client-label";
import { ALL_SCOPES, SCOPE_LABELS, type Scope } from "@/lib/agent/types";

/**
 * The page you see when you connect ChatGPT, Claude, Gemini, Grok or another
 * AI app to SparkReels (2026-11-22, the owner's approved mockup:
 * docs/mockups/agent-connections.html).
 *
 * Supabase's OAuth 2.1 server sends people here with an authorization_id.
 * Signed-out visitors are sent to log in first and come straight back. Free
 * accounts see the upgrade message instead of Allow: external AI connections
 * are part of the paid plans.
 */

type Details = { authorization_id: string; client: { id: string; name: string }; scope: string; user: { email: string } };

export default function ConsentPage() {
  const [details, setDetails] = useState<Details | null>(null);
  const [paid, setPaid] = useState<boolean | null>(null);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("authorization_id");
    if (!id) { setError("This link is missing its connection details. Start again from your AI app."); return; }
    const supabase = createClient();
    (async () => {
      const { data, error: err } = await supabase.auth.oauth.getAuthorizationDetails(id);
      if (err || !data) { setError("This connection request has expired. Start again from your AI app."); return; }
      // Already approved before: straight back to the AI app.
      if ("redirect_url" in data && !("authorization_id" in data)) { window.location.assign(data.redirect_url); return; }
      setDetails(data as Details);
      try {
        const [allowance, me] = await Promise.all([
          fetch("/api/profile/allowance").then((r) => r.json()),
          supabase.auth.getUser(),
        ]);
        setPaid(allowance?.level ? !["visitor", "free"].includes(allowance.level) : false);
        setName(String(me.data.user?.user_metadata?.full_name ?? (data as Details).user.email ?? ""));
      } catch { setPaid(false); }
    })();
  }, []);

  const label = details ? clientLabel({ name: details.client.name, client_id: details.client.id }) : "";
  // SparkReels' own permissions. The token carries only Supabase's standard
  // scopes; what the app may do here is recorded on Allow (agent_connections).
  const scopes: Scope[] = ALL_SCOPES;

  async function decide(approve: boolean) {
    if (!details) return;
    setBusy(true);
    const supabase = createClient();
    if (approve) {
      // Record what this app may do (and clear any earlier Disconnect) first.
      const g = await fetch("/api/agent/connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant", clientId: details.client.id, clientName: details.client.name, scopes }),
      }).catch(() => null);
      if (!g?.ok) { setError("Couldn't connect. Try again from your AI app."); setBusy(false); return; }
      const { error: err } = await supabase.auth.oauth.approveAuthorization(details.authorization_id);
      if (err) { setError("Couldn't connect. Try again from your AI app."); setBusy(false); }
    } else {
      await supabase.auth.oauth.denyAuthorization(details.authorization_id);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-spark-paper px-4 py-10">
      <div className="w-full max-w-[440px] rounded-2xl border border-spark-rule bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 text-lg font-bold text-spark-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-spark-amber text-white">✦</span> SparkReels
        </div>

        {error ? (
          <p className="mt-5 text-[15px] text-spark-ink-muted">{error}</p>
        ) : !details || paid === null ? (
          <p className="mt-5 text-[15px] text-spark-ink-muted">Loading…</p>
        ) : (
          <>
            <h1 className="mt-5 text-[22px] font-semibold text-spark-ink">Connect {label} to SparkReels?</h1>
            {name && <p className="mt-1 text-[15px] text-spark-ink-muted">Signed in as {name}</p>}

            {paid ? (
              <>
                <ul className="mt-4 divide-y divide-spark-rule rounded-xl border border-spark-rule">
                  {scopes.map((s) => (
                    <li key={s} className="flex gap-2.5 px-3.5 py-3 text-[15px] text-spark-ink">
                      <span className="font-bold text-emerald-700">✓</span> {SCOPE_LABELS[s]}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex gap-2.5">
                  <button type="button" disabled={busy} onClick={() => void decide(false)}
                    className="rounded-xl border border-spark-rule bg-white px-4 py-3 text-base font-semibold text-spark-ink-muted disabled:opacity-60">
                    Cancel
                  </button>
                  <button type="button" disabled={busy} onClick={() => void decide(true)}
                    className="flex-1 rounded-xl bg-spark-amber px-4 py-3 text-base font-semibold text-white disabled:opacity-60">
                    Allow
                  </button>
                </div>
                <p className="mt-3 text-[13px] text-spark-ink-faint">
                  Nothing is made until you approve a plan. Nothing posts until you confirm it. Disconnect any time in Settings.
                </p>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-xl bg-spark-amber-tint p-3.5 text-[15px] text-spark-ink">
                  AI connections come with a SparkReels plan.
                </div>
                <div className="mt-5 flex gap-2.5">
                  <button type="button" disabled={busy} onClick={() => void decide(false)}
                    className="rounded-xl border border-spark-rule bg-white px-4 py-3 text-base font-semibold text-spark-ink-muted disabled:opacity-60">
                    Cancel
                  </button>
                  <a href="/billing" className="flex-1 rounded-xl bg-spark-amber px-4 py-3 text-center text-base font-semibold text-white">
                    See plans
                  </a>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
