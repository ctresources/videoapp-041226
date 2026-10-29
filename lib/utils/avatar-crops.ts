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
 * The whole photo, uncut, filling the shape (2026-10-16, the owner's ask).
 *
 * This used to be a cover crop: a head-and-shoulders photo cut down to 16:9
 * kept a band across the face and threw the rest away, so the presenter in
 * every widescreen video looked zoomed in and cut off. Now nothing of the
 * person is lost, and the space beside it is filled instead of the bars the
 * video maker would add for a photo of the wrong shape.
 *
 * How it is filled (2026-10-18, the owner's pick):
 *  - A photo with a PLAIN backdrop (a studio headshot) gets that backdrop's
 *    own colour, with the photo's edges blended in, so it reads as one wide
 *    studio backdrop. A blur of such a photo picked up the hair and looked
 *    muddy. On a vertical canvas the photo sits at the bottom and the colour
 *    is headroom above it, as a portrait would be framed.
 *  - A BUSY background (an office, outdoors) keeps a blurred copy of the
 *    photo, since a flat colour beside a detailed scene looks pasted on.
 */
export async function fitOnBlur(
  buf: Buffer,
  size: { width: number; height: number },
): Promise<Buffer> {
  // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
  const sharp = (await import("sharp")).default;
  // EXIF orientation first, so a phone photo is upright in every layer.
  const upright = await sharp(buf).rotate().removeAlpha().toBuffer();
  const photo = await sharp(upright).resize({ ...size, fit: "inside" }).toBuffer();
  const meta = await sharp(photo).metadata();
  const pw = meta.width ?? size.width;
  const ph = meta.height ?? size.height;
  if (pw >= size.width && ph >= size.height) {
    return sharp(photo).jpeg({ quality: 92 }).toBuffer();
  }
  const sidesFill = pw < size.width;

  const color = await plainBackdrop(sharp, photo, pw, ph, sidesFill);
  if (color) {
    // Blend the photo's edges into the colour so no hard line shows where
    // the shoulders meet the edge of the original picture.
    const f = sidesFill ? Math.max(8, Math.round(pw * 0.08)) : Math.max(8, Math.round(ph * 0.06));
    const mask = sidesFill
      ? `<svg width="${pw}" height="${ph}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${f / pw}" stop-color="#fff" stop-opacity="1"/>
          <stop offset="${1 - f / pw}" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient></defs><rect width="${pw}" height="${ph}" fill="url(#g)"/></svg>`
      : `<svg width="${pw}" height="${ph}"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${f / ph}" stop-color="#fff" stop-opacity="1"/>
          <stop offset="1" stop-color="#fff" stop-opacity="1"/>
        </linearGradient></defs><rect width="${pw}" height="${ph}" fill="url(#g)"/></svg>`;
    const blended = await sharp(photo).ensureAlpha().composite([{ input: Buffer.from(mask), blend: "dest-in" }]).png().toBuffer();
    return sharp({ create: { width: size.width, height: size.height, channels: 3, background: color } })
      .composite([{ input: blended, gravity: sidesFill ? "center" : "south" }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  const backdrop = await sharp(upright)
    .resize({ ...size, fit: "cover" })
    .blur(40)
    .modulate({ brightness: 0.85 })
    .toBuffer();
  return sharp(backdrop)
    .composite([{ input: photo, gravity: "center" }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * The backdrop's colour when the photo has a plain one, else null.
 *
 * Read from the edges the fill will sit against, above the shoulders: the
 * upper part of the left and right edges for a wide canvas, the top edge for
 * a tall one. Plain means little variation inside each strip and, for the
 * sides, the two strips agreeing with each other.
 */
async function plainBackdrop(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharp: any, photo: Buffer, pw: number, ph: number, sidesFill: boolean,
): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const strip = Math.max(4, Math.round((sidesFill ? pw : ph) * 0.03));
    const regions = sidesFill
      ? [
          { left: 0, top: 0, width: strip, height: Math.max(4, Math.round(ph * 0.35)) },
          { left: pw - strip, top: 0, width: strip, height: Math.max(4, Math.round(ph * 0.35)) },
        ]
      : [{ left: 0, top: 0, width: pw, height: strip }];
    const means: number[][] = [];
    for (const region of regions) {
      // Read from the strip's own pixels: sharp's stats() describes the whole
      // input, whatever is extracted before it.
      const { data, info } = await sharp(photo).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const n = info.width * info.height;
      const ch = [0, 1, 2].map((c) => {
        let sum = 0, sq = 0;
        for (let i = c; i < data.length; i += info.channels) { sum += data[i]; sq += data[i] * data[i]; }
        const mean = sum / n;
        return { mean, stdev: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
      });
      if (ch.some((c) => c.stdev > 12)) return null;
      means.push(ch.map((c) => c.mean));
    }
    if (means.length === 2 && means[0].some((m, i) => Math.abs(m - means[1][i]) > 14)) return null;
    const avg = [0, 1, 2].map((i) => Math.round(means.reduce((s, m) => s + m[i], 0) / means.length));
    return { r: avg[0], g: avg[1], b: avg[2] };
  } catch {
    return null;
  }
}

/**
 * Build a 16:9 and a 9:16 version of one headshot, stored and publicly
 * readable. Each is the whole photo, filled to shape (fitOnBlur), not a crop.
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
  /**
   * The agent's own horizontal / vertical photo (2026-10-29), used for that
   * shape instead of filling the other photo out to it. Either may be absent.
   */
  sources?: { wide?: string | null; tall?: string | null },
): Promise<{ wide: string | null; tall: string | null }> {
  const none = { wide: null, tall: null };
  try {
    const wideSrc = sources?.wide || sourceUrl;
    const tallSrc = sources?.tall || sourceUrl;
    const crops = wideSrc === tallSrc
      ? await makeFormatCrops(wideSrc, userId)
      : await Promise.all([makeFormatCrops(wideSrc, userId), makeFormatCrops(tallSrc, userId)])
          .then(([w, t]) => (w && t ? { wideUrl: w.wideUrl, tallUrl: t.tallUrl } : null));
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
