/**
 * Crop photos to the video's aspect ratio before handing them to HeyGen.
 *
 * Two render paths use photos very differently. On the Direct Video path we
 * composite them ourselves, and composite-photos.ts already fills the frame
 * (scale with force_original_aspect_ratio=increase, then a centred crop). On
 * the Video Agent path the photos go to HeyGen as `files` and HeyGen decides
 * the framing — so a square photo in a 16:9 video comes back with bars down
 * the sides. Our correct cropping logic simply never runs on that path.
 *
 * This pre-crops so HeyGen receives a photo that already matches the frame.
 * The crop is centred to match what the ffmpeg path does, so a photo looks the
 * same whichever path renders it.
 *
 * Never upscales: phone photos arrive downscaled to 1600px by the browser
 * uploader, and stretching one to 1920 to "match" the render would just blur
 * it. We crop to the target ASPECT at whatever resolution the photo already
 * has and let HeyGen scale.
 *
 * Failure is always non-fatal — any photo that cannot be fetched or cropped
 * falls back to its original URL, because a badly framed photo beats a missing
 * one.
 */
import sharp from "sharp";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "assets";

/** Below this difference the source already matches the frame; leave it alone. */
const ASPECT_TOLERANCE = 0.02;

/**
 * Largest rectangle of `targetAspect` that fits inside a `srcW`x`srcH` source,
 * so cropping only ever removes pixels. Exported for testing — this geometry is
 * the whole fix, and getting it inverted would silently letterbox every photo.
 */
export function cropBox(
  srcW: number,
  srcH: number,
  targetAspect: number,
): { width: number; height: number } {
  const srcAspect = srcW / srcH;
  return srcAspect > targetAspect
    // Source is wider than the frame → full height, trim the sides.
    ? { width: Math.round(srcH * targetAspect), height: srcH }
    // Source is taller → full width, trim top and bottom.
    : { width: srcW, height: Math.round(srcW / targetAspect) };
}

/**
 * Crop each photo to `width`/`height`'s aspect ratio, returning URLs in the
 * same order. Results are cached at a deterministic path keyed by source URL
 * and aspect, so re-rendering the same project does not redo the work.
 */
export async function cropPhotosToAspect(
  photoUrls: string[],
  width: number,
  height: number,
  userId: string,
): Promise<string[]> {
  if (photoUrls.length === 0) return [];

  const admin = createAdminClient();
  const targetAspect = width / height;

  return Promise.all(
    photoUrls.map(async (src) => {
      try {
        // Deterministic destination: identical source + aspect reuses the crop.
        const key = createHash("sha1").update(`${src}|${targetAspect.toFixed(4)}`).digest("hex").slice(0, 16);
        const path = `${userId}/video-photos/crop/${key}.jpg`;
        const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);

        // Already cropped on a previous render?
        const cached = await fetch(publicUrl, { method: "HEAD" });
        if (cached.ok) return publicUrl;

        const res = await fetch(src);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const input = Buffer.from(await res.arrayBuffer());

        const meta = await sharp(input).metadata();
        if (!meta.width || !meta.height) throw new Error("no dimensions");

        const srcAspect = meta.width / meta.height;
        // Close enough already — skip the round trip and keep the original.
        if (Math.abs(srcAspect - targetAspect) / targetAspect < ASPECT_TOLERANCE) return src;

        const { width: cropW, height: cropH } = cropBox(meta.width, meta.height, targetAspect);

        const output = await sharp(input)
          .resize(cropW, cropH, { fit: "cover", position: "centre" })
          .jpeg({ quality: 85 })
          .toBuffer();

        const { error } = await admin.storage
          .from(BUCKET)
          .upload(path, output, { contentType: "image/jpeg", upsert: true });
        if (error) throw error;

        console.log(
          `[crop-photos] ${meta.width}x${meta.height} → ${cropW}x${cropH} ` +
          `(target ${targetAspect.toFixed(2)}:1)`,
        );
        return publicUrl;
      } catch (err) {
        console.warn(
          `[crop-photos] Keeping original, crop failed:`,
          err instanceof Error ? err.message : err,
        );
        return src;
      }
    }),
  );
}
