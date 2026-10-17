"use client";

import { useEffect, useState } from "react";
import { Share, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import { useHomeScreen } from "@/lib/hooks/use-home-screen";

const DISMISSED_KEY = "sr-home-screen-tip-dismissed";

/**
 * "Put SparkReels on your Home Screen", at the top of Create on a phone only
 * (2026-10-17, the owner's mockup). Never on a computer, never once the app is
 * opened from the Home Screen, and gone for good on this device after Got it /
 * Not now / Add.
 */
export function HomeScreenTip() {
  const { ready, isPhone, standalone, platform, canInstall, install } = useHomeScreen();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISSED_KEY) === "1"); } catch { setDismissed(false); }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* private mode: it just comes back */ }
  };

  if (!ready || !isPhone || standalone || dismissed || platform === "other") return null;

  return (
    <div className="mt-3 mb-1 rounded-xl border-[1.5px] border-[#b7791f] bg-white p-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-spark-ink">
        <Smartphone size={16} className="text-[#b7791f]" /> Put SparkReels on your Home Screen
      </p>
      {platform === "ios" ? (
        <p className="mt-1 text-[13px] leading-snug text-spark-ink-soft">
          Tap <strong>Share</strong> <Share size={13} className="inline -mt-0.5" /> at the bottom, then{" "}
          <strong>Add to Home Screen</strong>.
        </p>
      ) : canInstall ? (
        <p className="mt-1 text-[13px] leading-snug text-spark-ink-soft">Opens like an app, one tap away.</p>
      ) : (
        <p className="mt-1 text-[13px] leading-snug text-spark-ink-soft">
          Tap the <strong>⋮</strong> menu, then <strong>Add to Home screen</strong>.
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        {platform === "android" && canInstall ? (
          <>
            <button type="button" onClick={dismiss} className="rounded-lg border border-[#c9b896] px-3 py-1 text-[13px] font-medium text-spark-ink">
              Not now
            </button>
            <button
              type="button"
              onClick={async () => {
                const added = await install();
                if (added) toast.success("Added to your Home Screen");
                dismiss();
              }}
              className="rounded-lg bg-[#b7791f] px-3 py-1 text-[13px] font-semibold text-white"
            >
              Add
            </button>
          </>
        ) : (
          <button type="button" onClick={dismiss} className="rounded-lg border border-[#c9b896] px-3 py-1 text-[13px] font-medium text-spark-ink">
            Got it
          </button>
        )}
      </div>
    </div>
  );
}
