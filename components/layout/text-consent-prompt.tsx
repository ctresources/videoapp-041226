"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { isValidMobile } from "@/lib/utils/format-phone";

/**
 * Asks once for a mobile number and consent to texts (2026-11-22, the owner's
 * approved mockup), for users who signed up before the consent box existed.
 * The box starts unticked and is never required; Save and Not now both mark
 * it asked, so it doesn't come back.
 */
export function TextConsentPrompt() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A moment after the page settles, so it isn't the first thing that flashes.
    const t = setTimeout(() => {
      fetch("/api/profile/text-consent")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { show?: boolean; mobile?: string } | null) => {
          if (cancelled || !d?.show) return;
          setMobile(d.mobile ?? "");
          setOpen(true);
        })
        .catch(() => {});
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  async function send(action: "save" | "later") {
    if (action === "save" && !isValidMobile(mobile)) {
      setError(true);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/profile/text-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mobile, consent }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || "Couldn't save. Try again.");
        return;
      }
      if (action === "save") toast.success("Saved.");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="text-consent-title" className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="text-consent-title" className="text-[21px] font-semibold text-spark-ink">
          Get SparkReels tips by text
        </h2>

        <label className="mt-4 block text-[13px] font-semibold text-spark-ink-muted">
          Mobile Number
          <input
            type="tel"
            value={mobile}
            onChange={(e) => { setMobile(e.target.value); setError(false); }}
            placeholder="(215) 555-0142"
            autoComplete="tel"
            className={`mt-1.5 w-full rounded-xl border px-3.5 py-3 text-base font-normal text-spark-ink outline-none focus:border-spark-amber ${error ? "border-red-400" : "border-spark-rule"}`}
          />
        </label>
        <p className={`mt-1.5 text-[12.5px] ${error ? "text-red-600" : "text-spark-ink-faint"}`}>
          {error ? "Enter a valid mobile number. Outside the US, start with +." : "Never shown on your videos. Outside the US, start with +."}
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-spark-rule p-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-[18px] shrink-0 accent-spark-amber"
          />
          <span className="text-[13px] leading-relaxed text-spark-ink-muted">
            Text me occasional tips and updates about SparkReels at this number. Message and data
            rates may apply, frequency varies, and you can reply STOP at any time.
          </span>
        </label>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => void send("later")}
            disabled={busy}
            className="rounded-xl border border-spark-rule bg-white px-4 py-3 text-[15px] font-semibold text-spark-ink-muted disabled:opacity-60"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void send("save")}
            disabled={busy}
            className="flex-1 rounded-xl bg-spark-amber px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
