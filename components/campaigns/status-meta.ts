import type { CampaignStatus, ItemStatus } from "@/lib/utils/campaigns";

/**
 * How each status looks. Colours follow the calendar design: slate for
 * published, amber for anything booked, warm grey for work not yet booked,
 * blue while a platform is working on it. Failed stays red — it has to be
 * noticed.
 *
 * Kept under components/ rather than lib/ because Tailwind only scans
 * app/ and components/ for class names.
 */
export const ITEM_STATUS_META: Record<ItemStatus, { label: string; chip: string; dot: string }> = {
  draft: { label: "Draft", chip: "bg-[#F4F2EC] border-spark-rule text-[#8b8779]", dot: "bg-[#c4c0b4]" },
  ready: { label: "Ready", chip: "bg-[#F4F2EC] border-spark-rule text-spark-ink-soft", dot: "bg-spark-ink-faint" },
  scheduled_externally: { label: "Scheduled externally", chip: "bg-spark-amber-tint border-[#ecdcc0] text-spark-amber", dot: "bg-spark-amber" },
  scheduled: { label: "Scheduled", chip: "bg-spark-amber-tint border-[#ecdcc0] text-spark-amber", dot: "bg-spark-amber" },
  uploading: { label: "Uploading", chip: "bg-spark-blue/10 border-spark-blue/20 text-spark-blue", dot: "bg-spark-blue" },
  processing: { label: "Processing", chip: "bg-spark-blue/10 border-spark-blue/20 text-spark-blue", dot: "bg-spark-blue" },
  published: { label: "Published", chip: "bg-[#eff2f5] border-[#dbe1e8] text-[#5b6b7d]", dot: "bg-[#5b6b7d]" },
  failed: { label: "Failed", chip: "bg-red-50 border-red-200 text-red-600", dot: "bg-red-500" },
  cancelled: { label: "Cancelled", chip: "bg-white border-spark-rule text-spark-ink-faint line-through", dot: "bg-spark-rule-dim" },
};

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "bg-spark-rule-soft text-spark-ink-muted" },
  ready: { label: "Ready", badge: "bg-[#F4F2EC] text-spark-ink-soft" },
  scheduled: { label: "Scheduled", badge: "bg-spark-amber-tint text-spark-amber" },
  published: { label: "Published", badge: "bg-[#eff2f5] text-[#5b6b7d]" },
  failed: { label: "Failed", badge: "bg-red-50 text-red-600" },
};

const PLATFORM_LABELS: Record<string, string> = {
  blog: "Blog",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  twitter: "X",
  threads: "Threads",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/**
 * The channels a campaign can go out on. Only YouTube publishes today; the
 * rest are listed so the shape of the campaign is visible before they can be
 * connected.
 */
export const CHANNELS = ["youtube", "instagram", "facebook", "linkedin", "tiktok"] as const;
