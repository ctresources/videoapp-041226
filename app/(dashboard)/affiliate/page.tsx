"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  DollarSign, Copy, Check, MousePointerClick, UserCheck, Clock, Wallet, CircleCheck, Loader2,
} from "lucide-react";

interface Me {
  affiliate: {
    status: "pending" | "approved" | "rejected";
    refCode: string | null;
    connectStatus: "not_started" | "pending" | "complete" | "restricted";
    commissionRate: number;
    commissionDurationMonths: number;
  } | null;
  stats?: { clicks: number; conversions: number; pendingCents: number; availableCents: number; paidCents: number };
  appUrl?: string;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AffiliatePage() {
  const [data, setData] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/affiliate/me")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => toast.error("Couldn't load your affiliate status"))
      .finally(() => setLoading(false));
  }, []);

  // Reflect the ?connect=done / ?error= redirect from the Stripe Connect flow.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connect") === "done") toast.success("Stripe connection updated");
    if (p.get("error") === "not_approved") toast.error("Your affiliate application isn't approved yet");
    if (p.get("error") === "connect_failed") toast.error("Couldn't start Stripe onboarding — please try again");
  }, []);

  const header = (
    <div className="mb-6 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center">
        <DollarSign className="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-brand-text">Affiliate Program</h2>
        <p className="text-sm text-slate-500">Earn 20% recurring commission for a referral&apos;s first 12 months.</p>
      </div>
    </div>
  );

  if (loading) {
    return <div className="max-w-4xl mx-auto">{header}<Card><p className="text-sm text-slate-400 py-6 text-center">Loading…</p></Card></div>;
  }

  const aff = data?.affiliate;

  // Not an affiliate yet → apply CTA
  if (!aff) {
    return (
      <div className="max-w-4xl mx-auto">
        {header}
        <Card className="text-center py-10">
          <h3 className="text-lg font-bold text-brand-text mb-2">Join the SparkReels affiliate program</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
            Refer new customers and earn 20% commission on their subscription — recurring for their first 12 months,
            paid monthly to your bank.
          </p>
          <Link href="/affiliates/apply"><Button className="gap-2"><DollarSign size={15} /> Apply to join</Button></Link>
        </Card>
      </div>
    );
  }

  if (aff.status === "pending") {
    return (
      <div className="max-w-4xl mx-auto">
        {header}
        <Card className="text-center py-10">
          <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-brand-text mb-1">Application under review</h3>
          <p className="text-sm text-slate-500">We review every application and will email you once you&apos;re approved.</p>
        </Card>
      </div>
    );
  }

  if (aff.status === "rejected") {
    return (
      <div className="max-w-4xl mx-auto">
        {header}
        <Card className="text-center py-10">
          <h3 className="text-lg font-bold text-brand-text mb-1">Application not approved</h3>
          <p className="text-sm text-slate-500">Thanks for your interest. Reach out to support if you have questions.</p>
        </Card>
      </div>
    );
  }

  // Approved
  const stats = data!.stats!;
  const refLink = `${data!.appUrl || ""}/?ref=${aff.refCode}`;
  const copy = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Referral link copied");
  };

  const statCards = [
    { label: "Clicks", value: String(stats.clicks), icon: MousePointerClick, color: "text-spark-blue", bg: "bg-spark-blue/10" },
    { label: "Conversions", value: String(stats.conversions), icon: UserCheck, color: "text-spark-amber", bg: "bg-spark-amber-tint" },
    { label: "Pending", value: money(stats.pendingCents), icon: Clock, color: "text-amber-500", bg: "bg-amber-50" },
    { label: "Available", value: money(stats.availableCents), icon: Wallet, color: "text-primary-500", bg: "bg-primary-50" },
    { label: "Paid Out", value: money(stats.paidCents), icon: CircleCheck, color: "text-green-500", bg: "bg-green-50" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {header}

      {/* Referral link */}
      <Card className="mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Your referral link</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 min-w-0 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 truncate">{refLink}</code>
          <Button size="sm" onClick={copy} className="gap-1.5 shrink-0">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Share it anywhere. You earn {Math.round(aff.commissionRate * 100)}% of every subscription payment a referred
          customer makes for their first {aff.commissionDurationMonths} months.
        </p>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="flex flex-col gap-1">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}><Icon size={16} className={color} /></div>
            <p className="text-lg font-bold text-brand-text">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </Card>
        ))}
      </div>

      {/* Payouts / Stripe Connect */}
      <Card>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Getting paid</p>
        {aff.connectStatus === "complete" ? (
          <div className="flex items-center gap-2">
            <Badge variant="success">Payouts Active</Badge>
            <p className="text-sm text-slate-500">Available balances of $50+ are paid to your bank monthly.</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-500 max-w-md">
              Connect your bank with Stripe to receive payouts. Balances build up until then — nothing is lost.
            </p>
            <a href="/api/affiliate/connect" className="shrink-0">
              <Button className="gap-1.5"><Wallet size={15} /> Connect with Stripe</Button>
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
