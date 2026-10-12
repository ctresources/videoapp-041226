/**
 * The Content Calendar's data — videos scheduled to publish, and cancelling one.
 *
 * This used to read the Blotato schedule and nothing else, and returned an
 * empty list to anyone without a Blotato key — which was everyone, so the
 * calendar was permanently blank while telling people to schedule a video to
 * fill it. Blotato is gone; these are our own social_posts rows.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, deleteYouTubeVideo } from "@/lib/api/youtube";
import { SocialPublishError, cancelScheduled, publishStatus, uploadPostConfigured } from "@/lib/api/upload-post";
import { parseRef, settleByRef } from "@/lib/api/social-settle";
import { partnerPlatform } from "@/lib/utils/social-platforms";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET — everything waiting to go out.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  /**
   * Retire the ones whose time has come.
   *
   * post_status was write-once: the publish route set "scheduled" and nothing
   * ever advanced it. So a post sat on the calendar forever under the words
   * "until YouTube makes it public", Analytics never counted it as published
   * while counting it as upcoming, and — the dangerous one — the cancel guard
   * below tested a status that could not change, so cancelling after the
   * publish date deleted a LIVE video and called it a cancellation.
   *
   * A cron would be tidier, but this is the only route that reads these rows,
   * so sweeping them here costs one write on a page nobody loads often and
   * needs no new infrastructure. YouTube has published anything whose
   * scheduled_at has passed.
   */
  await admin
    .from("social_posts")
    .update({ post_status: "posted", posted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .eq("post_status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  /**
   * The other platforms are not swept, they are asked.
   *
   * YouTube holds a scheduled video and makes it public itself, so a passed
   * time means published. A post scheduled anywhere else is only SENT at its
   * time, and can be refused then. Marking those "posted" by the clock would
   * report a post that never went out. So whatever is due is settled from its
   * real result, the same way the Publish window and the webhook do it; a row
   * with no result yet simply stays as it is until the next look.
   */
  if (uploadPostConfigured()) {
    const { data: due } = await admin
      .from("social_posts")
      .select("upload_request_id")
      .eq("user_id", user.id)
      .neq("platform", "youtube")
      .eq("post_status", "scheduled")
      .not("upload_request_id", "is", null)
      .lte("scheduled_at", new Date().toISOString())
      .limit(40);
    const refs = Array.from(new Set(((due ?? []) as { upload_request_id: string }[]).map((r) => r.upload_request_id))).slice(0, 6);
    for (const ref of refs) {
      try { await settleByRef(admin, user.id, ref); }
      catch (err) { console.error("[social/schedule] could not check a due post:", err instanceof Error ? err.message : err); }
    }
  }

  const { data: rows } = await admin
    .from("social_posts")
    .select("id, platform, scheduled_at, post_status, caption, platform_post_id, video_title, upload_request_id")
    .eq("user_id", user.id)
    .eq("post_status", "scheduled")
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  type Row = {
    id: string; platform: string; scheduled_at: string; post_status: string;
    caption: string | null; platform_post_id: string | null; video_title: string | null;
    upload_request_id: string | null;
  };
  const all = (rows ?? []) as Row[];
  const posts = all.map((row) => ({
    id: row.id,
    platform: row.platform,
    scheduledAt: row.scheduled_at,
    status: row.post_status,
    caption: row.caption ?? undefined,
    videoTitle: row.video_title ?? undefined,
    videoUrl: row.platform === "youtube" && row.platform_post_id ? `https://youtu.be/${row.platform_post_id}` : undefined,
    // Platforms scheduled in the same publish are one job, and cancel
    // together. Named here so the Cancel button can say so before it is pressed.
    alsoCancels: row.upload_request_id
      ? all
          .filter((o) => o.id !== row.id && o.upload_request_id === row.upload_request_id)
          .map((o) => partnerPlatform(o.platform)?.label ?? o.platform)
      : [],
  }));

  return NextResponse.json({ posts });
}

/**
 * DELETE — cancel a scheduled post.
 *
 * A scheduled upload already sits on YouTube as a private video waiting for
 * its publishAt, so cancelling means deleting it there, not just forgetting
 * the row. Removing only the row would leave a video that still goes public
 * at the appointed time with nothing in the app aware of it.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scheduleId = body.scheduleId ?? body.postId;
  if (!scheduleId) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("social_posts")
    .select("id, platform, platform_post_id, post_status, scheduled_at, upload_request_id")
    .eq("id", scheduleId)
    .eq("user_id", user.id)
    .single();

  const post = row as {
    id: string; platform: string; platform_post_id: string | null;
    post_status: string; scheduled_at: string | null; upload_request_id: string | null;
  } | null;
  if (!post) return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 });
  if (post.post_status !== "scheduled") {
    return NextResponse.json({ error: "That post has already gone out." }, { status: 400 });
  }
  /**
   * The status check above is not enough on its own.
   *
   * It is only as current as the last time someone loaded the calendar, and
   * this endpoint deletes the video from YouTube — so a stale "scheduled" row
   * whose publish time has passed would take a live, public video with it.
   * The clock is the authority here, not the column.
   */
  if (post.scheduled_at && new Date(post.scheduled_at) <= new Date()) {
    return NextResponse.json(
      {
        error: post.platform === "youtube"
          ? "That video has already gone public on YouTube. Delete it in YouTube Studio if you want it taken down."
          : "That post's time has passed, so it has already been sent.",
      },
      { status: 400 },
    );
  }

  /**
   * Any other platform: the post is a job waiting at the publishing partner,
   * and it goes out from there. This used to delete our row and report
   * success, which cancelled nothing; the post still went out on time with
   * nothing here aware of it. The job is cancelled first, and the rows go
   * only once that is known to have worked.
   */
  if (post.platform !== "youtube") {
    const jobId = post.upload_request_id ? parseRef(post.upload_request_id).jobId : undefined;
    if (!jobId) {
      return NextResponse.json({ error: "This post can't be cancelled from here." }, { status: 409 });
    }
    try {
      const cancelled = await cancelScheduled(jobId);
      if (!cancelled) {
        // No such job. Either it has run, or it was cancelled already.
        const ran = await publishStatus({ jobId });
        if (ran && ran.length > 0) {
          await settleByRef(admin, user.id, post.upload_request_id!);
          return NextResponse.json({ error: "That post has already been sent, so it can't be cancelled." }, { status: 400 });
        }
      }
    } catch (err) {
      const msg = err instanceof SocialPublishError ? err.message : "The post couldn't be cancelled. Try again in a moment.";
      console.error("[social/schedule] cancel failed:", err instanceof SocialPublishError ? err.raw ?? err.message : err);
      // As with YouTube: not cancelled means it still goes out, so say so.
      return NextResponse.json({ error: msg === "The post couldn't be sent. Try again in a moment." ? "The post couldn't be cancelled. Try again in a moment." : msg }, { status: 502 });
    }

    // Every platform in the job was cancelled with it.
    const { data: gone } = await admin
      .from("social_posts")
      .delete()
      .eq("user_id", user.id)
      .eq("upload_request_id", post.upload_request_id!)
      .eq("post_status", "scheduled")
      .select("id, platform");
    const removed = (gone ?? []) as { id: string; platform: string }[];
    return NextResponse.json({
      success: true,
      cancelledIds: removed.map((r) => r.id),
      cancelled: removed.map((r) => partnerPlatform(r.platform)?.label ?? r.platform),
    });
  }

  if (post.platform === "youtube" && post.platform_post_id) {
    try {
      const accessToken = await getValidAccessToken(user.id, admin);
      await deleteYouTubeVideo(accessToken, post.platform_post_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not remove the video from YouTube";
      console.error("[social/schedule] YouTube delete failed:", msg);
      // Reporting success here would tell the user it is cancelled while the
      // video still publishes on schedule.
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  await admin.from("social_posts").delete().eq("id", post.id);
  return NextResponse.json({ success: true, cancelledIds: [post.id], cancelled: ["YouTube"] });
}
