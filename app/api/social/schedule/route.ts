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

  const apiKey = (profile as { blotato_api_key: string | null } | null)?.blotato_api_key;
  if (!apiKey) return NextResponse.json({ posts: [] });

  try {
    const posts = await listScheduledPosts(apiKey);
    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}

// DELETE - cancel a scheduled post via Blotato
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scheduleId } = await req.json();
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
