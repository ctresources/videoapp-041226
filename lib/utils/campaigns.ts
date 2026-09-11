/**
 * Sparks — the shared shapes and rules behind the Spark Calendar and the
 * Spark Card.
 *
 * A Spark is one topic and everything made from it: its blog article, one or
 * more videos (each a project, with a role), the social posts and their
 * schedule, and the CTA. In the database and the API a Spark is still a
 * "campaign"; only the words people see changed.
 *
 * Nothing here touches the database, so the page and the API agree on one
 * definition of every status.
 */

export const CAMPAIGN_ROLES = {
  primary: "Primary Video",
  short_variation: "Short Variation",
  faq: "FAQ Video",
  teaser: "Teaser",
  follow_up: "Follow-up Video",
} as const;
export type CampaignRole = keyof typeof CAMPAIGN_ROLES;

export const BLOG_STATUSES = {
  draft: "Draft",
  ready: "Ready",
  scheduled_externally: "Scheduled externally",
  published: "Published",
} as const;
export type BlogStatus = keyof typeof BLOG_STATUSES;

/** Every status an entry on the calendar can be in. */
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

/** A whole Spark's status. */
export type SparkStatus = "draft" | "in_progress" | "ready" | "scheduled" | "published" | "failed";

/** One video's status within its Spark. */
export type VideoState = "draft" | "rendering" | "ready" | "scheduled" | "published" | "failed";

export interface CampaignVideo {
  id: string;
  projectId: string;
  videoUrl: string | null;
  videoType: string;
  renderStatus: string;
  renderProvider: string;
  durationSeconds: number | null;
  createdAt: string;
}

export interface SparkCaptions {
  youtubeTitle: string;
  youtubeDescription: string;
  instagramCaption: string;
}

export interface CampaignProject {
  id: string;
  title: string;
  status: string;
  projectType: string;
  thumbnailUrl: string | null;
  role: CampaignRole | null;
  createdAt: string;
  /** The CTA written into this project's script, if any. */
  cta: string | null;
  /** Written from a typed or spoken topic (rather than a voice note or pasted script). */
  fromTopic: boolean;
  captions: SparkCaptions;
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
  /** The project whose video this post carries, when that is still known. */
  projectId: string | null;
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
    /** Whether the article has actually been written. */
    hasArticle: boolean;
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

/** Everything in a Spark that has a date, as calendar entries. */
export function calendarItems(c: Campaign): CalendarItem[] {
  const items: CalendarItem[] = [];
  // A published article sits on the day it went up; anything else on the day
  // its manual publishing reminder is set for. With neither, it has no place
  // on a calendar.
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

const IN_FLIGHT: ItemStatus[] = ["scheduled", "uploading", "processing"];

/** The video a project is represented by: its newest finished render, else its newest attempt. */
export function leadVideo(p: CampaignProject): CampaignVideo | null {
  const finished = p.videos.filter((v) => v.renderStatus === "completed" && v.videoUrl);
  return finished[finished.length - 1] ?? p.videos[p.videos.length - 1] ?? null;
}

/**
 * One video's status. What has happened to it on a channel outranks how its
 * render went: a published video is Published even if an earlier attempt to
 * post it failed.
 */
export function videoState(c: Campaign, p: CampaignProject): VideoState {
  const posts = c.posts.filter((x) => x.projectId === p.id);
  if (posts.some((x) => x.status === "published")) return "published";
  if (posts.some((x) => IN_FLIGHT.includes(x.status))) return "scheduled";
  if (posts.some((x) => x.status === "failed")) return "failed";
  const v = leadVideo(p);
  if (v?.renderStatus === "completed") return "ready";
  if (v && (v.renderStatus === "pending" || v.renderStatus === "rendering")) return "rendering";
  return "draft";
}

/** Whether the blog is part of this Spark at all. */
export function sparkHasBlog(c: Campaign): boolean {
  return c.blog.hasArticle || c.blog.status !== "draft" || !!c.blog.plannedAt;
}

export interface SparkProgress {
  status: SparkStatus;
  /** Items that are ready, scheduled or published. */
  ready: number;
  total: number;
  /** Where the Spark sits in the seven steps, 1–7. */
  step: number;
  hasBlog: boolean;
  hasVideo: boolean;
}

/**
 * A Spark's status, worked out from its items rather than stored, so it can
 * never disagree with them. The items are each video and, when there is one,
 * the article.
 *
 * Scheduled means every item has a date — a video queued for a channel or an
 * article with a manual publishing reminder. Anything short of that, with some
 * work done, is In Progress. A failure outranks everything until dealt with.
 */
export function sparkProgress(c: Campaign): SparkProgress {
  type Item = { ready: boolean; dated: boolean; published: boolean; failed: boolean };
  const items: Item[] = c.projects.map((p) => {
    const s = videoState(c, p);
    return {
      ready: s === "ready" || s === "scheduled" || s === "published",
      dated: s === "scheduled" || s === "published",
      published: s === "published",
      failed: s === "failed",
    };
  });

  const hasBlog = sparkHasBlog(c);
  if (hasBlog) {
    const b = c.blog;
    const published = b.status === "published";
    items.push({
      ready: published || b.hasArticle || b.status !== "draft",
      dated: published || b.status === "scheduled_externally" || !!b.plannedAt,
      published,
      failed: false,
    });
  }

  const total = items.length;
  const ready = items.filter((i) => i.ready).length;

  let status: SparkStatus;
  if (items.some((i) => i.failed)) status = "failed";
  else if (total > 0 && items.every((i) => i.published)) status = "published";
  else if (total > 0 && items.every((i) => i.dated && i.ready)) status = "scheduled";
  else if (total > 0 && ready === total) status = "ready";
  else if (ready > 0) status = "in_progress";
  else status = "draft";

  // Start → Blog or Video → Source are behind every Spark that exists. From
  // there: still being made (4), ready to put on the calendar (5), going out
  // (6), all out and measurable (7).
  const step = status === "published" ? 7
    : items.some((i) => i.published) ? 6
    : total > 0 && ready === total ? 5
    : 4;

  return { status, ready, total, step, hasBlog, hasVideo: c.projects.some((p) => p.videos.length > 0) };
}

/** Where a Spark came from, in the words the Create page uses. */
export function sparkSource(p: CampaignProject | undefined): string {
  if (!p) return "Not set";
  if (p.projectType === "listing_video") return "Listing Link";
  if (leadVideo(p)?.renderProvider === "camera") return "Camera Recording";
  if (p.projectType === "trending") return "Trending Topic";
  return p.fromTopic ? "Your Topic" : "Your Voice or Script";
}

export function videoShape(videoType: string | undefined): string {
  switch (videoType) {
    case "reel_9x16": return "9:16";
    case "short_1x1": return "1:1";
    case "youtube_16x9":
    case "blog_long": return "16:9";
    default: return "";
  }
}

export function videoLength(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
