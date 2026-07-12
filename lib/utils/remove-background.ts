/**
 * Shared remove.bg client. Cuts the subject out of a photo, returning a
 * transparent PNG buffer — or null when REMOVEBG_API_KEY isn't configured or
 * the call fails, so callers can fall back to the original photo. Free
 * remove.bg accounts include 50 preview-quality images/month.
 */
export async function removeImageBackground(photoBuffer: Buffer): Promise<Buffer | null> {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) {
    // Diagnostic: surface near-miss names (stray whitespace or invisible
    // characters from copy-paste look identical in the Vercel dashboard).
    const similar = Object.keys(process.env).filter(
      (k) => k.toUpperCase().includes("REMOVE") || k.toUpperCase().includes("BG"),
    );
    console.log(
      `[remove-background] REMOVEBG_API_KEY not set — photo used as-is. Similar env names present: ${JSON.stringify(similar)}`,
    );
    return null;
  }
  try {
    const form = new FormData();
    form.append("image_file", new Blob([new Uint8Array(photoBuffer)]), "photo.png");
    form.append("size", "auto");
    form.append("format", "png");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    });
    if (!res.ok) {
      console.warn(`[remove-background] remove.bg failed (${res.status}):`, (await res.text()).slice(0, 200));
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn("[remove-background] remove.bg error:", err instanceof Error ? err.message : err);
    return null;
  }
}
