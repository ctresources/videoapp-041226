/**
 * Send a picture to the server, which stores it.
 *
 * The browser used to upload to storage itself, six times over. Doing it here
 * means the write happens with the session the server already trusts, and that
 * every size limit, format check and naming rule is decided in one place
 * rather than six — see app/api/uploads/image/route.ts for why that mattered.
 *
 * Throws with the server's own sentence, which is written to be shown to the
 * agent as-is.
 */
export type ImageUploadKind =
  | "logo"
  | "headshot"
  | "banner"
  | "thumb"
  | "thumbBg"
  | "imageBg"
  | "look";

/**
 * What each upload is cropped to fill, said next to the button.
 *
 * Every picture here is centre-cropped to fill its frame and never stretched,
 * so a photo smaller than these is upscaled and goes soft — and one of the
 * wrong shape loses its edges. Nobody can guess either of those from an Upload
 * button, and the sizes were only ever written down in the renderers.
 *
 * Bigger is always fine: it is scaled down. The image generator is absent
 * because its target changes with the shape chosen on screen.
 */
export const UPLOAD_TARGET: Record<Exclude<ImageUploadKind, "imageBg">, string> = {
  logo: "Any size · PNG with a transparent background",
  headshot: "480 × 640 or larger · head and shoulders, plain background",
  banner: "800 × 700 or larger",
  thumb: "480 × 640 or larger · head and shoulders, plain background",
  thumbBg: "1280 × 720 or larger · landscape",
  look: "480 × 640 or larger · head and shoulders",
};

/**
 * Vercel refuses a request over 4.5 MB before the route ever runs, with a
 * page that isn't JSON, so an 8.8 MB phone photo came back as a bare "try
 * again" although the route itself allows 10 MB (2026-10-21, the owner's
 * YouTube thumbnail). Anything over this is shrunk in the browser first.
 */
const SHRINK_OVER_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE = 3000;

/**
 * A big photo as a JPEG at most 3000 px on its long side, which is more than
 * any picture here is drawn at. Logos keep their transparency, so they are
 * left alone; so is anything the browser can't decode (it is sent as it is,
 * and the server's own message explains a refusal).
 */
async function shrinkIfLarge(file: File, kind: ImageUploadKind): Promise<File> {
  if (file.size <= SHRINK_OVER_BYTES || kind === "logo" || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    for (const quality of [0.88, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= SHRINK_OVER_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
  } catch { /* not decodable here: send the original */ }
  return file;
}

export async function uploadImage(file: File, kind: ImageUploadKind): Promise<string> {
  file = await shrinkIfLarge(file, kind);
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);

  const res = await fetch("/api/uploads/image", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) {
    if (res.status === 413) throw new Error("That photo is too large to upload. Try one under 4 MB.");
    throw new Error(body?.error || "The upload didn't go through. Try again.");
  }
  return body.url as string;
}
