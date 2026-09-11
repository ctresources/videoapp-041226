/**
 * PATCH /api/campaigns/project — the Spark Card's edits to one of its videos.
 *
 *   { action: "role",     projectId, role }
 *   { action: "attach",   projectId, campaignId, role }
 *   { action: "article",  projectId, intro, body, conclusion }
 *   { action: "captions", projectId, youtube_title?, youtube_description?, instagram_caption? }
 *
 * Every action checks the project belongs to the caller, and "attach" checks
 * the destination Spark does too. Only for accounts granted the calendar.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCampaignUser } from "@/lib/utils/campaign-access";
import { CAMPAIGN_ROLES } from "@/lib/utils/campaigns";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** YouTube's own limits for title and description; Instagram's for a caption. */
const CAPTION_LIMITS: Record<string, number> = {
  youtube_title: 100,
  youtube_description: 5000,
  instagram_caption: 2200,
};

const ARTICLE_LIMIT = 60_000;

const isRole = (v: unknown): v is keyof typeof CAMPAIGN_ROLES =>
  typeof v === "string" && v in CAMPAIGN_ROLES;

export async function PATCH(req: NextRequest) {
  const access = await requireCampaignUser();
  if ("response" in access) return access.response;
  const { userId } = access;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!body || !projectId) return bad("projectId required.");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("projects")
    .select("id, campaign_id, ai_script, seo_data")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  const project = row as {
    id: string;
    campaign_id: string | null;
    ai_script: Record<string, unknown> | null;
    seo_data: Record<string, unknown> | null;
  } | null;
  if (!project) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  // ── Change a video's role within its Spark ──────────────────────────────
  if (action === "role") {
    if (!isRole(body.role)) return bad("Unknown role.");
    if (!project.campaign_id) return bad("That video isn't in a Spark.");
    const { error } = await admin
      .from("projects")
      .update({ campaign_role: body.role })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: "Couldn't change the role." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Move a video into this Spark ─────────────────────────────────────────
  if (action === "attach") {
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    const role = isRole(body.role) ? body.role : "short_variation";
    if (!campaignId) return bad("campaignId required.");

    const { data: target } = await admin
      .from("campaigns")
      .select("id, blog_project_id")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "Spark not found." }, { status: 404 });
    if (project.campaign_id === campaignId) return NextResponse.json({ ok: true });

    const fromId = project.campaign_id;

    const { error: moveErr } = await admin
      .from("projects")
      .update({ campaign_id: campaignId, campaign_role: role })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (moveErr) return NextResponse.json({ error: "Couldn't add that video." }, { status: 500 });

    // The video's posts and queued jobs come with it, so its history shows in
    // the Spark it now belongs to.
    const { data: vids } = await admin.from("generated_videos").select("id").eq("project_id", projectId).eq("user_id", userId);
    const videoIds = ((vids ?? []) as { id: string }[]).map((v) => v.id);
    if (videoIds.length) {
      await admin.from("social_posts").update({ campaign_id: campaignId }).eq("user_id", userId).in("video_id", videoIds);
    }
    await admin.from("publish_jobs").update({ campaign_id: campaignId }).eq("user_id", userId).eq("project_id", projectId);

    // A Spark with no article of its own adopts this video's.
    if (!(target as { blog_project_id: string | null }).blog_project_id) {
      await admin.from("campaigns").update({ blog_project_id: projectId }).eq("id", campaignId).eq("user_id", userId);
    }

    if (fromId) {
      const { count } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", fromId);
      if (!count) {
        // Nothing left in the old Spark: remove it rather than leave an empty card.
        await admin.from("campaigns").delete().eq("id", fromId).eq("user_id", userId);
      } else {
        // Still has videos, but its article belonged to the one that left.
        await admin
          .from("campaigns")
          .update({ blog_project_id: null })
          .eq("id", fromId)
          .eq("user_id", userId)
          .eq("blog_project_id", projectId);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // ── Edit the article text ────────────────────────────────────────────────
  if (action === "article") {
    const parts = ["intro", "body", "conclusion"] as const;
    const text: Record<string, string> = {};
    for (const k of parts) {
      const v = body[k];
      if (typeof v !== "string") return bad("The article must be text.");
      text[k] = v.replace(/\r\n/g, "\n");
    }
    if (!text.body.trim()) return bad("The article body can't be empty.");
    if (text.intro.length + text.body.length + text.conclusion.length > ARTICLE_LIMIT) {
      return bad("That article is too long to save.");
    }
    // Merged into ai_script rather than replacing it — everything else there
    // is the script itself.
    const { error } = await admin
      .from("projects")
      .update({
        ai_script: {
          ...(project.ai_script ?? {}),
          blog_intro: text.intro,
          blog_body: text.body,
          blog_conclusion: text.conclusion,
        },
      })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: "Couldn't save the article." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Edit captions ────────────────────────────────────────────────────────
  if (action === "captions") {
    const next: Record<string, string> = {};
    for (const [key, max] of Object.entries(CAPTION_LIMITS)) {
      if (!(key in body)) continue;
      const v = body[key];
      if (typeof v !== "string") return bad("Captions must be text.");
      if (v.length > max) return bad(`That caption is over the ${max}-character limit.`);
      next[key] = v;
    }
    if (!Object.keys(next).length) return NextResponse.json({ ok: true });
    // The same fields the editor's Share Kit edits and Publish fills in from.
    const { error } = await admin
      .from("projects")
      .update({ seo_data: { ...(project.seo_data ?? {}), ...next } })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: "Couldn't save the captions." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action.");
}
