import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// POST - schedule a post for later
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, platforms, caption, scheduledAt } = await req.json();

  if (!videoId || !platforms?.length || !scheduledAt) {
    return NextResponse.json({ error: "videoId, platforms, and scheduledAt required" }, { status: 400 });
  }

  const scheduleDate = new Date(scheduledAt);
  if (scheduleDate <= new Date()) {
    return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create a scheduled_posts row for each platform
  const rows = platforms.map((platform: string) => ({
    user_id: user.id,
    video_id: videoId,
    platform,
    caption: caption || "",
    scheduled_at: scheduleDate.toISOString(),
    status: "scheduled",
  }));

  const { data, error } = await admin.from("scheduled_posts").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ scheduled: data });
}

// GET - list scheduled posts for user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("scheduled_posts")
    .select("*, generated_videos(video_type, projects(title))")
    .eq("user_id", user.id)
    .order("scheduled_at", { ascending: true });

  return NextResponse.json({ posts: data || [] });
}

// DELETE - cancel a scheduled post
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { postId } = await req.json();
  const admin = createAdminClient();

  await admin.from("scheduled_posts").delete().eq("id", postId).eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
