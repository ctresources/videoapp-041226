"use client";

import { useEffect, useState } from "react";
import { Globe, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/supabase-provider";
import { PAID_TIERS } from "@/lib/utils/plan-features";
import { useHalo } from "@/components/halo/use-halo";
import { HaloSitesCard } from "@/components/halo/halo-sites-card";

/**
 * Halo website, in Settings after 8 · CRM Integration (2026-10-24, the
 * owner's mockup). It was a box on the AutoSparks page, where it meant nothing
 * to the many agents without a Halo website. Now it's one closed line until a
 * site is added; the drafts it makes still show on AutoSparks. Optional and
 * unnumbered, like Share and earn, so Settings 1–11 keep matching How It Works.
 * Paid plans only, because the drafts are approved on AutoSparks, which is.
 */
export function HaloSettingsCard() {
  const { user } = useAuth();
  const halo = useHalo(user?.id);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => setEligible(!!a && (a.isAdmin || PAID_TIERS.includes(a.tier))))
      .catch(() => setEligible(false));
  }, []);

  if (!eligible || !halo.loaded || !halo.settings) return null;
  const full = open || halo.sites.length > 0;

  return (
    <Card id="halo" className="scroll-mt-28">
      <div className={`flex flex-wrap items-center gap-3 ${full ? "mb-4" : ""}`}>
        <div className="w-9 h-9 bg-spark-amber-tint rounded-xl flex items-center justify-center shrink-0">
          <Globe size={18} className="text-spark-amber" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-brand-text">Halo website</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {full ? "Drafts show up on AutoSparks, ready to Approve" : "Have a Halo website? Each new page becomes a video draft."}
          </p>
        </div>
        {!full && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1">
            <Plus size={14} /> Add your Halo site
          </Button>
        )}
      </div>
      {full && <HaloSitesCard halo={halo} bare />}
    </Card>
  );
}
