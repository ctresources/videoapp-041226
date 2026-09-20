/**
 * Copy images into our own storage.
 *
 * Lifted out of /api/photos/rehost when the email import needed the same thing
 * from a webhook, which has no session to authenticate and so cannot call an API
 * route that requires one. The route now calls this; the reasoning for why the
 * copy is necessary at all lives there.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Upload one already-fetched image. Returns its public URL, or null. */
export async function storeImageBuffer(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type];
  if (!ext) return null;
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

  const admin = createAdminClient();
  const path = `${userId}/broll/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await admin.storage
    .from("assets")
    .upload(path, buffer, { contentType: type, upsert: false });
  if (error) return null;

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);
  return publicUrl;
}

/**
 * Copy remote images into storage, in order. Anything that cannot be copied
 * comes back as its original URL — callers treat these as best-effort.
 */
export async function rehostImageUrls(userId: string, urls: string[]): Promise<string[]> {
  const ownStorage = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return Promise.all(
    urls.map(async (original) => {
      // Already ours — nothing to copy, and re-uploading would orphan a blob.
      if (ownStorage && original.startsWith(ownStorage)) return original;

      try {
        const res = await fetch(original, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          // Some CDNs refuse requests without a referer from their own page.
          headers: { referer: new URL(original).origin },
        });
        if (!res.ok) return original;

        const stored = await storeImageBuffer(
          userId,
          Buffer.from(await res.arrayBuffer()),
          res.headers.get("content-type") ?? "",
        );
        return stored ?? original;
      } catch {
        return original;
      }
    }),
  );
}

/**
 * Same, but for images the sender embedded in the message body as `data:` URIs
 * rather than linking. Nothing is fetched — the bytes are already here.
 */
export async function storeDataUriImages(userId: string, dataUris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uri of dataUris) {
    // [\s\S] rather than the dot-all flag, which this project's TS target
    // predates — a base64 payload can contain newlines.
    const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(uri);
    if (!match) continue;
    const [, type, base64, payload] = match;
    try {
      const buffer = base64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
      const stored = await storeImageBuffer(userId, buffer, type);
      if (stored) out.push(stored);
    } catch {
      // Malformed data URI — skip it.
    }
  }
  return out;
}
