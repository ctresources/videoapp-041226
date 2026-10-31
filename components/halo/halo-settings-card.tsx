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
  // Where Get Halo goes: the referring affiliate's Halo link, or the owner's.
  const [getLink, setGetLink] = useState<{ url: string | null; code: string | null; sms: string | null; phone: string; referrer: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/halo/get-link").then((r) => (r.ok ? r.json() : null)).then((d) => d && setGetLink(d)).catch(() => {});
  }, []);

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

      {/* Get Halo (2026-10-24, the owner's mockup): for agents without a Halo
          site, through the referring affiliate's Halo link or the owner's.
          Halo bills its own $99; nothing here touches SparkReels billing. */}
      {halo.sites.length === 0 && getLink && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-[200px] flex-1 text-sm text-slate-600">
              <strong className="text-brand-text">Don&apos;t have one?</strong> Halo builds your AI-ready real estate
              website. $99/month, billed by Halo.
            </p>
            <a
              href={getLink.url ?? getLink.sms ?? "#"}
              {...(getLink.url && { target: "_blank", rel: "noopener noreferrer" })}
              // Recorded for Admin → Halo; a beacon survives the page leaving.
              onClick={() => { try { navigator.sendBeacon("/api/halo/get-link"); } catch { void fetch("/api/halo/get-link", { method: "POST", keepalive: true }); } }}
              className="shrink-0 rounded-[10px] bg-spark-blue px-3.5 py-2 text-[13.5px] font-semibold text-white hover:opacity-90"
            >
              Get Halo →
            </a>
          </div>
          {/* Plain wording (2026-10-30, the owner's ask). Where it goes is
              decided in lib/halo/get-halo.ts: the referring affiliate's Halo
              link if they're a Halo affiliate and saved one, otherwise the
              owner's sign-up page. */}
          <p className="mt-2 text-xs text-slate-400">
            {getLink.url ? "Opens Halo's sign-up page." : <>Opens a text to Halo with <strong>{getLink.code} PRO</strong> to sign up.</>}
            {getLink.referrer && " Shared by the person who referred you to SparkReels."}
          </p>
        </div>
      )}
    </Card>
  );
}
