import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SocialPublishError, editPost, profileUsername, uploadPostConfigured } from "@/lib/api/upload-post";
import { settleByRef } from "@/lib/api/social-settle";
import { PARTNER_PLATFORMS, partnerPlatform } from "@/lib/utils/social-platforms";

export const dynamic = "force-dynamic";

/**
 * Where one video has been posted, for the list at the top of the Publish
 * window.
 *
 * Until this there was nowhere to see it. A post to another platform finishes
 * minutes after it is sent, and once the Publish window was closed nothing
 * said whether it had landed or why it had not: the row was in the database
 * and on no screen. A failure the agent never hears about is one they cannot
 * retry.
 *
 * One line per platform, the most recent attempt on each: a platform that
 * failed and was then posted reads as posted.
 */

/** The platforms whose posts can have their text changed after they are up. */
const EDITABLE = ["facebook", "linkedin"];

interface Row {
  id: string;
  platform: string;
  post_status: string;
  posted_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  post_url: string | null;
  platform_post_id: string | null;
  error_message: string | null;
  caption: string | null;
  upload_request_id: string | null;
}

const COLUMNS = "id, platform, post_status, posted_at, scheduled_at, created_at, post_url, platform_post_id, error_message, caption, upload_request_id";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();
  const read = async () => {
    const { data } = await admin
      .from("social_posts")
      .select(COLUMNS)
      .eq("user_id", user.id)
      .eq("video_id", videoId)
      .order("created_at", { ascending: false })
      .limit(60);
    return (data ?? []) as Row[];
  };

  let rows = await read();
  const now = Date.now();

  // Bring anything still waiting up to date before it is shown, the same way
  // the Publish window does after sending: ask what happened and record it.
  if (uploadPostConfigured()) {
    const waiting = rows.filter((r) =>
      r.platform !== "youtube" && r.upload_request_id &&
      (r.post_status === "posting" || (r.post_status === "scheduled" && !!r.scheduled_at && new Date(r.scheduled_at).getTime() <= now)));
    const refs = Array.from(new Set(waiting.map((r) => r.upload_request_id!))).slice(0, 6);
    for (const ref of refs) {
      try { await settleByRef(admin, user.id, ref); }
      catch (err) { console.error("[social/posts] could not check a post:", err instanceof Error ? err.message : err); }
    }
    if (refs.length > 0) rows = await read();
  }

  const latest = new Map<string, Row>();
  for (const r of rows) if (!latest.has(r.platform)) latest.set(r.platform, r);

  const order = ["youtube", ...PARTNER_PLATFORMS.map((p) => p.id as string)];
  const posts = Array.from(latest.values())
    .sort((a, b) => (order.indexOf(a.platform) + 99) % 99 - (order.indexOf(b.platform) + 99) % 99)
    .map((r) => {
      // YouTube holds a scheduled video and publishes it itself, so a passed
      // time means it is up, whatever the row still says.
      const status = r.platform === "youtube" && r.post_status === "scheduled" && r.scheduled_at && new Date(r.scheduled_at).getTime() <= now
        ? "posted"
        : r.post_status;
      return {
        id: r.id,
        platform: r.platform,
        status,
        at: status === "scheduled" ? r.scheduled_at : r.posted_at ?? r.scheduled_at ?? r.created_at,
        url: r.platform === "youtube"
          ? (r.platform_post_id ? `https://youtu.be/${r.platform_post_id}` : null)
          : r.post_url,
        error: status === "failed" ? r.error_message : null,
        caption: r.caption,
        canEdit: status === "posted" && EDITABLE.includes(r.platform) && !!r.platform_post_id && uploadPostConfigured(),
      };
    });

  return NextResponse.json({ posts });
}

// POST { action: "edit", postId, caption } — change the text of a post that is already up.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { action?: string; postId?: string; caption?: string };
  if (body.action !== "edit" || !body.postId) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  const text = (body.caption ?? "").trim();
  if (!text) return NextResponse.json({ error: "The caption can't be empty." }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("social_posts")
    .select(COLUMNS)
    .eq("id", body.postId)
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as Row | null;
  if (!row) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (row.post_status !== "posted" || !EDITABLE.includes(row.platform) || !row.platform_post_id || !uploadPostConfigured()) {
    return NextResponse.json({ error: "That post can't be edited from here." }, { status: 400 });
  }

  const label = partnerPlatform(row.platform)?.label ?? row.platform;
  const limit = row.platform === "linkedin" ? 3000 : 2200;
  if (text.length > limit) return NextResponse.json({ error: `That is too long for ${label} (${limit} characters).` }, { status: 400 });

  try {
    await editPost({
      username: profileUsername(user.id),
      platform: row.platform as "facebook" | "linkedin",
      postId: row.platform_post_id,
      text,
    });
  } catch (err) {
    console.error(`[social/posts] edit ${row.platform}:`, err instanceof SocialPublishError ? err.raw ?? err.message : err);
    const status = err instanceof SocialPublishError ? err.status : 0;
    const message = status === 404
      ? `We couldn't find that post on ${label}. It may have been removed there.`
      : status === 403
        ? `${label} won't let that post be changed from here.`
        : "The caption couldn't be changed. Try again in a moment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await admin.from("social_posts").update({ caption: text }).eq("id", row.id);
  return NextResponse.json({ success: true, caption: text });
}
