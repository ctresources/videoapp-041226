/**
 * Pull listing photos out of a scraped page's markdown.
 *
 * These used to come from the extraction prompt, which asked the model for
 * `"photoUrls": []` — an empty array literal with no instruction to fill it —
 * so it dutifully returned nothing every time and every imported listing
 * arrived photo-less. Reading the markdown directly is both correct and more
 * reliable than asking a language model to copy URLs verbatim.
 */

/** Junk that appears as an image on nearly every listing page. */
const NON_PHOTO =
  /logo|icon|sprite|pixel|badge|avatar|headshot|placeholder|blank|spacer|favicon|watermark|banner|button|arrow|thumb_?nail|1x1|transparent/i;

/** Markdown image syntax: ![alt](url "title") */
const MD_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

/** Bare image URLs — Jina emits these in its trailing "Images:" block. */
const BARE_IMAGE = /https?:\/\/[^\s)"'<>]+\.(?:jpe?g|png|webp|avif)(?:\?[^\s)"'<>]*)?/gi;

const MAX_PHOTOS = 12;

/**
 * Returns absolute image URLs from `markdown`, resolved against `pageUrl`,
 * in page order and de-duplicated.
 */
export function extractImageUrls(markdown: string, pageUrl: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    if (found.length >= MAX_PHOTOS) return;
    let abs: string;
    try {
      abs = new URL(raw, pageUrl).href;
    } catch {
      return;
    }
    if (!/^https?:/.test(abs)) return;
    if (!/\.(jpe?g|png|webp|avif)($|\?)/i.test(abs)) return;
    // Compare without the query so the same photo at several sizes counts once.
    const key = abs.split("?")[0];
    if (seen.has(key)) return;
    if (NON_PHOTO.test(key)) return;
    seen.add(key);
    found.push(abs);
  };

  for (const re of [MD_IMAGE, BARE_IMAGE]) {
    re.lastIndex = 0; // module-level regexes are stateful with /g
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      push(m[1] ?? m[0]);
      if (found.length >= MAX_PHOTOS) break;
    }
  }

  return found;
}
