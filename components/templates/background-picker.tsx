"use client";

import { BACKGROUNDS, shadeOf } from "@/lib/templates/backgrounds";

/** The background color circles for video templates (2026-11-03). */
export function BackgroundPicker({ value, accent, onChange }: { value: string; accent: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {BACKGROUNDS.map((b) => {
        const on = (value || "") === b.id;
        const swatch = b.id ? shadeOf(b.id, accent) : null;
        return (
          <button key={b.id || "standard"} type="button" onClick={() => onChange(b.id)} title={b.name}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[14px] font-semibold ${on ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-amber"}`}>
            <span className="h-5 w-5 rounded-full border border-black/15"
              style={{ background: swatch ?? "linear-gradient(135deg,#0e121a 0 50%,#3a2a14 50% 100%)" }} />
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
