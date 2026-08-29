/**
 * Pull listing photos out of a scraped page's markdown.
 *
 * These used to come from the extraction prompt, which asked the model for
 * `"photoUrls": []` — an empty array literal with no instruction to fill it —
 * so it dutifully returned nothing every time and every imported listing
 * arrived photo-less. Reading the markdown directly is both correct and more
 * reliable than asking a language model to copy URLs verbatim.
 */

/**
 * Junk that appears as an image on nearly every listing page.
 *
 * Substring matching, no word boundaries — so "logo" already catches
 * mls-logo, sourcelogo and the like. The MLS attribution mark that reached a
 * gallery was not caught by any of these, which means its URL says nothing
 * about what it is; see the photos log in scrape-listing for what actually
 * came back before adding guesses here.
 */
const NON_PHOTO =
  /logo|icon|sprite|pixel|badge|avatar|headshot|placeholder|blank|spacer|favicon|watermark|banner|button|arrow|thumb_?nail|1x1|transparent|attribution|brokerage|courtesy|disclaimer/i;

/**
 * Analytics beacons dressed as images.
 *
 * A Facebook tracking pixel reached a real gallery:
 *   https://www.facebook.com/tr/?id=…&ev=PageView&dl=https://www.zillow.com/
 * It has no file extension, so the "must end in a photo extension" rule never
 * applied — that rule is deliberately relaxed for <img> and markdown images,
 * because listing CDNs serve extension-less URLs. And nothing in NON_PHOTO
 * matches "/tr/?id=". These are matched by what they are instead.
 */
const TRACKER =
  /facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|scorecardresearch|quantserve|adsystem|\/collect\?|\/beacon|\/pixel\b|\/tr\/?\?/i;

/**
 * A size declared in the filename that is too small to be a listing photo.
 *
 * Zillow's MLS attribution mark is `<hash>-zillow_web_95_35.jpg` — 95×35
 * pixels, indistinguishable from a photo by every other test, and it landed in
 * a gallery as one of six. Two numbers are required before this rejects
 * anything: `-cc_ft_576` declares one dimension and is a real photo, and a
 * photo simply numbered `-12.jpg` must not be mistaken for a 12px image.
 */
function isTinyDeclaredSize(href: string): boolean {
  const last = href.split("?")[0].split("/").pop() ?? "";
  const dash = last.lastIndexOf("-");
  if (dash < 0) return false;
  const suffix = last.slice(dash + 1).replace(/\.[a-z0-9]+$/i, "");
  const nums = suffix.match(/\d{1,5}/g);
  if (!nums || nums.length < 2) return false;
  return nums.every((n) => Number(n) < 200);
}

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

/**
 * Rendition written into the FILENAME rather than the query string.
 *
 * Zillow is the important case and does all three of these:
 *   <hash>-cc_ft_768.jpg
 *   <hash>-uncropped_scaled_within_1344_1008.webp
 *   <hash>-p_e.jpg
 *
 * De-duplicating on query parameters alone treated those as three different
 * photos. That did no harm while only a handful of images came back, but with
 * the full image list it would fill all twelve slots with the same few photos
 * at different sizes. Anchored to known rendition words and to a trailing
 * WxH, so an ordinary filename that happens to end in digits is left alone.
 */
const RENDITION_PATH =
  /(-(?:cc_ft|uncropped_scaled_within|p)_[a-z0-9_]+|[-_]\d{2,4}x\d{2,4})(?=\.[a-z0-9]{3,4}$)/i;

/**
 * Rough pixel size of a rendition, for choosing between two URLs of the same
 * photo. The largest number in the last path segment: `-cc_ft_1536` beats
 * `-cc_ft_384`, `_1344_1008` beats `_768`. Only ever compared against another
 * rendition of the SAME photo, so a filename like `lot-2024.jpg` scoring 2024
 * costs nothing — nothing else shares its identity.
 */
function renditionWidth(href: string): number {
  const last = href.split("?")[0].split("/").pop() ?? "";
  // .match, not .matchAll — this project's TS target predates iterating a
  // RegExpStringIterator, and an array of strings is all that is wanted here.
  const runs = last.match(/\d{2,5}/g);
  return runs ? runs.reduce((max, n) => Math.max(max, Number(n)), 0) : 0;
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
  const path = url.pathname.replace(RENDITION_PATH, "");
  return `${url.origin}${path}${kept.length ? `?${kept.join("&")}` : ""}`;
}

/**
 * Returns absolute image URLs from `markdown`, resolved against `pageUrl`,
 * in page order and de-duplicated.
 */
export function extractImageUrls(markdown: string, pageUrl: string): string[] {
  const found: string[] = [];
  // Where each photo landed in `found`, and how big the rendition we kept was.
  // A Set of identities would keep whichever URL the page happened to list
  // first, and pages list the thumbnail first — so the b-roll was a 384px
  // image stretched over a 1080p frame.
  const chosen = new Map<string, { index: number; width: number }>();

  const push = (raw: string, needsPhotoExt: boolean) => {
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
    if (TRACKER.test(abs)) return;
    if (isTinyDeclaredSize(abs)) return;

    const key = photoIdentity(abs);
    if (NON_PHOTO.test(key)) return;

    const width = renditionWidth(abs);
    const existing = chosen.get(key);
    if (existing) {
      // Same photo again. Not a new slot — but if this one is bigger, it is
      // the copy worth keeping.
      if (width > existing.width) {
        found[existing.index] = abs;
        existing.width = width;
      }
      return;
    }

    // The cap applies to NEW photos only. Checking it before the duplicate
    // test above would freeze the first twelve at whatever size they were
    // first listed at, which is the small one.
    if (found.length >= MAX_PHOTOS) return;
    chosen.set(key, { index: found.length, width });
    found.push(abs);
  };

  for (const { re, needsPhotoExt } of SOURCES) {
    re.lastIndex = 0; // module-level regexes are stateful with /g
    let m: RegExpExecArray | null;
    // Deliberately reads to the end rather than stopping at MAX_PHOTOS: a
    // larger rendition of a photo already held usually appears later in the
    // page than its thumbnail, and stopping early never saw it.
    while ((m = re.exec(markdown)) !== null) {
      push(m[1] ?? m[0], needsPhotoExt);
    }
  }

  return found;
}
