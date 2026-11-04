/**
 * A short fingerprint of a project's spoken words (2026-11-04, the owner's
 * ask). Saved on the video when it is made (start-render) and compared with
 * the project's script later, so the AutoSparks card can say the script was
 * edited after the video was made. Same on the server and in the browser.
 */
export function scriptPrint(ai: Record<string, unknown> | null | undefined): string | null {
  if (!ai) return null;
  const part = (k: string) => (typeof ai[k] === "string" ? (ai[k] as string) : "");
  const words = [part("hook"), part("script"), ai.cta_off === true ? "" : part("cta")]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return null;
  // FNV-1a, 32-bit: enough to tell an edit apart, not a secret.
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    h ^= words.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
