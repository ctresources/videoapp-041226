"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, DollarSign } from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type AffiliateMe = {
  affiliate: { status: "pending" | "approved" | "rejected"; refCode: string | null } | null;
  appUrl?: string;
};

/**
 * "Share SparkReels and earn", at the bottom of Settings → Profile
 * (2026-10-17, the owner's ask and mockup). Reads the same status the
 * Affiliate page does (/api/affiliate/me), so the two always agree:
 *   not an affiliate → Become an affiliate
 *   applied          → look for the approval email
 *   approved         → their referral link, with Copy
 * A rejected application shows nothing.
 */
export function AffiliateCard() {
  const [data, setData] = useState<AffiliateMe | null>(null);

  useEffect(() => {
    fetch("/api/affiliate/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AffiliateMe | null) => setData(d ?? { affiliate: null }))
      .catch(() => setData({ affiliate: null }));
  }, []);

  if (!data) return null;
  // Paid subscribers only (2026-10-28): nothing about the program otherwise.
  if ((data as { eligible?: boolean }).eligible === false) return null;
  const aff = data.affiliate;
  if (aff?.status === "rejected") return null;

  const approved = aff?.status === "approved" && !!aff.refCode;
  const refLink = approved ? `${data.appUrl || "https://sparkreels.ai"}/?ref=${aff!.refCode}` : "";

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 bg-spark-amber-tint rounded-xl flex items-center justify-center shrink-0">
          <DollarSign size={18} className="text-spark-amber" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-brand-text">
            {approved ? "Your referral link" : "Share SparkReels and earn"}
          </h3>
          <p className={`text-xs mt-0.5 ${approved ? "font-mono text-slate-500 truncate" : "text-slate-400"}`}>
            {approved
              ? refLink.replace(/^https?:\/\//, "")
              : aff?.status === "pending"
                ? "Your application is in. Look for the approval email."
                : "20% of what each customer you refer pays, for 12 months."}
          </p>
        </div>
        {approved ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(refLink).then(
                () => toast.success("Referral link copied"),
                () => toast.error("Couldn't copy — press and hold the link to copy it."),
              );
            }}
          >
            <Copy size={13} /> Copy
          </Button>
        ) : !aff ? (
          <Link href="/affiliate" className="shrink-0">
            <Button size="sm">Become an affiliate</Button>
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
