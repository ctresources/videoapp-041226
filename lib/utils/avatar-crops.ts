import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The two shapes a video can be. HeyGen renders the presenter at the aspect
 * ratio its photo was registered with — not the one the render asks for — so a
 * single look cannot serve both. A portrait look in a landscape frame is
 * pillarboxed; a landscape look in a reel is letterboxed; and in both cases the
 * agent's instinct is to fill the gap by zooming into the face, which crops the
 * head. Registering one look per shape removes the problem at its source
 * instead of arguing with it in the prompt.
 */
const WIDE = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };

const BUCKET = "avatars";

/**
 * Build a 16:9 and a 9:16 crop of one headshot, stored and publicly readable.
 *
 * Returns null on any failure rather than throwing: these feed an optional
 * improvement, and the caller must be free to carry on registering the avatar
 * exactly as it did before. A missing crop costs a letterbox; a thrown error
 * would cost the avatar.
 *
 * `position: "attention"` on both: cropping a head-and-shoulders photo to
 * either extreme throws away most of one dimension, and the part worth keeping
 * is the part with the face in it. A centre crop of a tall photo can behead it.
 */
export async function makeFormatCrops(
  sourceUrl: string,
  userId: string,
): Promise<{ wideUrl: string; tallUrl: string } | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.warn(`[avatar-crops] source fetch failed (${res.status})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
    const sharp = (await import("sharp")).default;
    const admin = createAdminClient();
    const stamp = Date.now();

    const upload = async (size: { width: number; height: number }, label: string) => {
      const out = await sharp(buf)
        .resize({ ...size, fit: "cover", position: "attention" })
        .jpeg({ quality: 92 })
        .toBuffer();
      const path = `${userId}/looks/${label}_${stamp}.jpg`;
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, out, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
      return publicUrl;
    };

    const [wideUrl, tallUrl] = await Promise.all([
      upload(WIDE, "wide"),
      upload(TALL, "tall"),
    ]);

    console.log(`[avatar-crops] built 16:9 + 9:16 crops for ${userId}`);
    return { wideUrl, tallUrl };
  } catch (err) {
    console.warn("[avatar-crops] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Register both format crops as looks on a photo-avatar group and record their
 * ids on the profile.
 *
 * Lives here rather than in the upload route because two callers need it: the
 * headshot upload, and the lazy backfill for everyone who registered an avatar
 * before this existed. Two copies of it would drift.
 *
 * Never throws. Every failure leaves the profile exactly as it was, which is
 * the state the render path already knows how to handle.
 */
export async function registerFormatLooks(
  userId: string,
  groupId: string,
  sourceUrl: string,
): Promise<{ wide: string | null; tall: string | null }> {
  const none = { wide: null, tall: null };
  try {
    const crops = await makeFormatCrops(sourceUrl, userId);
    if (!crops) return none;

    // Imported here, not at the top: this module is pulled into routes that
    // have no business loading the HeyGen client just to crop an image.
    const { addAvatarLook } = await import("@/lib/api/heygen");

    const [wide, tall] = await Promise.all([
      addAvatarLook(groupId, crops.wideUrl, "Wide (16:9)"),
      addAvatarLook(groupId, crops.tallUrl, "Vertical (9:16)"),
    ]);

    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ heygen_look_wide: wide.id, heygen_look_tall: tall.id })
      .eq("id", userId);

    console.log(`[avatar-crops] registered looks wide=${wide.id} tall=${tall.id} for ${userId}`);
    return { wide: wide.id, tall: tall.id };
  } catch (err) {
    console.warn("[avatar-crops] look registration failed:", err instanceof Error ? err.message : err);
    return none;
  }
}
