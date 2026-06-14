import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_STORAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

function parseStoragePath(url: string): { bucket: string; path: string } | null {
  if (!url || !url.startsWith(SUPABASE_STORAGE_PREFIX)) return null;
  const rest = url.slice(SUPABASE_STORAGE_PREFIX.length);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;
  return { bucket: rest.slice(0, slashIdx), path: rest.slice(slashIdx + 1) };
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = await req.json();
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: video } = await admin
    .from("generated_videos")
    .select("id, user_id, video_url")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // Delete from Supabase Storage if the file lives there
  if (video.video_url) {
    const parsed = parseStoragePath(video.video_url);
    if (parsed) {
      await admin.storage.from(parsed.bucket).remove([parsed.path]);
    }
  }

  const { error } = await admin
    .from("generated_videos")
    .delete()
    .eq("id", videoId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
