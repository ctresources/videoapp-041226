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
  | "imageBg";

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
};

export async function uploadImage(file: File, kind: ImageUploadKind): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);

  const res = await fetch("/api/uploads/image", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) {
    throw new Error(body?.error || "The upload didn't go through. Try again.");
  }
  return body.url as string;
}
