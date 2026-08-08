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

/** Ends in a photo extension — the only thing a bare URL has to go on. */
const PHOTO_EXT = /\.(jpe?g|png|webp|avif)($|\?)/i;

/**
 * Ends in an extension that is never a listing photo. Checked instead of
 * PHOTO_EXT where the surrounding syntax already promises an image: plenty of
 * listing CDNs serve extension-less URLs (`/photos/abc123`, `/image/upload/v1/x`)
 * and requiring an extension threw those away.
 */
const NON_PHOTO_EXT =
  /\.(svg|gif|ico|bmp|tiff?|html?|php|aspx?|jsp|pdf|json|js|css|mp4|webm|mov)($|\?)/i;

/** Markdown image syntax: ![alt](url "title") */
const MD_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

/** <img src="…"> — Jina leaves raw HTML in place on some pages. */
const HTML_IMAGE = /<img\b[^>]*?\ssrc=["']([^"']+)["']/gi;

/** Bare image URLs — Jina emits these in its trailing "Images:" block. */
const BARE_IMAGE = /https?:\/\/[^\s)"'<>]+\.(?:jpe?g|png|webp|avif)(?:\?[^\s)"'<>]*)?/gi;

/**
 * Where a photo can be found, and whether the syntax around it already
 * establishes that it is an image. Bare URLs have nothing but the extension,
 * so they still have to end in one.
 */
const SOURCES: { re: RegExp; needsPhotoExt: boolean }[] = [
  { re: MD_IMAGE, needsPhotoExt: false },
  { re: HTML_IMAGE, needsPhotoExt: false },
  { re: BARE_IMAGE, needsPhotoExt: true },
];

/**
 * Query parameters that select a rendition of a photo rather than a different
 * photo. Ignored when de-duplicating so one photo offered at six sizes counts
 * once — but the rest of the query is kept, because an extension-less CDN URL
 * often identifies the photo entirely in its query (`/image?id=7`).
 */
const RENDITION_PARAMS = new Set([
  "w", "width", "h", "height", "q", "quality", "dpr", "fit", "crop", "size",
  "sz", "format", "fm", "auto", "resize", "rotate", "scale", "max", "maxwidth",
  "maxheight",
]);

/**
 * Image-proxy wrappers put the real photo in a query parameter — Next.js
 * (`/_next/image?url=…`), wsrv/weserv, Cloudflare and most CDN resizers all do
 * it. Agent IDX sites are overwhelmingly Next.js or WordPress, so without this
 * their galleries read as one repeated URL (the proxy path) instead of photos.
 */
const PROXY_PARAMS = ["url", "src", "image", "u"];

const MAX_PHOTOS = 12;

/** Follow an image proxy to the photo it wraps. Bounded — proxies can nest. */
function unwrapProxy(href: string, base: string): string {
  let current = href;
  for (let hop = 0; hop < 3; hop++) {
    let inner: string | null = null;
    try {
      const params = new URL(current).searchParams;
      for (const name of PROXY_PARAMS) {
        const value = params.get(name);
        // Only a nested URL counts — `?src=hero` is a variant name, not a photo.
        if (value && /^(https?:\/\/|\/)/.test(value)) {
          inner = value;
          break;
        }
      }
    } catch {
      return current;
    }
    if (!inner) return current;
    try {
      current = new URL(inner, base).href;
    } catch {
      return current;
    }
  }
  return current;
}

/** Identity of the photo itself, ignoring which rendition of it this URL asks for. */
function photoIdentity(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const kept: string[] = [];
  url.searchParams.forEach((value, name) => {
    if (!RENDITION_PARAMS.has(name.toLowerCase())) kept.push(`${name}=${value}`);
  });
  kept.sort();
  return `${url.origin}${url.pathname}${kept.length ? `?${kept.join("&")}` : ""}`;
}

/**
 * Returns absolute image URLs from `markdown`, resolved against `pageUrl`,
 * in page order and de-duplicated.
 */
export function extractImageUrls(markdown: string, pageUrl: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string, needsPhotoExt: boolean) => {
    if (found.length >= MAX_PHOTOS) return;
    let abs: string;
    try {
      abs = new URL(raw, pageUrl).href;
    } catch {
      return;
    }
    if (!/^https?:/.test(abs)) return;

    abs = unwrapProxy(abs, pageUrl);
    if (!/^https?:/.test(abs)) return;

    if (needsPhotoExt ? !PHOTO_EXT.test(abs) : NON_PHOTO_EXT.test(abs)) return;

    const key = photoIdentity(abs);
    if (seen.has(key)) return;
    if (NON_PHOTO.test(key)) return;
    seen.add(key);
    found.push(abs);
  };

  for (const { re, needsPhotoExt } of SOURCES) {
    re.lastIndex = 0; // module-level regexes are stateful with /g
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      push(m[1] ?? m[0], needsPhotoExt);
      if (found.length >= MAX_PHOTOS) break;
    }
  }

  return found;
}
