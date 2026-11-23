import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import sharp from "sharp";
import { storeImageBuffer } from "@/lib/utils/rehost-images";
import { cleanVisualDirection } from "@/lib/utils/visual-direction";

/**
 * What a plan shows on screen (2026-11-23): a line of direction and the
 * agent's own screenshots or photos, by link.
 *
 * A link comes from an AI client, so it is never handed to the renderer. Each
 * is fetched here under strict rules and copied into the agent's own storage;
 * the plan only ever holds the copy. A link that fails is reported, not skipped
 * silently.
 */

export const MAX_PLAN_IMAGES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const IMAGE_FORMATS = new Set(["jpeg", "png", "webp"]);

export interface PlanImage { source: string; url: string }
export interface PlanVisuals { direction: string; images: PlanImage[] }

const blocked = new net.BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(ip, bits, "ipv6");

// Its own list: in a shared one, this rule also matches every plain IPv4 address.
const ipv4Mapped = new net.BlockList();
ipv4Mapped.addSubnet("::ffff:0:0", 96, "ipv6");

/** Only an address on the public internet. Anything unparseable is refused. */
export function isPublicIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) return !ipv4Mapped.check(address, "ipv6") && !blocked.check(address, "ipv6");
  return false;
}

/** A link we may even try: https, the normal port, no login, not a private name. */
export function isAllowedImageLink(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal)$/.test(host)) return false;
  return net.isIP(host) ? isPublicIp(host) : host.includes(".");
}

/**
 * Checks the address at the moment of connecting, so a name can't pass a check
 * and then point somewhere private for the real request.
 */
const publicLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) {
      return callback(Object.assign(new Error("Address not allowed"), { code: "ENOTFOUND" }), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function getOnce(link: string): Promise<{ redirect: string | null; type: string; body: Buffer | null }> {
  return new Promise((resolve, reject) => {
    const req = https.get(link, {
      lookup: publicLookup,
      timeout: FETCH_TIMEOUT_MS,
      headers: { accept: "image/jpeg,image/png,image/webp", "user-agent": "SparkReels-image-import" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, link).toString(), type: "", body: null });
      }
      const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (status !== 200 || !IMAGE_TYPES.has(type) || Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
        res.destroy();
        return reject(new Error("Not an image"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { res.destroy(); reject(new Error("Too large")); return; }
        chunks.push(c);
      });
      res.on("end", () => resolve({ redirect: null, type, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
  });
}

async function fetchPublicImage(link: string): Promise<Buffer | null> {
  let current = link;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedImageLink(current)) return null;
    const r = await getOnce(current);
    if (r.body) return r.body;
    if (!r.redirect) return null;
    current = r.redirect;
  }
  return null;
}

/** Copies one image into the agent's storage as a clean JPEG. Null if it can't be used. */
async function copyImage(userId: string, source: string): Promise<PlanImage | null> {
  try {
    const bytes = await fetchPublicImage(source);
    if (!bytes) return null;
    const image = sharp(bytes, { limitInputPixels: 40_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !IMAGE_FORMATS.has(meta.format)) return null;
    const jpeg = await image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const url = await storeImageBuffer(userId, jpeg, "image/jpeg");
    return url ? { source, url } : null;
  } catch {
    return null;
  }
}

/** The links asked for, deduplicated and capped. */
export function imageLinks(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string") : [];
  return Array.from(new Set(list.map((u) => u.trim()).filter(Boolean)));
}

/**
 * Keeps an edited plan's copies (no second download) and copies anything new.
 * `failed` is every link that couldn't be used, including any past the limit.
 */
export async function imagesForPlan(userId: string, links: string[], previous: PlanImage[] = []): Promise<{ images: PlanImage[]; failed: string[] }> {
  const wanted = links.slice(0, MAX_PLAN_IMAGES);
  const copied = await Promise.all(wanted.map((source) => previous.find((p) => p.source === source) ?? copyImage(userId, source)));
  const images = copied.filter((c): c is PlanImage => !!c);
  const kept = new Set(images.map((i) => i.source));
  return { images, failed: links.filter((l) => !kept.has(l)) };
}

const VISUAL_LABEL = /\b(?:on[- ]screen|images?)\s*:\s*(.+?)(?=\s*\b(?:shape|presenter|style|on[- ]screen|images?)\s*:|$)/gim;

/**
 * The backup for AI apps holding an old tool list, like labeledAnswers: only
 * "On screen: ..." and "Images: https://..." count. The last one given wins.
 */
export function labeledVisuals(text: string): { direction: string; images: string[] } {
  let direction = "";
  let images: string[] = [];
  for (const m of Array.from(text.matchAll(VISUAL_LABEL))) {
    if (/^images?/i.test(m[0])) images = m[1].match(/https:\/\/[^\s,;<>"']+/g)?.map((u) => u.replace(/[.)]+$/, "")) ?? [];
    else direction = cleanVisualDirection(m[1]);
  }
  return { direction, images };
}

/** The goal without those labels, so they never reach the script's topic. */
export const withoutVisualLabels = (text: string) => text.replace(VISUAL_LABEL, " ").replace(/[ \t]{2,}/g, " ").trim();

export const visualsFrom = (totals: unknown): PlanVisuals => {
  const v = (totals as { visuals?: Partial<PlanVisuals> } | null)?.visuals;
  return { direction: cleanVisualDirection(v?.direction), images: Array.isArray(v?.images) ? v.images : [] };
};
