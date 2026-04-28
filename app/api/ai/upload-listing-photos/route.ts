import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_PHOTOS = 12;
const MAX_BYTES_PER_PHOTO = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_PREFIX = "image/";

/**
 * Upload listing photos to the public assets bucket.
 * Returns an array of public URLs in the same order as files were uploaded.
 *
 * These URLs are stored in `listing.photoUrls` and used as scene backgrounds
 * (b-roll) in the listing video generation flow.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("photos") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Too many photos. Max ${MAX_PHOTOS} per upload.` },
      { status: 400 },
    );
  }

  // Validate files first before any uploads happen
  for (const file of files) {
    if (!file.type.startsWith(ACCEPTED_PREFIX)) {
      return NextResponse.json(
        { error: `${file.name || "File"} is not an image.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES_PER_PHOTO) {
      return NextResponse.json(
        { error: `${file.name || "File"} is too large. Max 15 MB per photo.` },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();
  const uploadedPaths: string[] = [];
  const photoUrls: string[] = [];

  try {
    for (const file of files) {
      const extFromType = file.type.split("/")[1] || "jpg";
      const ext = extFromType.includes("jpeg") ? "jpg" : extFromType;
      const path = `listing-photos/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await admin.storage
        .from("assets")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
      uploadedPaths.push(path);

      const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);
      photoUrls.push(publicUrl);
    }

    return NextResponse.json({ photoUrls });
  } catch (err) {
    // Best-effort cleanup of partial uploads
    if (uploadedPaths.length > 0) {
      await admin.storage.from("assets").remove(uploadedPaths).catch(() => {});
    }
    const msg = err instanceof Error ? err.message : "Photo upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
