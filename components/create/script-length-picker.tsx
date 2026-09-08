"use client";

import { CAMERA_LENGTHS, type CameraLength } from "@/lib/utils/video-length";

/**
 * How long a teleprompter script should be written to.
 *
 * Its own component because it belongs in two places and only one of them is
 * inside the recorder. On the routes where the PAGE writes the script — the
 * spoken brief, the write-from-a-document button — this has to sit above the
 * button that writes, because the writer reads this value. It used to render
 * four sections below that button, inside "Your teleprompter", which meant the
 * script was written to whatever the default was and the picker you scrolled
 * past afterwards did nothing until you regenerated.
 *
 * The minutes lead. Three of the five are labelled "Shorts" and two
 * "Longform", so the label is the half that cannot tell them apart — the
 * number is what anyone is actually choosing between.
 */
export function ScriptLengthPicker({
  value, onChange, label = "Script length", hint, disabled = false,
}: {
  value: CameraLength;
  onChange: (l: CameraLength) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-spark-ink-muted">
        {label}
      </p>
      {hint && <p className="mb-2 text-xs text-spark-ink-faint">{hint}</p>}
      <div className="grid grid-cols-5 gap-1.5">
        {CAMERA_LENGTHS.map((l) => (
          <button
            key={l.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(l.key)}
            aria-pressed={value === l.key}
            className={`rounded-lg border px-1 py-1.5 text-center transition-colors ${
              value === l.key
                ? "border-spark-amber bg-spark-amber-tint"
                : `border-spark-rule bg-white ${disabled ? "" : "hover:border-spark-rule-dim"}`
            } ${disabled ? "cursor-default opacity-60" : ""}`}
          >
            <span className="block text-[12px] font-bold leading-[1.1] text-brand-text">
              {l.minutes} min
            </span>
            <span className="block text-[9.5px] leading-[1.2] text-spark-ink-muted">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
