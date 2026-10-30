"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Mic, X } from "lucide-react";
import { SparkleeGoal } from "@/components/home/sparklee-goal";

/**
 * The Sparklee mic in the top bar (2026-10-29, the owner's ask): on every
 * page, so the agent can speak to Sparklee without scrolling or going back
 * to Home. Opens the same goal box, plan and Approve plan as Home.
 */
export function HeaderMic({ dark }: { dark: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Tell Sparklee what you want"
        className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1 xl:pr-3 text-[13.5px] font-bold ${dark ? "border-[#5a4826] bg-[#1d1915] text-[#ffe39a]" : "border-spark-rule bg-white text-[#A3660F] hover:border-spark-amber"}`}
      >
        <span className="spark-cta-gradient flex h-[30px] w-[30px] items-center justify-center rounded-full text-white"><Mic size={15} /></span>
        <span className="hidden xl:inline">Sparklee</span>
      </button>
      {open && (
        <div className="fixed left-2 right-2 top-[54px] z-50 rounded-2xl p-3.5 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[460px]"
          style={{ background: "radial-gradient(120% 140% at 0% 0%, #2a1f10 0%, #0f0d0b 60%)", boxShadow: "0 0 0 1.5px #BA7517, 0 18px 40px rgba(0,0,0,.35)" }}>
          <div className="mb-2 flex items-center">
            <p className="flex-1 text-[15px] font-bold text-white">What do you want to accomplish?</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-[#cdbf9f] hover:text-white"><X size={17} /></button>
          </div>
          <SparkleeGoal variant="compact" />
        </div>
      )}
    </div>
  );
}
