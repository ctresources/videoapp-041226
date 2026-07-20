import { createClient } from "@/lib/supabase/client";

export interface UploadedPhoto {
  url: string;
  name: string;
}

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/**
 * Upload a listing/video photo straight to Supabase Storage from the browser.
 *
 * Previously photos went through /api/ai/upload-photo, but Vercel caps
 * serverless request bodies at ~4.5MB, so typical phone photos failed with a
 * generic "upload failed". Uploading directly (like the music and avatar
 * uploads already do) bypasses that limit.
 *
 * The assets bucket's RLS INSERT policy requires the first path segment to be
 * the user's id, so the path is always `${user.id}/video-photos/...`.
 */
export async function uploadVideoPhoto(file: File): Promise<UploadedPhoto> {
  if (!file.type.startsWith("image/") && !ALLOWED_EXT.test(file.name)) {
    throw new Error("Only image files are supported (JPEG, PNG, WebP, GIF, HEIC).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is over 20MB — please use a smaller image.`);
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${user.id}/video-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
  return { url: publicUrl, name: file.name };
}
