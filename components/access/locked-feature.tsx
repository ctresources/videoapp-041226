import { Lock } from "lucide-react";
import { UPGRADE_HREF } from "@/lib/access";
import type { TrackEvent } from "@/lib/track";
import { TrackedLink } from "@/components/access/tracked-link";
import { cn } from "@/lib/utils/cn";

/**
 * What a free account sees in place of a paid page or section (2026-10-28).
 * Calm and informative, not a wall: it names the feature, says it comes with
 * a plan, and offers the plans. Nothing of the locked page is rendered.
 */
export function LockedFeature({
  feature,
  title = "Available with SparkReels",
  body = "Unlock this feature and the complete SparkReels workflow with a paid plan.",
  cta = "View Plans",
  event = "locked_feature_upgrade_clicked",
  compact = false,
  className,
}: {
  /** The feature's name, shown above the title, e.g. "AutoSparks". */
  feature?: string;
  title?: string;
  body?: string;
  cta?: string;
  event?: TrackEvent;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-spark-rule bg-white text-center shadow-brand",
        compact ? "p-5" : "mx-auto max-w-xl px-6 py-10 md:px-10",
        className,
      )}
    >
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-spark-amber-tint">
        <Lock size={18} className="text-[#A3660F]" />
      </div>
      {feature && (
        <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#A3660F]">{feature}</p>
      )}
      <h2 className="font-display text-[20px] font-bold text-spark-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-spark-ink-muted">{body}</p>
      <TrackedLink
        href={UPGRADE_HREF}
        event={event}
        className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[15px] font-semibold text-white spark-cta-gradient"
      >
        {cta}
      </TrackedLink>
    </div>
  );
}
