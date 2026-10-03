import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, uploadVideoToYouTube, setVideoThumbnail, setVideoThumbnailBytes } from "@/lib/api/youtube";
import { thumbnailCardPng } from "@/lib/api/thumbnail-card";
import { NextRequest, NextResponse } from "next/server";
import {
  SocialPublishError, profileUsername, publishPhoto, publishVideo, uploadPostConfigured,
  type PublishAccepted,
} from "@/lib/api/upload-post";
import { storeRef } from "@/lib/api/social-settle";
import {
  deliveryFor, fitCaption, partnerPlatformLimit, platformFromAccountId, withoutPhoneNumbers,
  type PartnerPlatform,
} from "@/lib/utils/social-platforms";
import { randomUUID } from "node:crypto";

export const maxDuration = 300;

interface PostRequestTarget {
  accountId: string;
  platform: string;
  caption?: string;
  title?: string;
  description?: string;
  privacy?: "public" | "unlisted" | "private";
  source?: "native" | "partner";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { videoId, targets, scheduledAt } = body as {
    videoId: string;
    targets: PostRequestTarget[];
    scheduledAt?: string;
  };

  if (!videoId || !targets?.length) {
    return NextResponse.json({ error: "videoId and targets required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: videoData } = await admin
    .from("generated_videos")
    .select("*, projects(title, ai_script, seo_data, thumbnail_url, campaign_id)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  const video = videoData as {
    video_url: string | null;
    project_id: string | null;
    duration_seconds: number | null;
    video_type: string | null;
    render_provider: string | null;
    projects: { title: string; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null; thumbnail_url: string | null; campaign_id: string | null } | null;
  } | null;

  /**
   * Split from the not-ready case below on purpose.
   *
   * A null row means the video does not exist or is not this user's, and there
   * is nothing to write a record against — inventing a social_posts row for an
   * id we cannot vouch for would be worse than staying quiet.
   */
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const aiScript = video.projects?.ai_script as Record<string, unknown> | null;
  const seoData = video.projects?.seo_data as Record<string, unknown> | null;
  const defaultTitle = String(aiScript?.title || video.projects?.title || "");
  const defaultYouTubeDesc = String(seoData?.youtube_description || aiScript?.description || defaultTitle);
  const defaultCaption = String(seoData?.instagram_caption || aiScript?.hook || defaultTitle);

  /**
   * Which Spark this post belongs to.
   *
   * Set here rather than left to a backfill. Only two things ever wrote it:
   * migration 032, and the move-a-video-between-Sparks branch in
   * /api/campaigns/project. Nothing filled it in on a new post — so a publish
   * started from the Spark Card saved a row with campaign_id NULL, and the
   * card's own query filters posts with `.in("campaign_id", ids)`. The post
   * went up, and the card that sent it never showed it again.
   */
  const campaignId = video.projects?.campaign_id ?? null;

  /**
   * The render has not finished, so there is nothing to upload.
   *
   * This used to return before any of the recording below could run, which
   * made it the one failure the Spark Card could never show — and the obvious
   * way to exercise the saved-failure path without touching a working YouTube
   * connection. It is a real failed attempt from the user's side, so it is
   * written down like any other.
   */
  if (!video.video_url) {
    const reason = "The video hadn't finished rendering yet, so there was nothing to upload.";
    const { error: notReadyLogErr } = await admin.from("social_posts").insert({
      user_id: user.id,
      video_id: videoId,
      campaign_id: campaignId,
      platform: targets[0]?.platform || "youtube",
      video_title: targets[0]?.title || defaultTitle,
      scheduled_at: scheduledAt || null,
      posted_at: null,
      post_status: "failed",
      error_message: reason,
    });
    if (notReadyLogErr) {
      console.error(`[social/post] could not record the not-ready failure: ${notReadyLogErr.message}`);
    }
    return NextResponse.json({ error: reason }, { status: 409 });
  }

  // `error` is its own field rather than riding in `url`. The failure message
  // used to be stuffed into `url`, where the client could not tell a post link
  // apart from an error string — so it surfaced neither.
  // `ref` is set on a post handed to another platform, which finishes later:
  // it is what the Publish window asks /api/social/status about.
  const results: Array<{ platform: string; status: string; url?: string; error?: string; ref?: string }> = [];

  // Whether the project's generated thumbnail actually landed on YouTube.
  // Reported back rather than promised up front: setting a custom thumbnail
  // needs a phone-verified channel, and when it fails the Publish window has
  // to tell the user to set it by hand instead of silently showing nothing.
  let thumbnailSet = false;

  // ── Native YouTube targets ─────────────────────────────────────────────────
  const nativeYouTubeTargets = targets.filter(
    (t) => t.accountId === "native_youtube" || t.source === "native",
  );

  if (nativeYouTubeTargets.length > 0) {
    try {
      const accessToken = await getValidAccessToken(user.id, admin);
      const target = nativeYouTubeTargets[0];

      // Scheduling used to reach only as far as the log row: the upload went
      // out immediately at whatever privacy was chosen, while the app said
      // "Your video will be posted on Friday". YouTube holds a video only if
      // it is uploaded private with a publishAt, which is what this passes.
      const result = await uploadVideoToYouTube(accessToken, {
        videoUrl: video.video_url,
        // `??` not `||`: an empty string is a deliberate choice. Someone who
        // clears the description wants a clean post, and substituting the
        // generated text put back exactly what they had just removed.
        title: target.title ?? defaultTitle,
        description: target.description ?? defaultYouTubeDesc,
        privacy: target.privacy || "public",
        publishAt: scheduledAt || null,
      });

      // Apply the project's thumbnail. Non-fatal by design: a channel without
      // phone verification cannot take a custom thumbnail, and that must not
      // fail an otherwise successful upload.
      //
      // Two sources, and only one of them is a URL YouTube's side of this can
      // reach. thumbnail_url holds a real PNG in storage once one has been
      // rendered. Where none has, the fallback is the generated card, which
      // lives behind a signed-in route — so it is rendered here, in process,
      // and the bytes go up directly.
      //
      // The old code took `thumbnail_url || seo_data.thumbnail_url` and then
      // required it to start with http. seo_data's value was always the
      // relative "/api/thumbnail?hook=…", so it never passed that test: every
      // project without a stored PNG uploaded with no thumbnail at all, and
      // nothing said so. YouTube picked a frame from the video instead.
      try {
        const storedThumb = video.projects?.thumbnail_url;
        if (storedThumb && /^https?:\/\//.test(storedThumb)) {
          await setVideoThumbnail(accessToken, result.videoId, storedThumb);
          thumbnailSet = true;
        } else {
          const { data: prof } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          const png = await thumbnailCardPng({
            hook: String(aiScript?.hook || aiScript?.title || "") || null,
            agent: (prof as { full_name: string | null } | null)?.full_name ?? null,
          });
          await setVideoThumbnailBytes(accessToken, result.videoId, png);
          thumbnailSet = true;
        }
      } catch (err) {
        console.warn(
          "[social/post] YouTube thumbnail set failed (channel may need phone verification):",
          err instanceof Error ? err.message : err,
        );
      }

      // post_status must be one of scheduled/posting/posted/failed — the table's
      // CHECK constraint. This said "published", which is not in that list, so
      // EVERY insert threw. Because the insert runs after a successful upload,
      // the video reached YouTube and was then reported as a failure, and
      // social_posts stayed permanently empty.
      const { error: logErr } = await admin.from("social_posts").insert({
        user_id: user.id,
        video_id: videoId,
        campaign_id: campaignId,
        platform: "youtube",
        platform_post_id: result.videoId,
        // Snapshotted, not joined: deleting the video nulls video_id, and a
        // publish record with nothing naming what was posted is unreadable.
        video_title: target.title || defaultTitle,
        caption: target.description ?? defaultYouTubeDesc,
        scheduled_at: scheduledAt || null,
        posted_at: scheduledAt ? null : new Date().toISOString(),
        // A scheduled upload is on YouTube but not yet public, so it is not
        // "posted" — it is waiting. Recording it as posted was the second
        // half of the scheduling lie.
        post_status: scheduledAt ? "scheduled" : "posted",
      });
      // The upload already happened. A bookkeeping failure must never be
      // reported as a failed post — that is the mistake this whole branch made.
      if (logErr) {
        console.error(`[social/post] YouTube upload succeeded but logging failed: ${logErr.message}`);
      }

      results.push({ platform: "youtube", status: "published", url: result.youtubeUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "YouTube upload failed";
      console.error("[social/post] YouTube upload failed:", msg);

      /**
       * The failure is written down, not only returned.
       *
       * It used to exist in three places that all expire: this log line, the
       * toast, and the `results` array in a response nobody keeps. Refresh the
       * page and there was no trace that the attempt had ever been made — no
       * reason to act on, and nothing to retry from. `failed` is already a
       * legal post_status and `error_message` already exists, so the record
       * has somewhere to go without a schema change.
       *
       * `target` is scoped to the try, so the target is read again here.
       */
      const failedTarget = nativeYouTubeTargets[0];
      const { error: failLogErr } = await admin.from("social_posts").insert({
        user_id: user.id,
        video_id: videoId,
        campaign_id: campaignId,
        platform: "youtube",
        video_title: failedTarget?.title || defaultTitle,
        caption: failedTarget?.description ?? defaultYouTubeDesc,
        scheduled_at: scheduledAt || null,
        // Nothing was posted, so this stays empty — posted_at is what the
        // calendar reads to place a published item on a day.
        posted_at: null,
        post_status: "failed",
        // Bounded: some provider errors carry a whole response body, and this
        // is rendered in a card, not read from a log.
        error_message: msg.slice(0, 500),
      });
      // Recording the failure is itself allowed to fail without changing what
      // the caller is told — the upload result is the news, not the bookkeeping.
      if (failLogErr) {
        console.error(`[social/post] could not record the failure: ${failLogErr.message}`);
      }

      results.push({ platform: "youtube", status: "failed", error: msg });
    }
  }

  /**
   * Everything that is not native YouTube goes through the publishing partner.
   *
   * These are handed off, not posted: each platform fetches and transcodes the
   * video in its own time, so the rows are written as "posting" and settled
   * when the result arrives (the webhook, or the status check the Publish
   * window makes). One result per platform, always. The integration this
   * replaced returned one result covering every target, which is how
   * "Published to 3 platforms" came to be said about one.
   */
  const partnerTargets = targets
    .filter((t) => t.accountId !== "native_youtube" && t.source !== "native")
    .map((t) => ({ target: t, platform: platformFromAccountId(t.accountId) }));

  // A platform this app has never heard of: refused by name rather than dropped.
  for (const { target } of partnerTargets.filter((x) => !x.platform)) {
    results.push({ platform: target.platform, status: "failed", error: "That platform can't be published to yet." });
  }

  const wanted = partnerTargets.filter((x): x is { target: PostRequestTarget; platform: PartnerPlatform } => !!x.platform);

  if (wanted.length > 0) {
    const failAll = async (reason: string, record: boolean) => {
      for (const { platform, target } of wanted) {
        if (record) {
          await admin.from("social_posts").insert({
            user_id: user.id, video_id: videoId, campaign_id: campaignId, platform,
            video_title: target.title || defaultTitle, caption: target.caption ?? defaultCaption,
            scheduled_at: scheduledAt || null, posted_at: null, post_status: "failed", error_message: reason,
          });
        }
        results.push({ platform, status: "failed", error: reason });
      }
    };

    const { data: ownerRow } = await admin
      .from("profiles")
      .select("subscription_tier, role, full_name, social_profile_created_at")
      .eq("id", user.id)
      .maybeSingle();
    const owner = ownerRow as {
      subscription_tier: string | null; role: string | null; full_name: string | null; social_profile_created_at: string | null;
    } | null;
    const limit = partnerPlatformLimit(owner?.subscription_tier, owner?.role);

    if (!uploadPostConfigured()) {
      await failAll("Only YouTube can be published to right now. More platforms are coming.", false);
    } else if (limit <= 0) {
      await failAll("Posting to more platforms comes with a paid plan.", false);
    } else if (wanted.length > limit) {
      // Refused whole rather than trimmed: which three is the agent's choice,
      // and posting to a subset they did not pick is worse than asking.
      await failAll(`Your plan posts each video to YouTube plus ${limit} more. Pick ${limit}, or move up a plan to post everywhere.`, false);
    } else if (!owner?.social_profile_created_at) {
      await failAll("Connect your accounts in Settings first, then post again.", false);
    } else {
      const username = profileUsername(user.id);
      const caption = wanted[0].target.caption ?? defaultCaption;
      const postTitle = wanted[0].target.title ?? defaultTitle;
      const vertical = video.video_type === "reel_9x16";
      const seconds = video.duration_seconds;

      // Where "Learn more" leads: the blog post if the agent has said where it
      // lives, else the video on YouTube, from this publish or an earlier one.
      let learnMoreUrl = typeof seoData?.email_blog_url === "string" && /^https?:\/\//.test(seoData.email_blog_url)
        ? seoData.email_blog_url
        : results.find((r) => r.platform === "youtube" && r.status === "published")?.url ?? "";
      if (!learnMoreUrl) {
        const { data: earlier } = await admin
          .from("social_posts")
          .select("platform_post_id")
          .eq("video_id", videoId).eq("user_id", user.id).eq("platform", "youtube")
          .not("platform_post_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const ytId = (earlier as { platform_post_id: string | null } | null)?.platform_post_id;
        if (ytId) learnMoreUrl = `https://www.youtube.com/watch?v=${ytId}`;
      }

      const asVideo: PartnerPlatform[] = [];
      let google: "video" | "photo" | null = null;
      for (const { platform, target } of wanted) {
        const delivery = deliveryFor(platform, seconds);
        if (delivery.kind === "skip") {
          await admin.from("social_posts").insert({
            user_id: user.id, video_id: videoId, campaign_id: campaignId, platform,
            video_title: target.title || defaultTitle, caption,
            scheduled_at: scheduledAt || null, posted_at: null, post_status: "failed", error_message: delivery.reason,
          });
          results.push({ platform, status: "failed", error: delivery.reason });
        } else if (platform === "google_business") {
          google = delivery.kind;
        } else {
          asVideo.push(platform);
        }
      }

      /** Sends one group, then writes a row per platform: waiting on success, failed on refusal. */
      const handOff = async (platforms: PartnerPlatform[], text: string, send: (requestId: string) => Promise<PublishAccepted>) => {
        const requestId = randomUUID();
        let ref: string | null = null;
        let reason: string | null = null;
        try {
          ref = storeRef(await send(requestId));
        } catch (err) {
          reason = err instanceof SocialPublishError ? err.message : "The post couldn't be sent. Try again in a moment.";
          if (!(err instanceof SocialPublishError)) console.error("[social/post] hand-off failed:", err);
        }
        for (const platform of platforms) {
          const { error: rowErr } = await admin.from("social_posts").insert({
            user_id: user.id, video_id: videoId, campaign_id: campaignId, platform,
            video_title: postTitle, caption: text,
            scheduled_at: scheduledAt || null, posted_at: null,
            post_status: ref ? (scheduledAt ? "scheduled" : "posting") : "failed",
            upload_request_id: ref,
            error_message: reason,
          });
          if (rowErr) console.error(`[social/post] could not record the ${platform} post: ${rowErr.message}`);
          results.push(ref
            ? { platform, status: scheduledAt ? "scheduled" : "posting", ref }
            : { platform, status: "failed", error: reason ?? undefined });
        }
      };

      if (asVideo.length > 0) {
        // A Reel is 90 seconds at most. Sent as a Reel only when the video is
        // known to fit; anything else goes up as a normal Page video, which
        // takes any length and any shape.
        const reel = vertical && typeof seconds === "number" && seconds > 0 && seconds <= 90;
        const extra: Record<string, string> = {
          facebook_media_type: reel ? "REELS" : "VIDEO",
          facebook_title: fitCaption(postTitle, 250),
          facebook_description: caption,
          linkedin_title: fitCaption(postTitle, 200),
          // The LinkedIn post written for this video, when there is one: it is
          // longer and reads differently from a caption.
          linkedin_description: typeof seoData?.linkedin_post === "string" && seoData.linkedin_post.trim()
            ? seoData.linkedin_post
            : caption,
          x_title: fitCaption(caption, 280),
          threads_title: fitCaption(caption, 500),
          // Said plainly where the platform asks: an avatar video is AI-made.
          ...(video.render_provider?.startsWith("heygen") ? { is_ai_generated: "true" } : {}),
        };
        await handOff(asVideo, caption, (requestId) => publishVideo({
          username, platforms: asVideo, requestId, title: fitCaption(caption, 2200),
          description: caption, scheduledAt: scheduledAt || null, extra, videoUrl: video.video_url!,
        }));
      }

      if (google) {
        const text = fitCaption(withoutPhoneNumbers(caption) || postTitle, 1500);
        const extra: Record<string, string> = learnMoreUrl
          ? { gbp_cta_type: "LEARN_MORE", gbp_cta_url: learnMoreUrl }
          : {};
        const common = { username, platforms: ["google_business" as const], title: text, scheduledAt: scheduledAt || null, extra };
        if (google === "video") {
          await handOff(["google_business"], text, (requestId) => publishVideo({ ...common, requestId, videoUrl: video.video_url! }));
        } else {
          // The thumbnail already in storage, or the generated card when there
          // is none. Rendered here because the card's own URL sits behind a
          // signed-in route no platform can fetch.
          const stored = video.projects?.thumbnail_url;
          const photo = stored && /^https?:\/\//.test(stored)
            ? stored
            : {
                bytes: await thumbnailCardPng({
                  hook: String(aiScript?.hook || aiScript?.title || "") || null,
                  agent: owner?.full_name ?? null,
                }),
                filename: "post.png",
              };
          await handOff(["google_business"], text, (requestId) => publishPhoto({ ...common, requestId, photo }));
        }
      }
    }
  }

  // Update project status
  if (video.project_id) {
    const allFailed = results.every((r) => r.status === "failed");
    if (!allFailed) {
      await admin.from("projects")
        .update({ status: scheduledAt ? "ready" : "posted" })
        .eq("id", video.project_id);
    }
  }

  const anySuccess = results.some((r) => r.status !== "failed");
  const youtubePublished = results.some((r) => r.platform === "youtube" && r.status === "published");

  // A 200 with success:false was indistinguishable from a win to any client
  // that only checks res.ok — which is exactly what the Publish window did, so
  // a failed upload rendered as "Published!". When nothing got through, say so
  // in the status code and put the first real reason in `error`.
  const status = anySuccess ? 200 : 502;
  const firstError = results.find((r) => r.status === "failed")?.error;

  return NextResponse.json({
    success: anySuccess,
    ...(anySuccess ? {} : { error: firstError || "Nothing could be published." }),
    results,
    scheduledAt,
    youtubeUrl: results.find((r) => r.platform === "youtube" && r.status === "published")?.url,
    // Hand-offs still in flight, for the Publish window to check on.
    pendingRefs: Array.from(new Set(results.map((r) => r.ref).filter((r): r is string => !!r))),
    // Only meaningful when YouTube was actually published to; null elsewhere so
    // the client can tell "didn't apply" apart from "wasn't attempted".
    thumbnailSet: youtubePublished ? thumbnailSet : null,
  }, { status });
}
