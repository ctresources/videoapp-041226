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
export type SparkStatus = "planned" | "draft" | "in_progress" | "ready" | "scheduled" | "published" | "failed";

/** Several related Sparks that tell one story over time. */
export interface SparkSeries {
  id: string;
  name: string;
  /** Defaults every Spark in the Series inherits unless it sets its own. */
  ctaText: string | null;
  destinationUrl: string | null;
}

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
  /** An unbranded cut (e.g. for an MLS listing): no agent, no contact ask, so no CTA by design. */
  unbranded: boolean;
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
  seriesId: string | null;
  seriesPosition: number | null;
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
  series: SparkSeries[];
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

/** What the rules need to know beyond the Spark itself. */
export interface SparkContext {
  youtubeConnected: boolean;
  /** The Series this Spark belongs to, when it is in one. */
  series?: SparkSeries | null;
}

/**
 * The CTA and link a Spark actually uses: its own, else the Series' defaults.
 * A listing Series then needs the showing link entered once, not five times.
 */
export function effectiveCta(c: Campaign, series?: SparkSeries | null): {
  text: string | null; url: string | null; inherited: boolean;
} {
  const own = c.ctaText?.trim() || null;
  const ownUrl = c.destinationUrl || null;
  const text = own ?? series?.ctaText?.trim() ?? null;
  const url = ownUrl ?? series?.destinationUrl ?? null;
  return { text, url, inherited: (!own && !!text) || (!ownUrl && !!url) };
}

export interface SetupNeed {
  key: string;
  /** What's missing, e.g. "YouTube caption". */
  label: string;
  /** Holds the Spark back from Ready. Needs for channels that can't publish yet don't. */
  blocking: boolean;
  projectId?: string;
  /** Where it gets fixed. */
  fix: "captions" | "thumbnail" | "cta" | "youtube";
}

export interface PublishingSetup {
  needs: SetupNeed[];
  /** How many needs hold the Spark back from Ready. */
  blocking: number;
  /** The blocking needs in a few words: "YouTube caption needed", "2 captions needed", "Complete". */
  summary: string;
}

/**
 * What a Spark still needs before it can go out — kept apart from its content.
 *
 * Captions, thumbnails, the CTA and its link, and a channel are publishing
 * requirements, not content items. Counting them as items would make
 * "3 of 4" change every time a channel is added.
 *
 * Required today, while YouTube is the only channel that publishes:
 * - each video's YouTube title and description;
 * - a thumbnail on each 16:9 video (Shorts mostly ignore custom ones);
 * - a CTA and a destination link, unless the Spark is unbranded — MLS listing
 *   cuts carry no contact ask by design;
 * - a connected YouTube account.
 * An Instagram caption is listed but does not hold the Spark back until
 * Instagram can publish.
 */
export function publishingSetup(c: Campaign, ctx: SparkContext): PublishingSetup {
  const needs: SetupNeed[] = [];
  const withVideo = c.projects.filter((p) => p.videos.length > 0);

  for (const p of withVideo) {
    if (!p.captions.youtubeTitle.trim() || !p.captions.youtubeDescription.trim()) {
      needs.push({ key: `yt-${p.id}`, label: "YouTube caption", blocking: true, projectId: p.id, fix: "captions" });
    }
    if (videoShape(leadVideo(p)?.videoType) === "16:9" && !p.thumbnailUrl) {
      needs.push({ key: `thumb-${p.id}`, label: "Thumbnail", blocking: true, projectId: p.id, fix: "thumbnail" });
    }
    if (!p.captions.instagramCaption.trim()) {
      needs.push({ key: `ig-${p.id}`, label: "Instagram caption", blocking: false, projectId: p.id, fix: "captions" });
    }
  }

  const lead = c.projects.find((p) => p.role === "primary") ?? c.projects[0];
  if (lead && !lead.unbranded) {
    // The Series' defaults count as set: the Spark inherits them.
    const cta = effectiveCta(c, ctx.series);
    if (!(cta.text || lead.cta)) needs.push({ key: "cta", label: "CTA", blocking: true, fix: "cta" });
    if (!cta.url) needs.push({ key: "link", label: "Destination link", blocking: true, fix: "cta" });
  }

  if (withVideo.length && !ctx.youtubeConnected) {
    needs.push({ key: "youtube", label: "YouTube connection", blocking: true, fix: "youtube" });
  }

  const blocking = needs.filter((n) => n.blocking);
  return { needs, blocking: blocking.length, summary: summarizeNeeds(blocking) };
}

/** A list of needs in a few words. One caption is named; several are counted. */
export function summarizeNeeds(needs: SetupNeed[]): string {
  if (!needs.length) return "Complete";
  const parts: string[] = [];
  const captions = needs.filter((n) => n.fix === "captions");
  if (captions.length === 1) parts.push(`${captions[0].label} needed`);
  else if (captions.length > 1) parts.push(`${captions.length} captions needed`);
  const thumbs = needs.filter((n) => n.fix === "thumbnail").length;
  if (thumbs === 1) parts.push("Thumbnail needed");
  else if (thumbs > 1) parts.push(`${thumbs} thumbnails needed`);
  if (needs.some((n) => n.key === "cta")) parts.push("CTA needed");
  if (needs.some((n) => n.key === "link")) parts.push("Destination link needed");
  if (needs.some((n) => n.key === "youtube")) parts.push("Connect YouTube");
  return parts.join(" · ");
}

export interface SparkProgress {
  status: SparkStatus;
  /** Content items (each video, and the article) that are ready, scheduled or published. */
  contentReady: number;
  contentTotal: number;
  setup: PublishingSetup;
  /** Where the Spark sits in the seven steps, 1–7. */
  step: number;
  hasBlog: boolean;
  hasVideo: boolean;
}

/**
 * A Spark's status, worked out from its content and its publishing setup
 * rather than stored, so it can never disagree with them.
 *
 * - Content is each video and, when there is one, the article.
 * - Ready needs every content item ready AND nothing blocking in the setup.
 * - Scheduled means every content item has a date: a video queued for a
 *   channel, or an article with a manual publishing reminder.
 * - Anything short of Ready with some work done is In Progress.
 * - A failure outranks everything until dealt with.
 */
export function sparkProgress(c: Campaign, ctx: SparkContext): SparkProgress {
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
  const setup = publishingSetup(c, ctx);
  const contentDone = total > 0 && ready === total;

  let status: SparkStatus;
  if (items.some((i) => i.failed)) status = "failed";
  else if (total > 0 && items.every((i) => i.published)) status = "published";
  else if (total > 0 && items.every((i) => i.dated && i.ready)) status = "scheduled";
  else if (contentDone && setup.blocking === 0) status = "ready";
  else if (ready > 0) status = "in_progress";
  // A name and nothing else — a slot planned in a Series. Draft means work
  // has started; Planned means it hasn't.
  else if (!c.projects.length && !hasBlog) status = "planned";
  else status = "draft";

  // Start → Blog or Video → Source are behind every Spark that exists. From
  // there: still being made or set up (4), ready to put on the calendar (5),
  // going out (6), all out and measurable (7).
  const step = status === "published" ? 7
    : items.some((i) => i.published) ? 6
    : contentDone && setup.blocking === 0 ? 5
    : status === "planned" ? 2
    : 4;

  return {
    status,
    contentReady: ready,
    contentTotal: total,
    setup,
    step,
    hasBlog,
    hasVideo: c.projects.some((p) => p.videos.length > 0),
  };
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
