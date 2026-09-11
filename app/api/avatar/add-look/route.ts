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
    // Crop to 16:9 before registering with HeyGen.
    //
    // HeyGen renders the avatar at the aspect ratio its photo was registered
    // with, whatever orientation the render requests, so a portrait source
    // produces pillarboxed output inside a landscape frame — and the agent's
    // repair for that is to zoom into the face, which crops the head.
    //
    // This comment said 16:9 while the line below resized to 1024x1024, so
    // every look added here was registered SQUARE and barred on both sides in
    // a landscape render. The file it wrote was even named square_. It now
    // does what it always claimed to.
    //
    // "attention" rather than a centre crop: reshaping a headshot throws away
    // most of one dimension, and the half worth keeping holds the face.
    let finalImageUrl = image_url;
    try {
      const imgResponse = await fetch(image_url);
      if (imgResponse.ok) {
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
        // @ts-ignore -- types unresolvable, runtime import is fine
        const sharp = (await import("sharp")).default;
        const croppedBuffer = await sharp(imgBuffer)
          .resize({ width: 1920, height: 1080, fit: "cover", position: "attention" })
          .jpeg({ quality: 92 })
          .toBuffer();

        const filePath = `${user.id}/looks/wide_${Date.now()}.jpg`;
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
