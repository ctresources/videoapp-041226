import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * One place every picture an agent chooses gets uploaded.
 *
 * It used to be six places, all uploading straight from the browser to
 * storage. That put the browser's own session in charge of the write, and when
 * a session is anything less than perfect the database refuses the row — which
 * is what a brand-new account met three times in a row: a logo, a headshot and
 * a banner photo, all refused, while every write the SERVER made for the same
 * account in the same minutes went through. The session that reaches this
 * route through cookies is the one already proven to work.
 *
 * It also closes two smaller faults the six copies shared. They built keys
 * like `logo.jpg?t=1790…`, putting a cache-buster INSIDE the object's name —
 * every upload here gets a timestamped name instead, which busts caches
 * because it is genuinely a new object. And they decided what was an image
 * from the browser's MIME type alone, so a perfectly good JPEG that arrived
 * typed as nothing at all was turned away; the extension is consulted too.
 */

export const maxDuration = 60;

/** Where each kind of picture belongs, and how big it may be. */
const KINDS = {
  logo:     { bucket: "assets",  prefix: "logo",         maxMb: 5 },
  headshot: { bucket: "avatars", prefix: "headshot",     maxMb: 10 },
  banner:   { bucket: "avatars", prefix: "banner-photo", maxMb: 10 },
  thumb:    { bucket: "avatars", prefix: "thumb-photo",  maxMb: 10 },
  thumbBg:  { bucket: "avatars", prefix: "thumb-bg",     maxMb: 10 },
  imageBg:  { bucket: "avatars", prefix: "image-bg",     maxMb: 10 },
} as const;

type Kind = keyof typeof KINDS;

/** What the renderers and the browser can both actually draw. */
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that upload." }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "") as Kind;
  const spec = KINDS[kind];
  if (!spec) return NextResponse.json({ error: "Unknown upload type." }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > spec.maxMb * 1024 * 1024) {
    return NextResponse.json({ error: `Image must be under ${spec.maxMb}MB.` }, { status: 413 });
  }

  /**
   * The type, from whichever of the two sources actually knows.
   *
   * Windows hands some files over with no type at all, and a photo from a
   * phone can arrive as application/octet-stream — both were rejected outright
   * before, with "Please upload an image file" over a perfectly good JPEG.
   */
  const declared = (file.type || "").split(";")[0].trim().toLowerCase();
  const fromName = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = EXT_BY_TYPE[declared] ?? (ALLOWED_EXT.has(fromName) ? fromName : "");

  if (!ext) {
    // Named rather than lumped in with "not an image": an iPhone HEIC is a
    // real photo, and the fix is a setting on the phone, not a different file.
    if (fromName === "heic" || fromName === "heif" || declared.includes("heic")) {
      return NextResponse.json(
        { error: "iPhone HEIC photos can't be used. On your phone: Settings → Camera → Formats → Most Compatible, then take or re-save the photo." },
        { status: 415 },
      );
    }
    return NextResponse.json(
      { error: "That doesn't look like an image. Use a JPG, PNG or WEBP." },
      { status: 415 },
    );
  }

  // A fresh name every time, which is what the old `?t=` was reaching for —
  // except that one went into the object's NAME, leaving files called
  // "logo.jpg?t=1790…" and public URLs with the ? escaped into the path.
  const path = `${user.id}/${spec.prefix}-${Date.now()}.${ext}`;
  const contentType = EXT_BY_TYPE[declared] ? declared : `image/${ext === "jpg" ? "jpeg" : ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(spec.bucket)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType, upsert: true });

  if (error) {
    console.error(`[uploads] ${kind} failed for ${user.id}:`, error.message);
    return NextResponse.json({ error: "The upload didn't go through. Try again." }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from(spec.bucket).getPublicUrl(path);
  return NextResponse.json({ url: publicUrl });
}
