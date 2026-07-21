import { createClient } from "@/lib/supabase/client";

export interface UploadedPhoto {
  url: string;
  name: string;
}

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DIM = 1600; // longest edge after downscale — plenty for b-roll

/**
 * Re-encode an image to a downscaled JPEG in the browser (via canvas).
 *
 * Why: phone photos are often HEIC, which uploads fine but can't render as an
 * <img> thumbnail (so it looks like nothing happened) and HeyGen can't use it
 * as b-roll. Re-encoding guarantees a browser-renderable, HeyGen-compatible
 * JPEG, and shrinks large photos so uploads are fast. If the browser can't
 * decode the source (e.g. HEIC in Chrome), we throw a clear, specific error
 * instead of silently uploading an unusable file.
 */
async function toDownscaledJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () =>
        reject(new Error(`Couldn't read "${file.name}". If it's a HEIC/HEIF photo, switch it to JPEG or PNG and try again.`));
      im.src = url;
    });

    let { width, height } = img;
    if (Math.max(width, height) > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser blocked image processing — try a different browser.");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) throw new Error("Image conversion failed — please try a different photo.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Upload a listing/video photo straight to Supabase Storage from the browser.
 *
 * Direct upload (not via a Vercel function) so it bypasses Vercel's ~4.5MB
 * request-body limit — the same approach as the music and avatar uploads.
 *
 * The assets bucket's RLS INSERT policy requires the first path segment to be
 * the user's id, so the path is always `${user.id}/video-photos/...`.
 */
export async function uploadVideoPhoto(file: File): Promise<UploadedPhoto> {
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is over 25MB — please use a smaller image.`);
  }

  // Re-encode to a small JPEG (renderable + HeyGen-compatible + fast to upload).
  const jpeg = await toDownscaledJpeg(file);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  const path = `${user.id}/video-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
  return { url: publicUrl, name: file.name };
}
