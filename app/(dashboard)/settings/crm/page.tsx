"use client";

import { Webhook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CrmIntegrations } from "@/components/settings/crm-integrations";
import { BoldTrailConnect } from "@/components/settings/boldtrail-connect";
import { HaloSettingsCard } from "@/components/halo/halo-settings-card";
import { LockedFeature } from "@/components/access/locked-feature";
import { useAccount } from "@/lib/hooks/use-account";

/**
 * Settings → CRM (2026-10-30, the owner's ask): the CRM integration
 * (BoldTrail, GoHighLevel webhooks) and the Halo website, moved out of
 * Profile into their own tab. Step 10 in How It Works. Paid plans only.
 */
export default function CrmSettingsPage() {
  const account = useAccount();
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-brand-text">10 · CRM</h2>
        <p className="text-sm text-slate-500 mt-0.5">Connect the CRM you already use, and your Halo website</p>
      </div>

      <Card id="crm" className="scroll-mt-28">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-spark-amber-tint rounded-xl flex items-center justify-center">
            <Webhook size={18} className="text-spark-amber" />
          </div>
          <div>
            <h3 className="font-semibold text-brand-text">CRM Integration</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              BoldTrail connects by token below; webhooks notify GoHighLevel when videos publish
            </p>
          </div>
        </div>
        {/* Paid plans only since 2026-10-28; nothing shows until the plan is known. */}
        {account?.paid ? (
          <>
            <BoldTrailConnect />
            <CrmIntegrations />
          </>
        ) : account ? (
          <LockedFeature compact feature="CRM Integration" body="Connect BoldTrail and GoHighLevel with a paid plan." />
        ) : null}
      </Card>

      {/* Halo website (paid plans). */}
      {account?.paid ? <HaloSettingsCard /> : account ? (
        <LockedFeature compact feature="Halo website" body="Turn your Halo website posts into videos with a paid plan." />
      ) : null}
    </div>
  );
}
