"use client";

import { Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHomeScreen } from "@/lib/hooks/use-home-screen";

/**
 * The Phone step on Settings → Profile (2026-10-17), worded as the owner
 * approved it. On Android, Add does it in one tap when Chrome allows.
 */
export function HomeScreenCard({ id }: { id: string }) {
  const { canInstall, install } = useHomeScreen();

  return (
    <Card id={id} className="scroll-mt-28">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 bg-spark-amber/10 rounded-xl flex items-center justify-center">
          <Smartphone size={18} className="text-spark-amber" />
        </div>
        <div>
          <h3 className="font-semibold text-brand-text">7 · Put SparkReels on your phone</h3>
          <p className="text-xs text-slate-400 mt-0.5">Opens like an app, one tap from your Home Screen.</p>
        </div>
      </div>
      <ul className="space-y-2 text-sm text-slate-600">
        <li>
          <strong>iPhone:</strong> open sparkreels.ai in <strong>Safari</strong>, tap <strong>Share</strong> (the
          square with an arrow), then <strong>Add to Home Screen</strong>.
        </li>
        <li>
          <strong>Android:</strong> open it in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu, then{" "}
          <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
        </li>
      </ul>
      {canInstall && (
        <Button
          className="mt-4"
          onClick={async () => {
            if (await install()) toast.success("Added to your Home Screen");
          }}
        >
          Add
        </Button>
      )}
    </Card>
  );
}
