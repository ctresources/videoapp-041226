import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeImageBackground } from "@/lib/utils/remove-background";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * POST /api/avatar/remove-background — { imageUrl }
 * Cuts the person out of an uploaded look photo and flattens the result onto
 * clean white (HeyGen expects a real photo, not transparency). Returns the
 * stored URL of the processed image.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageUrl } = await req.json().catch(() => ({})) as { imageUrl?: string };
  if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("Could not fetch the uploaded photo");
    const original = Buffer.from(await imgRes.arrayBuffer());

    const cutout = await removeImageBackground(original);
    if (!cutout) {
      return NextResponse.json(
        { error: "Background removal is not available right now — the photo was kept as uploaded." },
        { status: 503 },
      );
    }

    // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
    const sharp = (await import("sharp")).default;
    const processed = await sharp(cutout)
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();

    const admin = createAdminClient();
    const path = `${user.id}/looks/nobg_${Date.now()}.png`;
    const { error: upErr } = await admin.storage
      .from("avatars")
      .upload(path, processed, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: { publicUrl } } = admin.storage.from("avatars").getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("[avatar/remove-background] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Background removal failed" },
      { status: 500 },
    );
  }
}
