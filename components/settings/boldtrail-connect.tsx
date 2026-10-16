"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle, Loader2, Send } from "lucide-react";

/**
 * Connect BoldTrail with an API token (2026-10-15), so SparkReels can email a
 * seller through BoldTrail. The token is made in BoldTrail: Lead Engine →
 * Lead Dropbox → My API Tokens → Generate. Saved encrypted on the server and
 * never shown again; only its last four characters come back.
 *
 * Admins also get the one-off test: two emails to one of their own BoldTrail
 * contacts, to see what BoldTrail does with SparkReels' email layout.
 */

type Status = { connected: boolean; last4: string | null; canTest: boolean };
type TestResult = { contactId: string | number; contactName: string | null; results: { which: string; status: number; ok: boolean; reply: string }[] };

const input = "w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white";

export function BoldTrailConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testId, setTestId] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    fetch("/api/integrations/boldtrail")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => setStatus({ connected: false, last4: null, canTest: false }));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/boldtrail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't connect BoldTrail.");
      setStatus((s) => ({ connected: true, last4: d.last4, canTest: s?.canTest ?? false }));
      setToken("");
      toast.success("BoldTrail connected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't connect BoldTrail.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Disconnect BoldTrail? SparkReels forgets the token. You can also delete it in BoldTrail.")) return;
    await fetch("/api/integrations/boldtrail", { method: "DELETE" });
    setStatus((s) => ({ connected: false, last4: null, canTest: s?.canTest ?? false }));
    setResult(null);
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/integrations/boldtrail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testId.trim() ? { contactId: testId.trim() } : { email: testEmail.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "The test didn't run.");
      setResult(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The test didn't run.");
    } finally {
      setTesting(false);
    }
  }

  if (!status) return null;

  return (
    <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <p className="text-sm font-semibold text-slate-700">BoldTrail</p>
      {status.connected ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle size={15} /> Connected{status.last4 ? ` · token ending ${status.last4}` : ""}
          </span>
          <button type="button" onClick={remove} className="text-xs font-semibold text-slate-500 hover:text-red-600">
            Disconnect
          </button>
        </div>
      ) : (
        // Off for autofill, like the webhook form: this box is not a password.
        <form
          autoComplete="off"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          className="mt-2 flex flex-col gap-2"
        >
          <p className="text-xs text-slate-500">
            In BoldTrail: Lead Engine → Lead Dropbox → My API Tokens. Tick <strong>Contacts</strong>, press Generate, copy the token, and paste it here.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              name="boldtrail-api-token"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your BoldTrail API token"
              className={`${input} min-w-0 flex-1`}
            />
            <button
              type="submit"
              disabled={saving || token.trim().length < 20}
              className="spark-cta-gradient flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Connect
            </button>
          </div>
        </form>
      )}

      {status.connected && status.canTest && (
        <div className="mt-4 border-t border-orange-200 pt-3">
          <p className="text-xs font-semibold text-slate-600">Test (admins only)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Sends two test emails to one of your own BoldTrail contacts, nobody else. Then check that inbox and the contact&apos;s history in BoldTrail.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="email"
              name="boldtrail-test-contact"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Contact's email in BoldTrail"
              className={`${input} min-w-0 flex-1`}
            />
            <input
              type="text"
              name="boldtrail-test-contact-id"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={testId}
              onChange={(e) => setTestId(e.target.value)}
              placeholder="or contact ID"
              className={`${input} w-[140px]`}
            />
            <button
              type="button"
              onClick={test}
              disabled={testing || (!testEmail.includes("@") && !testId.trim())}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test emails
            </button>
          </div>
          {result && (
            <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">
                Contact {result.contactName ? `${result.contactName} ` : ""}(ID {String(result.contactId)})
              </p>
              {result.results.map((r) => (
                <p key={r.which} className={r.ok ? "text-green-700" : "text-red-700"}>
                  {r.which}: {r.ok ? "BoldTrail accepted it" : `BoldTrail said ${r.status}`}{r.reply ? ` · ${r.reply}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
