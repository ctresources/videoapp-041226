import sharp from "sharp";
import { countGemini, geminiJson, geminiKey, type GeminiPart } from "@/lib/api/gemini";

/**
 * Sorts an imported listing's photos (2026-11-15, the owner's approved plan,
 * docs/mockups/gemini-five-mockup.html #1).
 *
 * Gemini looks at every photo once, small, and labels it. The app then drops
 * the junk (headshots, logos, lender ads, "coming soon" cards, blurry shots,
 * near-duplicates) and puts the rest in tour order with the best front of the
 * home first. Null when it can't, and the photos stay as they came.
 */

const ORDER = [
  "front", "exterior", "entry", "living", "kitchen", "dining", "family", "bedroom", "bath",
  "office", "laundry", "basement", "garage", "yard", "deck", "pool", "view", "community", "neighborhood", "floorplan", "other",
];

interface Label { n: number; label: string; quality?: number; junk?: boolean; why?: string }

async function smallPart(url: string): Promise<GeminiPart | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const small = await sharp(buf).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    return { inlineData: { mimeType: "image/jpeg", data: small.toString("base64") } };
  } catch {
    return null;
  }
}

export interface PhotoSort { urls: string[]; removed: { url: string; why: string }[]; original: string[] }

export async function sortListingPhotos(urls: string[]): Promise<PhotoSort | null> {
  if (!geminiKey() || urls.length < 2) return null;
  const list = urls.slice(0, 30);
  const parts = await Promise.all(list.map(smallPart));
  const seen = list.map((u, i) => ({ u, i, part: parts[i] })).filter((x) => x.part);
  if (seen.length < 2) return null;

  const content: GeminiPart[] = [];
  seen.forEach((x, k) => {
    content.push({ text: `Photo ${k + 1}:` });
    content.push(x.part as GeminiPart);
  });
  content.push({
    text: `These are the photos from one real estate listing. Label every photo.

label: one of ${ORDER.join(", ")}.
quality: 1 to 5, how good it would look in a video of this home (sharp, bright, well framed = 5).
junk: true only for photos that are not of this property or are useless in a video: a person or agent headshot, a company or brokerage logo, a lender or mortgage ad, a "coming soon" or text card, a map, a very blurry shot, or a near-duplicate of an earlier photo. Floor plans are not junk.
why: for junk only, 1 to 4 words ("agent headshot", "logo", "duplicate").

Also pick best_front: the photo number of the best front-of-home exterior shot, or 0 if there is none.

Return ONLY JSON: {"photos":[{"n":1,"label":"front","quality":4,"junk":false,"why":""}],"best_front":1}`,
  });

  const out = await geminiJson<{ photos?: Label[]; best_front?: number }>({
    parts: content, temperature: 0.1, timeoutMs: 30_000, label: "photo-sort",
  });
  if (!out?.photos?.length) return null;
  void countGemini("photo_sorts");

  const byN = new Map(out.photos.map((p) => [p.n, p]));
  const rows = seen.map((x, k) => {
    const l = byN.get(k + 1);
    return { url: x.u, i: x.i, label: ORDER.includes(l?.label ?? "") ? (l?.label as string) : "other", quality: Number(l?.quality) || 3, junk: !!l?.junk, why: (l?.why || "not the home").slice(0, 40), front: out.best_front === k + 1 };
  });

  // A model that calls most of a gallery junk is more likely wrong than the
  // gallery: keep everything and only reorder.
  const junk = rows.filter((r) => r.junk);
  const dropJunk = junk.length <= Math.floor(rows.length / 2);
  const kept = rows.filter((r) => !(dropJunk && r.junk));

  kept.sort((a, b) => {
    if (a.front !== b.front) return a.front ? -1 : 1;
    const oa = ORDER.indexOf(a.label), ob = ORDER.indexOf(b.label);
    if (oa !== ob) return oa - ob;
    if (a.quality !== b.quality) return b.quality - a.quality;
    return a.i - b.i;
  });

  // Photos that couldn't be looked at keep their place at the end, and so do
  // any beyond the first 30.
  const unseen = list.filter((_, i) => !parts[i]);
  return {
    urls: [...kept.map((r) => r.url), ...unseen, ...urls.slice(30)],
    removed: dropJunk ? junk.map((r) => ({ url: r.url, why: r.why })) : [],
    original: urls,
  };
}
