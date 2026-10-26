"use client";

import { PLATFORM_NAMES, type VideoStatus } from "@/lib/utils/video-status";

/**
 * The status line for a video (2026-10-26, the owner's approved mockup):
 * Draft → Made → Approved/Scheduled → Posted, a sentence, and an account tick
 * for each place it goes, ticked only once it is really there.
 */
export function VideoStatusLine({ status, compact = false }: { status: VideoStatus; compact?: boolean }) {
  const chip = compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12.5px]";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {status.steps.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300">→</span>}
            <span
              className={`rounded-full font-semibold ${chip} ${
                s.state === "done" ? "bg-green-50 text-green-700"
                  : s.state === "now" ? "bg-blue-900 text-white"
                  : s.state === "failed" ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </span>
        ))}
      </div>
      {status.line && <p className={`mt-1.5 ${compact ? "text-[12px]" : "text-[13px]"} leading-snug text-slate-700`}>{status.line}</p>}
      {status.ticks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {status.ticks.map((t) => (
            <span
              key={t.platform}
              className={`rounded-full px-2 py-0.5 text-[11.5px] ${
                t.state === "posted" ? "bg-green-50 font-semibold text-green-700"
                  : t.state === "failed" ? "bg-red-50 font-semibold text-red-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {t.state === "posted" ? "✓ " : ""}
              {PLATFORM_NAMES[t.platform] ?? t.platform}
              {t.state === "failed" ? " · failed" : t.state === "scheduled" ? " · scheduled" : t.state === "posting" ? " · on its way" : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
