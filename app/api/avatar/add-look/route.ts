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
    // Crop image to 16:9 (1280×720) before registering with HeyGen.
    // HeyGen's Video Agent renders the avatar in the photo's registered aspect
    // ratio — portrait photos produce pillarboxed portrait output even when
    // orientation:"landscape" is requested. A landscape crop fixes this.
    let finalImageUrl = image_url;
    try {
      const imgResponse = await fetch(image_url);
      if (imgResponse.ok) {
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
        // @ts-ignore -- types unresolvable, runtime import is fine
        const sharp = (await import("sharp")).default;
        const croppedBuffer = await sharp(imgBuffer)
          .resize({ width: 1024, height: 1024, fit: "cover", position: "attention" })
          .jpeg({ quality: 92 })
          .toBuffer();

        const filePath = `${user.id}/looks/landscape_${Date.now()}.jpg`;
        const { error: uploadErr } = await admin.storage
          .from("avatars")
          .upload(filePath, croppedBuffer, { contentType: "image/jpeg", upsert: false });

        if (!uploadErr) {
          const { data: { publicUrl } } = admin.storage
            .from("avatars")
            .getPublicUrl(filePath);
          finalImageUrl = publicUrl;
        }
      }
    } catch (cropErr) {
      console.warn("[add-look] Image crop failed, using original:", cropErr);
    }

    const look = await addAvatarLook(
      profile.heygen_photo_id,
      finalImageUrl,
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
