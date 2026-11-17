import sharp from "sharp";
import { countGemini, geminiKey } from "@/lib/api/gemini";
import type { Shape } from "@/lib/templates/designs";

/**
 * Moving photos for Quick Reels Templates (2026-11-16, the owner's ask after
 * the test clips), made by Gemini's video model.
 *
 * Listing photos: Gemini is given two frames, both cut from the real photo
 * (the whole photo and a 92% centre crop of it), and only moves between them.
 * Asked in words alone for "a tiny push-in", it walked into an empty room and
 * drew a stove and microwave the photo never showed; with two real frames it
 * stayed true in the owner's test (24 Shagbark Ct). The photo is cropped to
 * the clip's shape first, so there is no new area for it to invent.
 *
 * Town footage: Market Update and Neighborhood with no photo get moving shots
 * of the place instead of one still picture.
 *
 * Every clip is optional: null means "use the photo as before".
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const videoModel = () => process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.2-flash";

const KEEP =
  "The home must stay exactly as it is in the photo: do not add, remove, move or change anything. " +
  "Never show anything that is not already visible in the photo. No people, no text. No music, no speech.";

type Item = { type?: string; data?: string; uri?: string };
function findVideo(node: unknown): Item | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  if (o.type === "video" && (o.data || o.uri)) return o as Item;
  for (const v of Object.values(o)) {
    const list = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
    for (const x of list) { const f = findVideo(x); if (f) return f; }
  }
  return null;
}

async function fromUri(key: string, uri: string, deadline: number): Promise<Buffer | null> {
  const id = uri.match(/files\/([^/:?]+)/)?.[1];
  const h = { "x-goog-api-key": key };
  if (!id) {
    const r = await fetch(uri, { headers: h });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  while (Date.now() < deadline) {
    const j = (await (await fetch(`${BASE}/files/${id}`, { headers: h })).json().catch(() => ({}))) as { state?: string };
    if (j.state === "ACTIVE") break;
    if (j.state === "FAILED") return null;
    await new Promise((s) => setTimeout(s, 4000));
  }
  const r = await fetch(`${BASE}/files/${id}:download?alt=media`, { headers: h });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

/** One clip from Gemini, or null. */
async function makeClip(input: unknown, aspect: "16:9" | "9:16", seconds: number, label: string, timeoutMs = 240_000): Promise<Buffer | null> {
  const key = geminiKey();
  if (!key) return null;
  const deadline = Date.now() + timeoutMs;
  try {
    const res = await fetch(`${BASE}/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model: videoModel(),
        input,
        response_format: { type: "video", aspect_ratio: aspect, resolution: "720p", duration: `${seconds}s`, delivery: "uri" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[moving] ${label}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const v = findVideo(await res.json());
    if (!v) { console.warn(`[moving] ${label}: no video in the reply`); return null; }
    const buf = v.data ? Buffer.from(v.data, "base64") : await fromUri(key, v.uri!, deadline);
    if (!buf || buf.length < 10_000) return null;
    await countGemini("video_seconds", seconds);
    return buf;
  } catch (err) {
    console.warn(`[moving] ${label}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const img = (b: Buffer) => ({ type: "image", data: b.toString("base64"), mime_type: "image/jpeg" });
const clampSec = (s: number, max: number) => Math.min(max, Math.max(3, Math.ceil(s)));

/** The size a clip comes back at, for fitting it into the frame. */
export const clipSize = (aspect: "16:9" | "9:16") => (aspect === "16:9" ? { w: 1280, h: 720 } : { w: 720, h: 1280 });

/**
 * A listing photo brought to life: a slow zoom between two frames cut from the
 * photo itself. zoomIn alternates, like the still photos' zoom.
 */
export async function movingPhoto(photo: Buffer, seconds: number, zoomIn: boolean, label: string):
  Promise<{ clip: Buffer; aspect: "16:9" | "9:16" } | null> {
  try {
    const upright = await sharp(photo).rotate().toBuffer();
    const { width = 0, height = 0 } = await sharp(upright).metadata();
    if (!width || !height) return null;
    const aspect: "16:9" | "9:16" = width >= height ? "16:9" : "9:16";
    const { w: W, h: H } = clipSize(aspect);
    // The largest piece of the photo in the clip's shape, from the middle.
    const r = W / H;
    const cw = Math.min(width, Math.round(height * r));
    const ch = Math.min(height, Math.round(cw / r));
    const whole = await sharp(upright)
      .extract({ left: Math.round((width - cw) / 2), top: Math.round((height - ch) / 2), width: cw, height: ch })
      .resize(W, H).jpeg({ quality: 92 }).toBuffer();
    const zw = Math.round(W * 0.92), zh = Math.round(H * 0.92);
    const closer = await sharp(whole)
      .extract({ left: Math.round((W - zw) / 2), top: Math.round((H - zh) / 2), width: zw, height: zh })
      .resize(W, H).jpeg({ quality: 92 }).toBuffer();
    const [first, last] = zoomIn ? [whole, closer] : [closer, whole];
    const text = "Real estate listing video. A tiny, very slow, perfectly smooth zoom from the first frame to the second frame, like a tripod with a slow zoom. " + KEEP;
    // Two-frame clips are 3 to 10 seconds.
    const clip = await makeClip([img(first), img(last), { type: "text", text }], aspect, clampSec(seconds, 10), label);
    return clip ? { clip, aspect } : null;
  } catch (err) {
    console.warn(`[moving] ${label}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const TOWN_SHOTS = [
  (p: string) => `A smooth, slow aerial glide over a tree-lined residential street of attractive homes in ${p}, golden hour`,
  (p: string) => `A slow, steady shot along a charming main street with shops and cafes in ${p}, people strolling in the distance, sunny afternoon`,
  (p: string) => `A gentle drone shot rising over a green park and nearby neighborhood homes in ${p}, blue sky`,
];

/**
 * Moving shots of a town for a Market Update or Neighborhood with no photo,
 * enough to cover about `total` seconds. Empty when none could be made.
 */
export async function townClips(place: string, shape: Shape, total: number, label: string): Promise<{ clips: Buffer[]; seconds: number }> {
  const aspect = shape === "vertical" ? "9:16" : "16:9";
  const n = total <= 16 ? 1 : total <= 32 ? 2 : 3;
  const seconds = clampSec(total / n + 1, 15);
  const tail = " Cinematic and photorealistic, like real estate b-roll. No text, no readable signs, no logos, no captions. No music, no speech.";
  const made = await Promise.all(TOWN_SHOTS.slice(0, n).map((shot, i) => makeClip(shot(place) + "." + tail, aspect, seconds, `${label}-town${i}`)));
  return { clips: made.filter((b): b is Buffer => !!b), seconds };
}

/** Runs the jobs at most `limit` at a time, in order of the results. */
export async function inBatches<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}
