"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DollarSign, Check, Sparkles, Lock } from "lucide-react";
import { AFFILIATE_ELIGIBILITY_TEXT } from "@/lib/access";

/**
 * The affiliate application. Since 2026-10-28 (the owner's rule) only active
 * paid subscribers may apply, so the form shows only to a signed-in, eligible
 * account; everyone else is told who the program is for. The API checks the
 * same thing (app/api/affiliate/apply).
 */
type Who = "loading" | "signed_out" | "not_eligible" | "already" | "eligible";

export default function AffiliateApplyPage() {
  const [who, setWho] = useState<Who>("loading");
  const [form, setForm] = useState({ fullName: "", website: "", promotionPlan: "" });
  const [loading, setLoading] = useState(false);
  const [submittedTo, setSubmittedTo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/affiliate/me")
      .then(async (r) => {
        if (r.status === 401) return setWho("signed_out");
        const d = await r.json().catch(() => null);
        if (!d || d.eligible === false) return setWho("not_eligible");
        setWho(d.affiliate ? "already" : "eligible");
      })
      .catch(() => setWho("signed_out"));
  }, []);

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      toast.error("Your name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/affiliate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSubmittedTo(data.email || "your account email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  const intro = (
    <div className="text-center mb-6">
      <div className="w-12 h-12 rounded-2xl bg-primary-500 flex items-center justify-center mx-auto mb-3">
        <DollarSign className="w-6 h-6 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-brand-text">Become a SparkReels Affiliate</h1>
      <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
        Earn <strong>20% commission</strong> on every customer you refer — recurring for their
        first <strong>12 months</strong>. Payouts sent monthly straight to your bank.
      </p>
      <p className="text-sm font-medium text-slate-700 mt-2 max-w-md mx-auto">{AFFILIATE_ELIGIBILITY_TEXT}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-black text-brand-text">SparkReels</Link>

      <div className="w-full max-w-lg">
        {submittedTo ? (
          <Card className="text-center py-10">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-brand-text mb-2">Application received!</h1>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Thanks for applying to the SparkReels affiliate program. We review every application
              and will email you at <strong>{submittedTo}</strong> once you&apos;re approved.
            </p>
            <Link href="/affiliate" className="inline-block mt-6 text-sm font-semibold text-primary-600 hover:underline">
              Go to the Affiliate page
            </Link>
          </Card>
        ) : (
          <>
            {intro}
            {who === "loading" && (
              <Card><p className="py-6 text-center text-sm text-slate-400">Loading…</p></Card>
            )}
            {(who === "signed_out" || who === "not_eligible") && (
              <Card className="text-center py-8">
                <Lock className="w-6 h-6 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-600 max-w-sm mx-auto">
                  {who === "signed_out"
                    ? "Already a subscriber? Sign in to apply."
                    : "Choose a SparkReels plan, then come back here to apply."}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  {who === "signed_out" ? (
                    <>
                      <Link href="/login"><Button>Sign in</Button></Link>
                      <Link href="/pricing" className="text-sm font-semibold text-primary-600 hover:underline">See plans</Link>
                    </>
                  ) : (
                    <Link href="/settings/billing"><Button>View Plans</Button></Link>
                  )}
                </div>
              </Card>
            )}
            {who === "already" && (
              <Card className="text-center py-8">
                <p className="text-sm text-slate-600">You&apos;ve already applied.</p>
                <Link href="/affiliate" className="inline-block mt-4 text-sm font-semibold text-primary-600 hover:underline">
                  Go to the Affiliate page
                </Link>
              </Card>
            )}
            {who === "eligible" && (
              <Card>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
                    <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Sarah Johnson" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Website or social <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="instagram.com/yourhandle" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      How will you promote SparkReels? <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      value={form.promotionPlan}
                      onChange={(e) => set("promotionPlan", e.target.value)}
                      rows={3}
                      placeholder="e.g. my real estate coaching audience, YouTube channel, agent Facebook group…"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400 resize-none"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full gap-2">
                    {loading ? "Submitting…" : <>Apply to join <Sparkles size={15} /></>}
                  </Button>
                  <p className="text-xs text-slate-400 text-center">
                    We&apos;ll email your account address. By applying you agree to our{" "}
                    <Link href="/terms" className="underline">Terms</Link>. We review applications manually.
                  </p>
                </form>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
