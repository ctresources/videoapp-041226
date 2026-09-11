/**
 * The campaign calendar's shared shapes and rules.
 *
 * A campaign is the folder above projects: its blog article, one or more
 * projects and their videos, the social posts and their schedule, and the
 * CTA. Nothing here touches the database, so the page and the API agree on
 * one definition of every status.
 */

export const CAMPAIGN_ROLES = {
  primary: "Primary video",
  short_variation: "Short variation",
  faq: "FAQ video",
  teaser: "Teaser",
  follow_up: "Follow-up video",
} as const;
export type CampaignRole = keyof typeof CAMPAIGN_ROLES;

export const BLOG_STATUSES = {
  draft: "Draft",
  ready: "Ready",
  scheduled_externally: "Scheduled externally",
  published: "Published",
} as const;
export type BlogStatus = keyof typeof BLOG_STATUSES;

/** Every status an item on the calendar can be in. */
export type ItemStatus =
  | "draft"
  | "ready"
  | "scheduled_externally"
  | "scheduled"
  | "uploading"
  | "processing"
  | "published"
  | "failed"
  | "cancelled";

export type CampaignStatus = "draft" | "ready" | "scheduled" | "published" | "failed";

export interface CampaignVideo {
  id: string;
  projectId: string;
  videoUrl: string | null;
  videoType: string;
  renderStatus: string;
  createdAt: string;
}

export interface CampaignProject {
  id: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  role: CampaignRole | null;
  createdAt: string;
  /** The CTA written into this project's script, if any. */
  cta: string | null;
  videos: CampaignVideo[];
}

/** A social post already made (kind "post") or one waiting in the queue ("job"). */
export interface CampaignPost {
  id: string;
  kind: "post" | "job";
  platform: string;
  status: ItemStatus;
  at: string | null;
  title: string | null;
  url: string | null;
  lastError: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ctaText: string | null;
  destinationUrl: string | null;
  blog: {
    projectId: string | null;
    title: string | null;
    status: BlogStatus;
    plannedAt: string | null;
    publishedAt: string | null;
    platform: string | null;
    url: string | null;
  };
  projects: CampaignProject[];
  posts: CampaignPost[];
}

export interface CampaignsPayload {
  campaigns: Campaign[];
  /** The saved zone, or null if the user has never had one set. */
  timeZone: string | null;
  youtubeChannel: string | null;
}

export interface CalendarItem {
  key: string;
  campaignId: string;
  campaignName: string;
  kind: "blog" | "post" | "job";
  platform: string;
  title: string;
  status: ItemStatus;
  at: string;
  url: string | null;
}

/** Everything in a campaign that has a date, as calendar entries. */
export function calendarItems(c: Campaign): CalendarItem[] {
  const items: CalendarItem[] = [];
  // A published article sits on the day it went up; anything else on the day
  // it is planned for. An article with neither has no place on a calendar.
  const blogAt = c.blog.status === "published"
    ? (c.blog.publishedAt ?? c.blog.plannedAt)
    : c.blog.plannedAt;
  if (blogAt) {
    items.push({
      key: `blog-${c.id}`,
      campaignId: c.id,
      campaignName: c.name,
      kind: "blog",
      platform: "blog",
      title: c.blog.title || c.name,
      status: c.blog.status,
      at: blogAt,
      url: c.blog.url,
    });
  }
  for (const p of c.posts) {
    if (!p.at) continue;
    items.push({
      key: `${p.kind}-${p.id}`,
      campaignId: c.id,
      campaignName: c.name,
      kind: p.kind,
      platform: p.platform,
      title: p.title || c.name,
      status: p.status,
      at: p.at,
      url: p.url,
    });
  }
  return items;
}

const IN_FLIGHT: ItemStatus[] = ["scheduled", "scheduled_externally", "uploading", "processing"];

/**
 * A campaign's status, worked out from its items rather than stored, so it
 * can never disagree with them. Worst news first: one failed post makes the
 * campaign Failed until it is dealt with.
 */
export function campaignStatus(c: Campaign): CampaignStatus {
  const statuses: ItemStatus[] = [c.blog.status, ...c.posts.map((p) => p.status)];
  if (statuses.includes("failed")) return "failed";
  if (statuses.some((s) => IN_FLIGHT.includes(s))) return "scheduled";
  if (statuses.includes("published")) return "published";
  const hasFinishedVideo = c.projects.some((p) => p.videos.some((v) => v.renderStatus === "completed"));
  if (hasFinishedVideo || c.blog.status === "ready") return "ready";
  return "draft";
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
