import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnerPlatform } from "@/lib/utils/social-platforms";

export const dynamic = "force-dynamic";

/**
 * Posts that did not go out and that the agent has not dealt with, for the
 * note at the top of My Sparks.
 *
 * Only failures that happened AFTER the post was sent: those are the ones
 * nobody was told about, because the platform refused it minutes later. A post
 * refused at the moment of sending was reported in the Publish window while it
 * was still open.
 *
 * A failure stops being listed when the agent dismisses it, when the same
 * video is later sent to the same platform (a retry, however it turned out),
 * or after two weeks.
 */
const DAYS = 14;

interface FailedRow {
  id: string;
  platform: string;
  video_id: string | null;
  video_title: string | null;
  error_message: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("social_posts")
    .select("id, platform, video_id, video_title, error_message, created_at")
    .eq("user_id", user.id)
    .eq("post_status", "failed")
    .neq("platform", "youtube")
    .not("upload_request_id", "is", null)
    .is("acknowledged_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  let failed = (data ?? []) as FailedRow[];

  // Drop any that were tried again since. A photo post has no video to match
  // on, so it stays until it is dismissed.
  const videoIds = Array.from(new Set(failed.map((f) => f.video_id).filter((v): v is string => !!v)));
  if (videoIds.length > 0) {
    const { data: later } = await admin
      .from("social_posts")
      .select("video_id, platform, created_at")
      .eq("user_id", user.id)
      .in("video_id", videoIds)
      .gte("created_at", since);
    const attempts = (later ?? []) as { video_id: string; platform: string; created_at: string }[];
    failed = failed.filter((f) => !f.video_id || !attempts.some((a) =>
      a.video_id === f.video_id && a.platform === f.platform && a.created_at > f.created_at));
  }

  return NextResponse.json({
    posts: failed.map((f) => ({
      id: f.id,
      platform: partnerPlatform(f.platform)?.label ?? f.platform,
      title: f.video_title,
      reason: f.error_message,
      videoId: f.video_id,
    })),
  });
}

// POST { id } — the agent has seen it. { all: true } clears every one.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { id?: unknown; all?: unknown };
  const admin = createAdminClient();
  const base = admin
    .from("social_posts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("post_status", "failed")
    .is("acknowledged_at", null);

  if (body.all === true) await base;
  else if (typeof body.id === "string") await base.eq("id", body.id);
  else return NextResponse.json({ error: "Nothing to dismiss." }, { status: 400 });

  return NextResponse.json({ success: true });
}
