/**
 * POST /api/profile/heygen-avatar
 *
 * Creates a HeyGen photo avatar (POST /v3/avatars) from the user's headshot
 * URL and saves the resulting group_id to the user's profile.
 *
 * The user never interacts with HeyGen — this happens behind the scenes
 * when they upload their photo in Settings.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadTalkingPhoto } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json(
      { error: "HeyGen API key not configured. Add HEYGEN_API_KEY to .env.local." },
      { status: 503 },
    );
  }

  const { image_url } = (await req.json()) as { image_url: string };
  if (!image_url) return NextResponse.json({ error: "image_url required" }, { status: 400 });

  try {
    // Create the photo avatar from the Supabase public URL → talking_photo_id
    const photoId = await uploadTalkingPhoto(image_url);

    // Save to profile
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ heygen_photo_id: photoId })
      .eq("id", user.id);

    console.log(`[heygen-avatar] Registered talking photo for user ${user.id}: ${photoId}`);

    return NextResponse.json({ photo_id: photoId });
  } catch (err) {
    console.error("[heygen-avatar] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Avatar creation failed" },
      { status: 422 },
    );
  }
}
