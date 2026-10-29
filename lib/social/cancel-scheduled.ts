import type { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, deleteYouTubeVideo } from "@/lib/api/youtube";
import { SocialPublishError, cancelScheduled, publishStatus } from "@/lib/api/upload-post";
import { parseRef, settleByRef } from "@/lib/api/social-settle";
import { partnerPlatform } from "@/lib/utils/social-platforms";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Cancels one scheduled post (moved out of /api/social/schedule DELETE on
 * 2026-10-29 so AutoSparks' Delete post uses the same steps). A partner post
 * is cancelled at the partner first, with every platform in its job; a
 * YouTube one is deleted from YouTube, where it waits privately. The rows go
 * only once that is known to have worked.
 */
export async function cancelScheduledPost(
  admin: Admin, userId: string, postId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: row } = await admin
    .from("social_posts")
    .select("id, platform, platform_post_id, post_status, scheduled_at, upload_request_id")
    .eq("id", postId)
    .eq("user_id", userId)
    .single();

  const post = row as {
    id: string; platform: string; platform_post_id: string | null;
    post_status: string; scheduled_at: string | null; upload_request_id: string | null;
  } | null;
  if (!post) return { status: 404, body: { error: "Scheduled post not found" } };
  if (post.post_status !== "scheduled") {
    return { status: 400, body: { error: "That post has already gone out." } };
  }
  /**
   * The status check above is not enough on its own: it is only as current
   * as the last calendar load, and this deletes the video from YouTube, so a
   * stale "scheduled" row past its time would take a live video with it.
   * The clock is the authority here, not the column.
   */
  if (post.scheduled_at && new Date(post.scheduled_at) <= new Date()) {
    return {
      status: 400,
      body: {
        error: post.platform === "youtube"
          ? "That video has already gone public on YouTube. Delete it in YouTube Studio if you want it taken down."
          : "That post's time has passed, so it has already been sent.",
      },
    };
  }

  if (post.platform !== "youtube") {
    const jobId = post.upload_request_id ? parseRef(post.upload_request_id).jobId : undefined;
    if (!jobId) return { status: 409, body: { error: "This post can't be cancelled from here." } };
    try {
      const cancelled = await cancelScheduled(jobId);
      if (!cancelled) {
        // No such job. Either it has run, or it was cancelled already.
        const ran = await publishStatus({ jobId });
        if (ran && ran.length > 0) {
          await settleByRef(admin, userId, post.upload_request_id!);
          return { status: 400, body: { error: "That post has already been sent, so it can't be cancelled." } };
        }
      }
    } catch (err) {
      const msg = err instanceof SocialPublishError ? err.message : "The post couldn't be cancelled. Try again in a moment.";
      console.error("[social/cancel] cancel failed:", err instanceof SocialPublishError ? err.raw ?? err.message : err);
      // Not cancelled means it still goes out, so say so.
      return { status: 502, body: { error: msg === "The post couldn't be sent. Try again in a moment." ? "The post couldn't be cancelled. Try again in a moment." : msg } };
    }

    // Every platform in the job was cancelled with it.
    const { data: gone } = await admin
      .from("social_posts")
      .delete()
      .eq("user_id", userId)
      .eq("upload_request_id", post.upload_request_id!)
      .eq("post_status", "scheduled")
      .select("id, platform");
    const removed = (gone ?? []) as { id: string; platform: string }[];
    return {
      status: 200,
      body: {
        success: true,
        cancelledIds: removed.map((r) => r.id),
        cancelled: removed.map((r) => partnerPlatform(r.platform)?.label ?? r.platform),
      },
    };
  }

  if (post.platform_post_id) {
    try {
      const accessToken = await getValidAccessToken(userId, admin);
      await deleteYouTubeVideo(accessToken, post.platform_post_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not remove the video from YouTube";
      console.error("[social/cancel] YouTube delete failed:", msg);
      // Reporting success here would say it's cancelled while it still publishes.
      return { status: 502, body: { error: msg } };
    }
  }

  await admin.from("social_posts").delete().eq("id", post.id);
  return { status: 200, body: { success: true, cancelledIds: [post.id], cancelled: ["YouTube"] } };
}
