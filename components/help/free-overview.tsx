import Link from "next/link";
import { Lock, Mic, Sparkles, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UPGRADE_HREF } from "@/lib/access";
import { TrackedLink } from "@/components/access/tracked-link";

/**
 * How It Works for a free account (2026-10-28, the owner's brief, option A):
 * what SparkReels does, never how the paid workflows are set up. The locked
 * cards are names only; their guides are not in this page at all.
 *
 * Kept out of app/(dashboard)/help/page.tsx on purpose: scripts/build-guide.mjs
 * reads that file for Ask Sparklee, and this overview is not part of the guide.
 */

const BASICS = [
  {
    icon: Mic,
    title: "Create a Spark",
    text: "Start with an idea, article, URL, upload, or recording.",
  },
  {
    icon: Video,
    title: "Create Your Video",
    text: "Use your avatar or record yourself.",
  },
  {
    icon: Sparkles,
    title: "Create More From Your Spark",
    text: "Turn your Spark into more ways to connect, build trust, and stay visible.",
  },
];

const LOCKED = [
  "Advanced Publishing",
  "Social Auto-Publishing",
  "CRM Workflows",
  "Website / Halo Content Workflow",
  "AutoSparks",
  "Advanced YouTube Tools",
  "Spark Tools",
  "Spark Insights",
  "Integrations",
];

export function FreeOverview() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        {BASICS.map(({ icon: Icon, title, text }) => (
          <Card key={title} padding="md" className="h-full">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-spark-amber-tint">
              <Icon size={18} className="text-[#A3660F]" />
            </div>
            <h2 className="font-display text-[19px] font-bold text-spark-ink">{title}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-spark-ink-muted">{text}</p>
          </Card>
        ))}
      </div>

      <Card padding="md">
        <h2 className="font-display text-[20px] font-bold text-spark-ink">Complete Guides With Your Plan</h2>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-spark-ink-muted">
          Upgrade your SparkReels plan to unlock complete feature guides and workflows.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LOCKED.map((name) => (
            <TrackedLink
              key={name}
              href={UPGRADE_HREF}
              event="how_it_works_locked_clicked"
              className="flex items-center justify-between gap-3 rounded-xl border border-spark-rule bg-white px-4 py-3 text-[15px] font-medium text-spark-ink transition-colors hover:bg-spark-amber-tint"
            >
              {name}
              <Lock size={15} className="shrink-0 text-[#A3660F]" />
            </TrackedLink>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <TrackedLink
            href={UPGRADE_HREF}
            event="how_it_works_locked_clicked"
            className="inline-flex rounded-xl px-5 py-2.5 text-[15px] font-semibold text-white spark-cta-gradient"
          >
            Unlock All Features
          </TrackedLink>
          <Link href="/create" className="text-[15px] font-semibold text-[#A3660F] hover:underline">
            Make your free video in Spark Studio
          </Link>
        </div>
      </Card>
    </div>
  );
}
