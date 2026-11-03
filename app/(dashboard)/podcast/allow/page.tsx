"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A Spark Podcast partner's page (2026-11-02, the owner's approved mockup):
 * the invitation link opens here. Allow or No thanks, and the list of who may
 * use their twin, each with Remove. Open to any signed-in account; it doesn't
 * need Spark Podcast itself.
 */
interface Invite {
  hostName: string; hostCompany: string | null; role: string | null; status: string;
  sentTo: string | null; id: string; hasTwin: boolean; hasVoice: boolean;
}
interface Allowed { id: string; name: string; company: string | null }

function AllowInner() {
  const t = useSearchParams().get("t") ?? "";
  const [inv, setInv] = useState<Invite | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<Allowed[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (t) {
      const r = await fetch(`/api/podcast/partners/respond?t=${encodeURIComponent(t)}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setInv(d as Invite); else setErr(d.error || "This invitation link isn't valid any more.");
    }
    const l = await fetch("/api/podcast/partners").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setAllowed((l?.allowedMe ?? []) as Allowed[]);
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function answer(allow: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/podcast/partners/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t, allow }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error || "Couldn't save that."); return; }
      toast.success(allow ? "Done. You're their co-host." : "No problem. Nothing will be made with your twin.");
      await load();
    } finally { setBusy(false); }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Stop ${name} from using your twin?`)) return;
    await fetch(`/api/podcast/partners?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    toast.success("Removed.");
    await load();
  }

  const first = inv?.hostName.split(/\s+/)[0] ?? "";
  return (
    <div className="mx-auto w-full max-w-[600px] py-6">
      <div className="rounded-2xl border border-spark-rule bg-white p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-spark-amber text-white"><Mic size={24} /></span>
        {!inv && !err && t && <Loader2 className="mx-auto mt-4 animate-spin text-spark-amber" />}
        {err && <p className="mt-4 text-[15px] text-spark-ink">{err}</p>}
        {inv && (
          <>
            <h1 className="mt-3 text-[24px] font-bold text-spark-ink">{inv.hostName} would like you on their podcast</h1>
            {inv.role && <p className="text-[15px] text-spark-ink-muted">as their {inv.role}</p>}
            {inv.sentTo ? (
              <p className="mt-4 text-[15px] text-spark-ink">This invitation was sent to <b>{inv.sentTo}</b>. Sign in with that email to answer it.</p>
            ) : (
              <>
                <ul className="mx-auto mt-4 max-w-[460px] list-disc pl-5 text-left text-[15px] leading-relaxed text-spark-ink-soft">
                  <li>Your Digital Twin talks in your own voice, on lines {first} writes.</li>
                  <li>You get a copy of every episode you&apos;re in.</li>
                  <li>Take your yes back any time, here.</li>
                </ul>
                {inv.status === "allowed" ? (
                  <p className="mt-4 text-[15px] font-semibold text-[#0f7a52]">✓ You said yes.</p>
                ) : inv.status === "removed" ? (
                  <p className="mt-4 text-[15px] text-spark-ink-muted">This invitation was withdrawn.</p>
                ) : (
                  <div className="mt-5 flex justify-center gap-2">
                    <Button onClick={() => void answer(true)} loading={busy}>Allow</Button>
                    <button type="button" onClick={() => void answer(false)} disabled={busy}
                      className="rounded-xl border border-spark-rule bg-white px-4 py-2 text-[15px] font-semibold text-spark-ink hover:border-spark-amber">No thanks</button>
                  </div>
                )}
                {inv.status === "declined" && <p className="mt-2 text-[13px] text-spark-ink-muted">You said no. You can still change your mind.</p>}
                {(!inv.hasTwin || !inv.hasVoice) && (
                  <p className="mt-4 text-[13.5px] text-spark-ink-muted">
                    {!inv.hasTwin ? "You don't have an approved Digital Twin yet. " : "Your voice isn't set up yet. "}
                    <Link href={!inv.hasTwin ? "/settings#twin" : "/settings#voice"} className="font-semibold text-[#A3660F] underline">{!inv.hasTwin ? "Make it in Settings" : "Set it up in Settings"}</Link>
                  </p>
                )}
              </>
            )}
          </>
        )}

        <div className="mt-6 border-t border-spark-rule pt-4 text-left">
          <p className="mb-2 text-[14px] font-bold text-spark-ink-soft">Who can use your twin</p>
          {allowed.length === 0 && <p className="text-[14px] text-spark-ink-muted">No one.</p>}
          {allowed.map((a) => (
            <p key={a.id} className="flex items-center justify-between py-1 text-[15px] text-spark-ink">
              <span>{a.name}{a.company ? ` · ${a.company}` : ""}</span>
              <button type="button" onClick={() => void remove(a.id, a.name)} className="text-[14px] font-bold text-[#A3660F] underline">Remove</button>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PodcastAllowPage() {
  return <Suspense fallback={null}><AllowInner /></Suspense>;
}
