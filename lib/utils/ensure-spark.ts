import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Sparks begin with projects made from September 2026 — the owner's choice.
 * Older projects stay unfiled and never appear on the calendar.
 *
 * Lives here rather than in the calendar route because both the create routes
 * and the page-load recovery have to apply the same cutoff. Two copies of a
 * date is two chances to change one of them.
 */
export const CAMPAIGNS_START = "2026-09-01T04:00:00Z";

/**
 * Give a project its Spark, now rather than the next time someone opens the
 * calendar.
 *
 * Every create route calls this the moment it has a project id. The calendar's
 * own filing calls the SAME function, so the page load is now recovery for
 * anything that failed here — never a second way of doing it that can drift.
 *
 * NEVER THROWS, and never returns a rejected promise. Each of its six callers
 * is a route where an exception means the user's script, recording or video
 * does not get created at all. A Spark is organisation laid over work that
 * already exists; it must never be able to destroy the work it describes. On
 * any failure this logs, returns null, and leaves the project unfiled for the
 * calendar to pick up.
 */
export async function ensureSparkFor(
  admin: Admin,
  userId: string,
  projectId: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("projects")
      .select("id, title, campaign_id, created_at, script_title:ai_script->>title, blog_body:ai_script->>blog_body")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    const project = data as {
      id: string;
      title: string;
      campaign_id: string | null;
      created_at: string;
      script_title: string | null;
      blog_body: string | null;
    } | null;

    // Not this user's, or gone. Scoped by user_id on purpose: this runs with
    // the admin client, so the caller's identity is the only thing standing
    // between a project id and a Spark on somebody else's calendar.
    if (!project) return null;

    /**
     * Already filed — but still repair what hangs off it.
     *
     * This is the "stopped halfway" case: the project was linked and then the
     * request died before its posts were. Returning early here would leave
     * those posts orphaned with no path back, because the project no longer
     * looks unfiled to anything.
     */
    if (project.campaign_id) {
      await linkChildren(admin, userId, projectId, project.campaign_id);
      return project.campaign_id;
    }

    // Parsed, not string-compared: Postgres hands back "2026-09-14 05:00:34+00"
    // rather than an ISO string, and the two do not sort alike.
    if (Date.parse(project.created_at) < Date.parse(CAMPAIGNS_START)) return null;

    /**
     * Create the Spark, letting the database settle who wins.
     *
     * The unique index on origin_project_id turns a concurrent double-create
     * into a 23505 for the loser instead of two Sparks for one project. The
     * loser then reads the winner's row, so both callers return the same id.
     */
    const { data: made, error: insErr } = await admin
      .from("campaigns")
      .insert({
        user_id: userId,
        name: project.title,
        origin_project_id: projectId,
        blog_project_id: projectId,
        blog_title: project.script_title?.trim() || project.title,
        blog_status: project.blog_body?.trim() ? "ready" : "draft",
      })
      .select("id")
      .single();

    let campaignId = (made as { id: string } | null)?.id ?? null;

    if (insErr) {
      if (insErr.code === "23505") {
        const { data: existing } = await admin
          .from("campaigns")
          .select("id")
          .eq("origin_project_id", projectId)
          .eq("user_id", userId)
          .maybeSingle();
        campaignId = (existing as { id: string } | null)?.id ?? null;
      }
      if (!campaignId) {
        console.error(`[ensure-spark] could not create a Spark for ${projectId}: ${insErr.message}`);
        return null;
      }
    }
    if (!campaignId) return null;

    /**
     * Claim the project, still guarded on campaign_id being empty.
     *
     * The guard matters for one case the unique index cannot cover: the project
     * being moved into another Spark between the read above and this write. The
     * move wins and this leaves one empty Spark behind, which is visible and
     * deletable — better than silently pulling the project back out of the
     * Spark somebody just put it in.
     */
    await admin
      .from("projects")
      .update({ campaign_id: campaignId, campaign_role: "primary" })
      .eq("id", projectId)
      .eq("user_id", userId)
      .is("campaign_id", null);

    await linkChildren(admin, userId, projectId, campaignId);
    return campaignId;
  } catch (err) {
    console.error(`[ensure-spark] failed for ${projectId} (non-fatal):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Point a project's posts and queued jobs at its Spark.
 *
 * Only ever fills in blanks — `campaign_id IS NULL` — so a post deliberately
 * moved to another Spark by /api/campaigns/project is never dragged back. That
 * is what makes this safe to re-run on every recovery pass.
 *
 * At creation time there is nothing to link yet. It earns its place on the
 * recovery path, and for a project that published before it was ever filed.
 */
async function linkChildren(
  admin: Admin,
  userId: string,
  projectId: string,
  campaignId: string,
): Promise<void> {
  const { data: vids } = await admin
    .from("generated_videos")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId);

  const videoIds = ((vids ?? []) as { id: string }[]).map((v) => v.id);
  if (videoIds.length) {
    const { error } = await admin
      .from("social_posts")
      .update({ campaign_id: campaignId })
      .eq("user_id", userId)
      .is("campaign_id", null)
      .in("video_id", videoIds);
    if (error) console.error(`[ensure-spark] linking posts for ${projectId} failed: ${error.message}`);
  }

  const { error: jobErr } = await admin
    .from("publish_jobs")
    .update({ campaign_id: campaignId })
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .is("campaign_id", null);
  if (jobErr) console.error(`[ensure-spark] linking jobs for ${projectId} failed: ${jobErr.message}`);
}
