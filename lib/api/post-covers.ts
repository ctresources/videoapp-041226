import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tallFromWide } from "@/lib/utils/thumbnail-render";

/**
 * The cover picture a video carries to the other platforms.
 *
 * The thumbnail built in the Publish window only ever went to YouTube.
 * Everywhere else the video went up with whatever frame the platform picked,
 * after the agent had chosen the words and the photo.
 *
 * A wide video takes the thumbnail as it is. A vertical one takes the tall
 * version drawn alongside it; a wide picture on a 9:16 video is cropped to a
 * strip or boxed. For a thumbnail made before the tall version existed, one is
 * made here from the wide picture, centred over a blurred copy of itself.
 *
 * Always a JPEG at an address of ours: Instagram takes nothing else as a
 * cover, and the stored thumbnail is a PNG.
 *
 * Returns the fields to add to the hand-off, or nothing. A missing cover is
 * never a reason for the post not to go out.
 */
export async function coversFor(opts: {
  admin: SupabaseClient;
  userId: string;
  vertical: boolean;
  /** The wide thumbnail stored on the project, if one was ever built. */
  thumbnailUrl?: string | null;
  /** The tall one drawn with it, when it was built recently enough to have one. */
  tallUrl?: string | null;
}): Promise<Record<string, string>> {
  const { admin, userId, vertical } = opts;
  const wide = opts.thumbnailUrl && /^https?:\/\//.test(opts.thumbnailUrl) ? opts.thumbnailUrl : null;
  const tall = opts.tallUrl && /^https?:\/\//.test(opts.tallUrl) ? opts.tallUrl : null;

  try {
    let url: string | null = null;

    if (vertical && tall) {
      url = tall;
    } else if (wide) {
      const res = await fetch(wide, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return {};
      const source = Buffer.from(await res.arrayBuffer());
      const sharp = (await import("sharp")).default;
      const jpeg = vertical
        ? await tallFromWide(source)
        : await sharp(source).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();

      // Named for the picture it was made from, so the same thumbnail is made
      // once and a rebuilt one gets a new file rather than a stale cover.
      const key = createHash("sha1").update(wide).digest("hex").slice(0, 20);
      const path = `thumbnails/${userId}/cover_${vertical ? "tall_" : ""}${key}.jpg`;
      const { error } = await admin.storage.from("assets").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
      if (error) return {};
      url = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
    }

    if (!url) return {};
    return {
      // Facebook (a Page video), LinkedIn and X read this one.
      thumbnail_url: url,
      // Instagram's name for the same thing.
      cover_url: url,
    };
  } catch (err) {
    console.error("[social] could not prepare a cover:", err instanceof Error ? err.message : err);
    return {};
  }
}
