"use client";

import Link from "next/link";
import { X, Zap, Video, ArrowRight, Check } from "lucide-react";
import type { VideoKind } from "@/lib/utils/video-allowance";

/**
 * Shown when a render is refused for lack of videos (HTTP 402).
 *
 * This replaces a plain toast. Someone who has just written a script and
 * pressed Generate is at the highest intent they will ever have; a message
 * with nothing to click sends them away instead of to checkout.
 */
export function OutOfVideosModal({
  kind,
  tier,
  onClose,
}: {
  kind: VideoKind;
  tier: string;
  onClose: () => void;
}) {
  const isLong = kind === "long";
  const onFreePlan = tier === "free" || tier === "beta";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${isLong ? "bg-spark-amber-tint border border-spark-amber/30" : "bg-primary-50 border border-primary-100"}`}>
            {isLong ? <Video size={18} className="text-spark-amber" /> : <Zap size={18} className="text-primary-600" />}
          </div>
          <h2 className="text-lg font-black text-slate-900">
            {onFreePlan
              ? "That was your free video"
              : `You're out of ${isLong ? "long" : "short"} videos`}
          </h2>
        </div>

        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          {onFreePlan
            ? "Your script is saved — pick a plan and you can generate it right away. Camera recordings and the AI tools stay free either way."
            : isLong
              ? "Your script is saved. Buy a single long video, or move up a plan for more each month."
              : "Your script is saved. Buy more short videos, or move up a plan for a bigger monthly allowance."}
        </p>

        <div className="space-y-2.5 mb-5">
          <Link
            href="/billing"
            className="flex items-center justify-between gap-3 border border-spark-blue bg-spark-blue text-white rounded-xl px-4 py-3.5 hover:bg-spark-blue transition-colors"
          >
            <span className="text-sm font-semibold">
              {onFreePlan ? "Choose a plan" : "Upgrade my plan"}
            </span>
            <ArrowRight size={16} />
          </Link>

          {!onFreePlan && (
            <Link
              href="/billing#add-ons"
              className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3.5 hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-700">
                {isLong ? "Buy one long video — $49" : "Buy another short video — $25"}
              </span>
              <ArrowRight size={16} className="text-slate-400" />
            </Link>
          )}
        </div>

        <ul className="space-y-1.5 mb-5">
          {[
            "Your script and photos are saved — nothing is lost",
            "Purchased videos never expire",
            "Camera recordings stay unlimited and free",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2 text-xs text-slate-500">
              <Check size={13} className="text-emerald-500 shrink-0 mt-0.5" />
              {t}
            </li>
          ))}
        </ul>

        <button
          onClick={onClose}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Not now — go back to my script
        </button>
      </div>
    </div>
  );
}
