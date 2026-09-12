"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/providers/supabase-provider";
import {
  listRecoveries,
  deleteRecovery,
  downloadRecovery,
  describeAge,
  describeSize,
  type RecoveryRecord,
} from "@/lib/utils/pending-upload";

/**
 * Signing out with recordings still waiting on this device.
 *
 * The recovery copies are scoped to whoever made them, so they are not lost by
 * signing out — but they are invisible until that person signs back in on this
 * same browser, and nobody would guess that. Worse, someone signing out to
 * hand the computer over has one last moment to take their recording with
 * them, and leaving silently spends it.
 *
 * So: say what is waiting, and offer the three things worth doing about it.
 * Retry needs the session that is about to end, which is exactly why it is
 * offered here rather than afterwards.
 *
 * `trigger` is a render prop so each sign-out keeps its own styling — the
 * sidebar's form button and the Settings page's Button component — while the
 * check and the dialog stay in one place.
 */
export function SignOutGuard({
  trigger,
  onProceed,
}: {
  trigger: (requestSignOut: () => void) => React.ReactNode;
  /** Actually sign out. The sidebar submits its form; Settings calls Supabase. */
  onProceed: () => void;
}) {
  const { user } = useAuth();
  const [pending, setPending] = useState<RecoveryRecord[]>([]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) { setPending([]); return; }
    let live = true;
    listRecoveries(user.id).then((rs) => { if (live) setPending(rs); });
    return () => { live = false; };
  }, [user?.id]);

  function requestSignOut() {
    // Nothing waiting: sign out is sign out, with nothing worth interrupting.
    if (pending.length === 0) { onProceed(); return; }
    setAsking(true);
  }

  async function remove(rec: RecoveryRecord) {
    if (!confirm("Remove this recording from your device? It was never uploaded, so this cannot be undone.")) return;
    setBusy(true);
    await deleteRecovery(rec.id);
    setPending((prev) => prev.filter((r) => r.id !== rec.id));
    setBusy(false);
  }

  return (
    <>
      {trigger(requestSignOut)}

      {asking && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-spark-amber" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {pending.length === 1
                    ? "A recording is still waiting on this device"
                    : `${pending.length} recordings are still waiting on this device`}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  These haven&apos;t finished uploading. They stay on this device and belong to
                  your account only — but you&apos;ll need to sign back in here to reach them.
                </p>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {pending.map((rec) => (
                <li
                  key={rec.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-spark-rule bg-spark-amber/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{rec.title}</p>
                    <p className="text-xs text-slate-500">
                      {describeSize(rec.blob.size)} · recorded {describeAge(rec.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => downloadRecovery(rec)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-lg border border-spark-rule px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
                    >
                      <Download size={13} /> Download
                    </button>
                    <button
                      onClick={() => remove(rec)}
                      disabled={busy}
                      className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {/* Retrying needs the session that is about to end, so going back
                  is how you retry — the recorder's own Retry Upload does it. */}
              <button
                onClick={() => setAsking(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                Stay and retry
              </button>
              <button
                onClick={() => { setBusy(true); onProceed(); }}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Sign out anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
