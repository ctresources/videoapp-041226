import { createHash } from "crypto";
import { SOURCE_CHAR_LIMIT } from "@/lib/utils/source-limit";

/**
 * Reading an agent's Halo website (2026-10-24).
 *
 * Halo has no way for another app to be told about new posts, so SparkReels
 * reads the site the way a search engine does: robots.txt names the sitemap,
 * the sitemap lists every page. Halo's sitemaps carry no dates, so "new" is
 * whatever was not there the last time we looked (lib/halo/index.ts keeps
 * that list). Two pages are rewritten in place rather than added to, the
 * market report and the local events page, so those are re-read and judged
 * by what changed on them.
 *
 * Nothing here writes anywhere; it only fetches and reads.
 */

import type { HaloKind } from "@/lib/halo/kinds";
export type { HaloKind } from "@/lib/halo/kinds";

const UA = "Mozilla/5.0 (compatible; SparkReelsBot/1.0; +https://www.sparkreels.ai)";
const MAX_URLS = 3000;

/** "carmellathompson.com", "https://www.x.com/blog" → "https://carmellathompson.com". */
export function normalizeSiteUrl(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return `https://${u.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

/** A Halo referral page: halo-<name>.huzi.site. */
export function isAffiliateHost(siteUrl: string): boolean {
  try {
    return /^halo-[a-z0-9-]+\.huzi\.site$/i.test(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

export async function fetchText(url: string, timeoutMs = 15000): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml,text/xml,*/*" }, signal: ctrl.signal, redirect: "follow" });
    const text = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(t);
  }
}

const locs = (xml: string) =>
  Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1].replace(/&amp;/g, "&"));

/**
 * Every page address the site lists, on its own host. Null when the site has
 * no sitemap we can find (a one-page site, such as a Halo referral page).
 */
export async function sitemapUrls(siteUrl: string): Promise<string[] | null> {
  const host = new URL(siteUrl).hostname;
  const robots = await fetchText(`${siteUrl}/robots.txt`);
  const named = robots.ok
    ? Array.from(robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)).map((m) => m[1])
    : [];
  const starts = named.length ? named : [`${siteUrl}/sitemap-index.xml`, `${siteUrl}/sitemap.xml`];

  const pages = new Set<string>();
  const visited = new Set<string>();
  let found = false;
  const queue = starts.map((u) => ({ u, depth: 0 }));
  while (queue.length && visited.size < 25 && pages.size < MAX_URLS) {
    const { u, depth } = queue.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    const res = await fetchText(u);
    if (!res.ok || !/<(urlset|sitemapindex)\b/i.test(res.text)) continue;
    found = true;
    if (/<sitemapindex\b/i.test(res.text)) {
      if (depth < 2) for (const child of locs(res.text).slice(0, 20)) queue.push({ u: child, depth: depth + 1 });
      continue;
    }
    for (const loc of locs(res.text)) {
      try {
        const p = new URL(loc);
        if (p.hostname.toLowerCase() !== host) continue;
        pages.add(canonical(p));
      } catch { /* not an address */ }
      if (pages.size >= MAX_URLS) break;
    }
  }
  return found ? Array.from(pages) : null;
}

/** One spelling per page: https, no query or fragment, a trailing slash. */
function canonical(u: URL): string {
  const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  return `https://${u.hostname.toLowerCase()}${path}`;
}

/** The two pages Halo rewrites in place instead of adding new ones. */
const WATCHED: Record<string, HaloKind> = {
  "market-report": "market",
  "market-reports": "market",
  "market-update": "market",
  "local-news-events": "events",
  "community-events": "events",
  "events": "events",
};

/**
 * What kind of page an address is, and whether it is one of the watched
 * pages. Null for the pages that are never a video: the home page, contact,
 * and the list pages (/blog/, /guides/ …).
 */
export function classify(url: string): { kind: HaloKind; watched: boolean } | null {
  let segs: string[];
  try {
    segs = new URL(url).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  } catch {
    return null;
  }
  if (segs.length === 0) return null;
  const [first, second] = segs;

  if (segs.length === 1) {
    if (WATCHED[first]) return { kind: WATCHED[first], watched: true };
    if (/^(blog|guides|neighborhoods|communities|relocation-guides|dining|listings|contact|about|faq|reviews|privacy|terms|thank-you|search)$/.test(first)) return null;
    return { kind: "other", watched: false };
  }

  if (segs.length === 2) {
    switch (first) {
      case "blog":
      case "news":
      case "articles":
        if (/^just-(sold|listed)/.test(second)) return { kind: "just_sold", watched: false };
        if (/(housing-market|market-update|market-report)/.test(second)) return { kind: "market", watched: false };
        if (/(^|-)events?(-|$)|things-to-do|whats-happening|happening-in/.test(second)) return { kind: "events", watched: false };
        return { kind: "blog", watched: false };
      case "guides": return { kind: "guides", watched: false };
      case "market-report":
      case "market-reports": return { kind: "market", watched: false };
      case "events": return { kind: "events", watched: false };
      case "neighborhoods": return { kind: "neighborhoods", watched: false };
      case "communities": return { kind: "communities", watched: false };
      case "relocation-guides": return { kind: "relocation", watched: false };
      case "dining": return { kind: "dining", watched: false };
      case "listings":
      case "listing":
      case "just-sold": return { kind: "just_sold", watched: false };
    }
  }
  return { kind: "other", watched: false };
}

const decode = (s: string) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content).trim() : null;
}

/** The readable words of a page: the article or main section when there is one. */
function pageText(html: string): string {
  const body = html.match(/<article[\s>][\s\S]*?<\/article>/i)?.[0]
    ?? html.match(/<main[\s>][\s\S]*?<\/main>/i)?.[0]
    ?? html;
  return decode(body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|footer|header|form|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|h[1-6]|li|div|section|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export interface HaloPage {
  title: string;
  publishedOn: string | null;
  imageUrl: string | null;
  /** Up to 12 pictures from inside the article, for "Photos from the post". */
  photos: string[];
  text: string;
  /** What a watched page's change is judged by. */
  hash: string;
}

/** Reads one page. Null when it cannot be fetched. */
export async function readPage(url: string, kind?: HaloKind): Promise<HaloPage | null> {
  const res = await fetchText(url);
  if (!res.ok || !res.text) return null;
  const html = res.text;

  const site = meta(html, "og:site_name");
  let title = meta(html, "og:title") || decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  // "Post title | Carmella Thompson | eXp Realty" → "Post title"
  if (site && title.endsWith(site)) title = title.slice(0, -site.length).replace(/[\s|–—-]+$/, "").trim();
  title = title.split(/\s+\|\s+/)[0].trim();

  const published = meta(html, "article:published_time")
    || html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
    || null;
  const publishedOn = published && /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : null;

  const imageUrl = meta(html, "og:image") || meta(html, "twitter:image");
  const article = html.match(/<article[\s>][\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s>][\s\S]*?<\/main>/i)?.[0] ?? "";
  const photos = Array.from(new Set(
    Array.from(article.matchAll(/<img[^>]+src=["']([^"']+)["']/gi))
      .map((m) => { try { return new URL(decode(m[1]), url).toString(); } catch { return ""; } })
      .filter((s) => /^https:\/\//.test(s) && !/\.svg(\?|$)|logo|icon|avatar|headshot/i.test(s)),
  )).slice(0, 12);

  const text = pageText(html).slice(0, SOURCE_CHAR_LIMIT);

  // The market report changes its title every month; the events page carries
  // a "Last updated" line. Anything else is judged by its words.
  const h1 = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim();
  const updated = text.match(/last updated:?\s*([A-Z][a-z]+ \d{1,2},? \d{4})/i)?.[1];
  const basis = kind === "market" ? `${title}|${h1}`
    : kind === "events" && updated ? `updated:${updated}`
    : text;
  const hash = createHash("sha256").update(basis).digest("hex").slice(0, 32);

  return { title: title || h1 || url, publishedOn, imageUrl, photos, text, hash };
}

/** The referral code and text number on a Halo referral page, when they can be read. */
export function affiliateDetails(html: string): { code: string | null; phone: string | null } {
  const sms = html.match(/sms:\+?(\d{10,11})[^"']*?body=([A-Z0-9]{4,12})/i);
  const code = sms?.[2]?.toUpperCase() ?? html.match(/\bText\s+([A-Z0-9]{5,10})\b/)?.[1] ?? null;
  const digits = sms?.[1] ?? html.match(/sms:\+?(\d{10,11})/i)?.[1] ?? null;
  const ten = digits ? digits.slice(-10) : null;
  const phone = ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : null;
  return { code, phone };
}
