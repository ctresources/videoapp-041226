import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listScheduledPosts, cancelScheduledPost } from "@/lib/api/blotato";
import { NextRequest, NextResponse } from "next/server";

// GET - list scheduled posts from Blotato
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("blotato_api_key")
    .eq("id", user.id)
    .single();

  /**
   * Scheduled YouTube uploads, from our own table.
   *
   * This endpoint used to read Blotato and nothing else, and returned an
   * empty list without an API key — which is every user, since YouTube is
   * the only platform anyone can connect. So the Content Calendar was
   * permanently blank while telling people to schedule a video to fill it.
   *
   * A scheduled upload now records post_status "scheduled" with the time
   * YouTube will publish it, so there is finally something true to show.
   */
  const { data: rows } = await admin
    .from("social_posts")
    .select("id, platform, scheduled_at, post_status, caption, platform_post_id, video_id")
    .eq("user_id", user.id)
    .eq("post_status", "scheduled")
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  const ownPosts = (rows ?? []).map((r) => {
    const row = r as {
      id: string; platform: string; scheduled_at: string; post_status: string;
      caption: string | null; platform_post_id: string | null;
    };
    return {
      id: row.id,
      platform: row.platform,
      scheduledAt: row.scheduled_at,
      status: row.post_status,
      caption: row.caption ?? undefined,
      videoUrl: row.platform_post_id ? `https://youtu.be/${row.platform_post_id}` : undefined,
    };
  });

  const apiKey = (profile as { blotato_api_key: string | null } | null)?.blotato_api_key;
  if (!apiKey) return NextResponse.json({ posts: ownPosts });

  try {
    const posts = await listScheduledPosts(apiKey);
    return NextResponse.json({ posts: [...ownPosts, ...(Array.isArray(posts) ? posts : [])] });
  } catch {
    return NextResponse.json({ posts: ownPosts });
  }
}

// DELETE - cancel a scheduled post via Blotato
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const scheduleId = body.scheduleId ?? body.postId;
  if (!scheduleId) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("blotato_api_key")
    .eq("id", user.id)
    .single();

  const apiKey = (profile as { blotato_api_key: string | null } | null)?.blotato_api_key;
  if (!apiKey) return NextResponse.json({ error: "Blotato not connected" }, { status: 400 });

  await cancelScheduledPost(apiKey, scheduleId);
  return NextResponse.json({ success: true });
}
