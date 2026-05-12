import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addAvatarLook } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * POST /api/avatar/add-look
 * Adds a new look to the user's existing avatar group.
 * Body: { image_url: string, name: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: "HeyGen not configured" }, { status: 503 });
  }

  const { image_url, name } = (await req.json()) as { image_url: string; name: string };
  if (!image_url || !name?.trim()) {
    return NextResponse.json({ error: "image_url and name required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_photo_id")
    .eq("id", user.id)
    .single();

  if (!profile?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Upload your main avatar photo in Settings first." },
      { status: 400 },
    );
  }

  try {
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
    const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    const look = await addAvatarLook(
      profile.heygen_photo_id,
      imageBuffer,
      contentType,
      name.trim(),
    );

    return NextResponse.json({ look });
  } catch (err) {
    console.error("[add-look] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create look" },
      { status: 422 },
    );
  }
}
