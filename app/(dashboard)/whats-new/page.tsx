import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { canAccessFeature, isPaidLevel, UPGRADE_HREF } from "@/lib/access";
import { getServerAccess } from "@/lib/access-server";
import { whatsNewItems, type WhatsNewItem } from "@/lib/data/whats-new";
import { TrackedLink } from "@/components/access/tracked-link";
import { MarkWhatsNewSeen } from "@/components/whats-new/mark-seen";

export const metadata = { title: "What's New — SparkReels" };
export const dynamic = "force-dynamic";

/**
 * What's New (2026-10-28, the owner's brief): an update center, not a blog.
 * Cards come from lib/data/whats-new.ts. Paid accounts get Learn How It Works,
 * straight to that part of the guide; free accounts read the name and the
 * one-line benefit, and the plans.
 */

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function UpdateCard({ item, paid }: { item: WhatsNewItem; paid: boolean }) {
  const locked = !paid && item.paidOnlyDetails !== false;
  return (
    <article className="flex h-full flex-col rounded-2xl border border-spark-rule bg-white p-5 shadow-brand">
      <div className="mb-2 flex items-center gap-2">
        {item.badge && (
          <span className="rounded-full bg-spark-amber px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
            {item.badge}
          </span>
        )}
        <span className="text-[12.5px] text-spark-ink-faint">{formatDate(item.releaseDate)}</span>
      </div>
      <h2 className="font-display text-[19px] font-bold leading-snug text-spark-ink">{item.title}</h2>
      <p className="mt-1.5 flex-1 text-[15px] leading-relaxed text-spark-ink-muted">{item.description}</p>

      <div className="mt-4">
        {paid && item.howItWorksAnchor ? (
          <TrackedLink
            href={`/help#${item.howItWorksAnchor}`}
            event="whats_new_item_clicked"
            className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-[#A3660F] hover:underline"
          >
            Learn How It Works <ArrowRight size={15} />
          </TrackedLink>
        ) : locked ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-spark-ink-faint">
              <Lock size={13} /> Available with a SparkReels plan.
            </span>
            <TrackedLink
              href={UPGRADE_HREF}
              event="whats_new_upgrade_clicked"
              className="rounded-xl px-3.5 py-1.5 text-[14px] font-semibold text-white spark-cta-gradient"
            >
              Unlock This Feature
            </TrackedLink>
          </div>
        ) : item.freeHref ? (
          <TrackedLink
            href={item.freeHref}
            event="whats_new_item_clicked"
            className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-[#A3660F] hover:underline"
          >
            {item.freeLabel ?? "Open it"} <ArrowRight size={15} />
          </TrackedLink>
        ) : null}
      </div>
    </article>
  );
}

export default async function WhatsNewPage() {
  const { level } = await getServerAccess();
  const paid = isPaidLevel(level) && canAccessFeature(level, "whats_new_details");

  return (
    <div className="w-full">
      <MarkWhatsNewSeen />
      <header className="mb-6">
        <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-[#A3660F]">
          <Sparkles size={14} /> What&apos;s New
        </p>
        <h1 className="font-display text-[28px] font-bold leading-tight text-spark-ink">What&apos;s New</h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-spark-ink-muted">
          See the latest SparkReels features, improvements, and new ways to create, publish, and stay visible.
        </p>
        <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-spark-ink-faint">
          Get a quick overview here. Paid members can select Learn How It Works for full setup and step-by-step
          instructions.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {whatsNewItems.map((item) => (
          <UpdateCard key={item.id} item={item} paid={paid} />
        ))}
      </div>

      {!paid && (
        <div className="mt-8 rounded-2xl border border-spark-rule bg-spark-amber-tint p-6 text-center">
          <h2 className="font-display text-[20px] font-bold text-spark-ink">Unlock All Features</h2>
          <p className="mx-auto mt-1.5 max-w-xl text-[15px] text-spark-ink-muted">
            Every update above, with full setup and step-by-step guides, comes with a SparkReels plan.
          </p>
          <TrackedLink
            href={UPGRADE_HREF}
            event="whats_new_upgrade_clicked"
            className="mt-4 inline-flex rounded-xl px-5 py-2.5 text-[15px] font-semibold text-white spark-cta-gradient"
          >
            Unlock All Features
          </TrackedLink>
        </div>
      )}
    </div>
  );
}
