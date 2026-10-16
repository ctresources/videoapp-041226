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
 * The whole photo, uncut, centred on a blurred copy of itself that fills the
 * shape (2026-10-16, the owner's ask).
 *
 * This used to be a cover crop: a head-and-shoulders photo cut down to 16:9
 * kept a band across the face and threw the rest away, so the presenter in
 * every widescreen video looked zoomed in and cut off. Now nothing of the
 * person is lost, and the blur fills the sides (or top and bottom) instead of
 * the bars the video maker would add for a photo of the wrong shape.
 */
export async function fitOnBlur(
  buf: Buffer,
  size: { width: number; height: number },
): Promise<Buffer> {
  // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
  const sharp = (await import("sharp")).default;
  // EXIF orientation first, so a phone photo is upright in both layers.
  const upright = await sharp(buf).rotate().toBuffer();
  const [backdrop, photo] = await Promise.all([
    sharp(upright)
      .resize({ ...size, fit: "cover" })
      .blur(40)
      .modulate({ brightness: 0.85 })
      .toBuffer(),
    sharp(upright).resize({ ...size, fit: "inside" }).toBuffer(),
  ]);
  return sharp(backdrop)
    .composite([{ input: photo, gravity: "center" }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Build a 16:9 and a 9:16 version of one headshot, stored and publicly
 * readable. Each is the whole photo on a blurred fill (fitOnBlur), not a crop.
 *
 * Returns null on any failure rather than throwing: these feed an optional
 * improvement, and the caller must be free to carry on registering the avatar
 * exactly as it did before. A missing crop costs a letterbox; a thrown error
 * would cost the avatar.
 *
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

    const admin = createAdminClient();
    const stamp = Date.now();

    const upload = async (size: { width: number; height: number }, label: string) => {
      const out = await fitOnBlur(buf, size);
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
