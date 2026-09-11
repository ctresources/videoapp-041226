/**
 * The campaign calendar's data — every campaign with its projects, videos,
 * blog record and posts — and edits to a campaign's own fields.
 *
 * Only for accounts granted the calendar (see requireCampaignUser); everyone
 * else gets a 404.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCampaignUser } from "@/lib/utils/campaign-access";
import { isValidTimeZone } from "@/lib/utils/time-zone";
import {
  BLOG_STATUSES,
  CAMPAIGN_ROLES,
  isHttpUrl,
  type BlogStatus,
  type Campaign,
  type CampaignPost,
  type CampaignRole,
  type CampaignsPayload,
  type ItemStatus,
} from "@/lib/utils/campaigns";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Campaigns begin with projects made from September 2026 — the owner's
 * choice. Older projects stay unfiled and never appear here.
 */
const CAMPAIGNS_START = "2026-09-01T04:00:00Z";

interface CampaignRow {
  id: string; name: string; created_at: string; updated_at: string;
  cta_text: string | null; destination_url: string | null;
  blog_project_id: string | null; blog_title: string | null; blog_status: BlogStatus;
  blog_planned_at: string | null; blog_published_at: string | null;
  blog_platform: string | null; blog_url: string | null;
}
interface ProjectRow {
  id: string; title: string; status: string; thumbnail_url: string | null;
  campaign_id: string; campaign_role: CampaignRole | null; created_at: string; cta: string | null;
}
interface VideoRow {
  id: string; project_id: string; video_url: string | null; video_type: string;
  render_status: string; created_at: string;
}
interface PostRow {
  id: string; campaign_id: string; platform: string; post_status: string;
  scheduled_at: string | null; posted_at: string | null; video_title: string | null;
  platform_post_id: string | null;
}
interface JobRow {
  id: string; campaign_id: string; platform: string; status: ItemStatus;
  scheduled_at: string; published_at: string | null; title: string | null;
  platform_url: string | null; last_error: string | null;
}

/**
 * Every new project starts as its own campaign.
 *
 * The create routes know nothing about campaigns yet, so a project made since
 * the last visit is filed here. The update is guarded on campaign_id still
 * being empty: if two loads race, the loser's campaign is removed rather than
 * left behind empty.
 */
async function fileNewProjects(admin: Admin, userId: string): Promise<void> {
  const { data } = await admin
    .from("projects")
    .select("id, title, script_title:ai_script->>title, blog_body:ai_script->>blog_body")
    .eq("user_id", userId)
    .is("campaign_id", null)
    .gte("created_at", CAMPAIGNS_START);

  const unfiled = (data ?? []) as { id: string; title: string; script_title: string | null; blog_body: string | null }[];
  for (const p of unfiled) {
    const { data: made } = await admin
      .from("campaigns")
      .insert({
        user_id: userId,
        name: p.title,
        blog_project_id: p.id,
        blog_title: p.script_title?.trim() || p.title,
        blog_status: p.blog_body?.trim() ? "ready" : "draft",
      })
      .select("id")
      .single();
    const campaignId = (made as { id: string } | null)?.id;
    if (!campaignId) continue;

    const { data: filed } = await admin
      .from("projects")
      .update({ campaign_id: campaignId, campaign_role: "primary" })
      .eq("id", p.id)
      .eq("user_id", userId)
      .is("campaign_id", null)
      .select("id");
    if (!filed?.length) await admin.from("campaigns").delete().eq("id", campaignId);
  }
}

function postStatus(row: PostRow, now: number): ItemStatus {
  switch (row.post_status) {
    case "posted": return "published";
    case "posting": return "uploading";
    case "failed": return "failed";
    // A post uploaded the old way (private on YouTube with a publish time) is
    // public once that time has passed, whether or not anything has swept the
    // row yet — the same rule /api/social/schedule applies.
    default:
      return row.scheduled_at && Date.parse(row.scheduled_at) <= now ? "published" : "scheduled";
  }
}

const ROLE_ORDER = Object.keys(CAMPAIGN_ROLES) as CampaignRole[];
const roleRank = (r: CampaignRole | null) => (r ? ROLE_ORDER.indexOf(r) : ROLE_ORDER.length);

// GET — every campaign, with everything under it.
export async function GET() {
  const access = await requireCampaignUser();
  if ("response" in access) return access.response;
  const { userId } = access;
  const admin = createAdminClient();

  await fileNewProjects(admin, userId);

  const [campaignsRes, profileRes] = await Promise.all([
    admin
      .from("campaigns")
      .select("id, name, created_at, updated_at, cta_text, destination_url, blog_project_id, blog_title, blog_status, blog_planned_at, blog_published_at, blog_platform, blog_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin.from("profiles").select("time_zone, youtube_channel_name").eq("id", userId).maybeSingle(),
  ]);

  if (campaignsRes.error) {
    console.error("[campaigns] load failed:", campaignsRes.error.message);
    return NextResponse.json({ error: "Couldn't load your campaigns." }, { status: 500 });
  }

  const rows = (campaignsRes.data ?? []) as CampaignRow[];
  const profile = profileRes.data as { time_zone: string | null; youtube_channel_name: string | null } | null;
  const savedZone = profile?.time_zone;
  const timeZone = isValidTimeZone(savedZone) ? savedZone : null;
  const youtubeChannel = profile?.youtube_channel_name ?? null;

  const ids = rows.map((r) => r.id);
  if (!ids.length) {
    return NextResponse.json({ campaigns: [], timeZone, youtubeChannel } satisfies CampaignsPayload);
  }

  const [projectsRes, postsRes, jobsRes] = await Promise.all([
    admin
      .from("projects")
      .select("id, title, status, thumbnail_url, campaign_id, campaign_role, created_at, cta:ai_script->>cta")
      .eq("user_id", userId)
      .in("campaign_id", ids),
    admin
      .from("social_posts")
      .select("id, campaign_id, platform, post_status, scheduled_at, posted_at, video_title, platform_post_id")
      .eq("user_id", userId)
      .in("campaign_id", ids),
    admin
      .from("publish_jobs")
      .select("id, campaign_id, platform, status, scheduled_at, published_at, title, platform_url, last_error")
      .eq("user_id", userId)
      .in("campaign_id", ids)
      .neq("status", "cancelled"),
  ]);

  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const posts = (postsRes.data ?? []) as PostRow[];
  const jobs = (jobsRes.data ?? []) as JobRow[];

  const projectIds = projects.map((p) => p.id);
  let videos: VideoRow[] = [];
  if (projectIds.length) {
    const { data } = await admin
      .from("generated_videos")
      .select("id, project_id, video_url, video_type, render_status, created_at")
      .eq("user_id", userId)
      .in("project_id", projectIds)
      .order("created_at", { ascending: true });
    videos = (data ?? []) as VideoRow[];
  }

  const videosByProject = new Map<string, VideoRow[]>();
  for (const v of videos) {
    const list = videosByProject.get(v.project_id) ?? [];
    list.push(v);
    videosByProject.set(v.project_id, list);
  }

  const now = Date.now();
  const toPost = (r: PostRow): CampaignPost => ({
    id: r.id,
    kind: "post",
    platform: r.platform,
    status: postStatus(r, now),
    at: r.posted_at ?? r.scheduled_at,
    title: r.video_title,
    url: r.platform === "youtube" && r.platform_post_id ? `https://youtu.be/${r.platform_post_id}` : null,
    lastError: null,
  });
  const toJob = (r: JobRow): CampaignPost => ({
    id: r.id,
    kind: "job",
    platform: r.platform,
    status: r.status,
    at: r.published_at ?? r.scheduled_at,
    title: r.title,
    url: r.platform_url,
    lastError: r.status === "failed" ? r.last_error : null,
  });

  const campaigns: Campaign[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ctaText: r.cta_text,
    destinationUrl: r.destination_url,
    blog: {
      projectId: r.blog_project_id,
      title: r.blog_title,
      status: r.blog_status,
      plannedAt: r.blog_planned_at,
      publishedAt: r.blog_published_at,
      platform: r.blog_platform,
      url: r.blog_url,
    },
    projects: projects
      .filter((p) => p.campaign_id === r.id)
      .sort((a, b) => roleRank(a.campaign_role) - roleRank(b.campaign_role) || a.created_at.localeCompare(b.created_at))
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        thumbnailUrl: p.thumbnail_url,
        role: p.campaign_role,
        createdAt: p.created_at,
        cta: p.cta?.trim() || null,
        videos: (videosByProject.get(p.id) ?? []).map((v) => ({
          id: v.id,
          projectId: v.project_id,
          videoUrl: v.video_url,
          videoType: v.video_type,
          renderStatus: v.render_status,
          createdAt: v.created_at,
        })),
      })),
    posts: [
      ...posts.filter((p) => p.campaign_id === r.id).map(toPost),
      ...jobs.filter((j) => j.campaign_id === r.id).map(toJob),
    ],
  }));

  return NextResponse.json({ campaigns, timeZone, youtubeChannel } satisfies CampaignsPayload);
}

const TEXT_LIMITS: Record<string, number> = {
  name: 200,
  cta_text: 500,
  blog_title: 300,
  blog_platform: 100,
};

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

// PATCH — edit a campaign's own fields: name, CTA, link and the blog record.
export async function PATCH(req: NextRequest) {
  const access = await requireCampaignUser();
  if ("response" in access) return access.response;
  const { userId } = access;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!body || !id) return bad("Campaign id required.");

  const admin = createAdminClient();
  const { data: existingRow } = await admin
    .from("campaigns")
    .select("id, blog_status, blog_url, blog_published_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const existing = existingRow as { id: string; blog_status: BlogStatus; blog_url: string | null; blog_published_at: string | null } | null;
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const update: Record<string, string | null> = {};

  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v !== null && typeof v !== "string") return bad("That field must be text.");
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length > max) return bad(`That's too long — keep it under ${max} characters.`);
    if (key === "name" && !s) return bad("A campaign needs a name.");
    update[key] = s || null;
  }

  for (const key of ["destination_url", "blog_url"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") { update[key] = null; continue; }
    if (typeof v !== "string" || !isHttpUrl(v.trim())) {
      return bad(key === "blog_url"
        ? "The published URL must be a full web address, starting with https://"
        : "The destination link must be a full web address, starting with https://");
    }
    update[key] = v.trim();
  }

  for (const key of ["blog_planned_at", "blog_published_at"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") { update[key] = null; continue; }
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return bad("That date couldn't be read.");
    update[key] = new Date(v).toISOString();
  }

  if ("blog_status" in body) {
    const v = body.blog_status;
    if (typeof v !== "string" || !(v in BLOG_STATUSES)) return bad("Unknown article status.");
    update.blog_status = v;
  }

  const nextStatus = update.blog_status ?? existing.blog_status;
  const nextUrl = "blog_url" in update ? update.blog_url : existing.blog_url;
  if (nextStatus === "published") {
    // Published means there is somewhere a reader can go.
    if (!nextUrl) return bad("Add the article's published URL before marking it published.");
    if (!("blog_published_at" in update) && !existing.blog_published_at) {
      update.blog_published_at = new Date().toISOString();
    }
  } else if (existing.blog_status === "published" && "blog_status" in update) {
    // Taken back out of published: the old date no longer describes anything.
    update.blog_published_at = null;
  }

  if (!Object.keys(update).length) return NextResponse.json({ ok: true });

  const { error } = await admin.from("campaigns").update(update).eq("id", id).eq("user_id", userId);
  if (error) {
    console.error("[campaigns] update failed:", error.message);
    return NextResponse.json({ error: "Couldn't save that change." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
