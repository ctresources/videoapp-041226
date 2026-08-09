import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Copies scraped photos into our own storage so they can be composited.
 *
 * Photos pulled off a listing page are absolute URLs on someone else's domain.
 * Drawing those into the recording canvas is not possible: with
 * crossOrigin="anonymous" they fail to load outright, and without it they taint
 * the canvas — and a tainted canvas cannot be read by MediaRecorder, which
 * would kill the whole recording rather than just the b-roll. Fetching them
 * server-side sidesteps CORS entirely and hands back URLs that are safe to draw.
 *
 * Anything that cannot be copied comes back as its original URL. Callers treat
 * these as best-effort: the b-roll loader skips whatever fails to load.
 */

const MAX_PHOTOS = 12;
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let urls: unknown;
  try {
    ({ urls } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(urls)) {
    return NextResponse.json({ error: "urls must be an array" }, { status: 400 });
  }

  const input = urls.filter((u): u is string => typeof u === "string").slice(0, MAX_PHOTOS);
  const ownStorage = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const admin = createAdminClient();

  const copied = await Promise.all(
    input.map(async (original) => {
      // Already ours — nothing to copy, and re-uploading would orphan a blob.
      if (ownStorage && original.startsWith(ownStorage)) return original;

      try {
        const res = await fetch(original, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          // Some CDNs refuse requests without a referer from their own page.
          headers: { referer: new URL(original).origin },
        });
        if (!res.ok) return original;

        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const ext = EXT_BY_TYPE[type];
        if (!ext) return original; // Not an image we want to draw.

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return original;

        const path = `${user.id}/broll/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await admin.storage
          .from("assets")
          .upload(path, buffer, { contentType: type, upsert: false });
        if (error) return original;

        const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);
        return publicUrl;
      } catch {
        return original;
      }
    }),
  );

  return NextResponse.json({ urls: copied });
}
