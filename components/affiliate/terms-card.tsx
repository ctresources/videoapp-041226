"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, FileText, CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AFFILIATE_TERMS, AFFILIATE_TERMS_INTRO, AFFILIATE_TERMS_VERSION } from "@/lib/affiliate-terms";

/**
 * The SparkReels.ai Affiliate Program Terms on the Affiliate page (2026-11-07,
 * the owner's ask, like Halo's): the terms in a scrolling box, a checkbox and
 * Accept. Once accepted it folds to one line with a way to read them again.
 */
export function AffiliateTermsCard({ acceptedAt, onAccepted }: {
  acceptedAt: string | null;
  onAccepted: (at: string) => void;
}) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const text = (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 space-y-2.5">
      <p className="font-semibold text-slate-700">SparkReels.ai Affiliate Program Terms (version {AFFILIATE_TERMS_VERSION})</p>
      <p>{AFFILIATE_TERMS_INTRO}</p>
      {AFFILIATE_TERMS.map((s) => (
        <p key={s.title}><span className="font-semibold text-slate-700">{s.title}</span> {s.body}</p>
      ))}
    </div>
  );

  if (acceptedAt) {
    const when = new Date(acceptedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return (
      <Card className="mb-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <CircleCheck size={15} className="text-green-500 shrink-0" />
          <span>Terms accepted {when}</span>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium text-spark-amber hover:underline">
            {open ? "Hide terms" : "View terms"}
          </button>
        </div>
        {open && <div className="mt-3">{text}</div>}
      </Card>
    );
  }

  const accept = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/affiliate/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: AFFILIATE_TERMS_VERSION }),
      });
      const out = await r.json().catch(() => ({})) as { termsAcceptedAt?: string; error?: string };
      if (!r.ok || !out.termsAcceptedAt) { toast.error(out.error || "Couldn't save it. Try again."); return; }
      toast.success("Terms accepted");
      onAccepted(out.termsAcceptedAt);
    } catch {
      toast.error("Couldn't save it. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-5 border-spark-amber">
      <div className="mb-2 flex items-center gap-2">
        <FileText size={16} className="text-spark-amber" />
        <p className="text-sm font-bold text-brand-text">SparkReels.ai Affiliate Program Terms</p>
      </div>
      <p className="mb-3 text-xs text-slate-500">Accept to keep earning on new referrals and payouts.</p>
      {text}
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d97706]" />
        <span>I&apos;ve read and accept the SparkReels.ai Affiliate Program Terms ({AFFILIATE_TERMS_VERSION}).</span>
      </label>
      <Button onClick={accept} disabled={!checked || saving} className="mt-3 gap-1.5">
        {saving && <Loader2 size={14} className="animate-spin" />} Accept terms
      </Button>
    </Card>
  );
}
