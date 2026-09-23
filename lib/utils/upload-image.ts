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
