/**
 * The agent in front of the home: a 6-second opening shot for a listing video
 * (2026-10-24, the owner's ask, after testing it against Seedance).
 *
 * HeyGen's cinematic_avatar mode on its own model, heygen-video-1: the agent's
 * look plus the listing's front photo, described as a shot. Tested on the
 * owner's twin and 24 Shagbark: $0.45 and about a minute, against $7.30 and
 * four minutes on Seedance. It invented a fence at the frame's edge there, so
 * the description keeps the house as photographed and adds nothing.
 *
 * Silent by default: the video's own narration, music or opening line carry
 * the sound. Since 2026-11-03 (HeyGen Video can now voice its cast; the owner
 * approved a test on her twin) a listing video's opener can speak one line,
 * "Welcome to 24 Shagbark Court in Harleysville…", in the look's own linked
 * voice: only a Digital Twin has the agent's voice linked, so only twins talk.
 *
 * Returns null on any failure, so a video is never held up by its opener.
 */

const API = "https://api.heygen.com";

export type OpenerStyle = "full" | "chest";

export function parseOpenerStyle(v: unknown): OpenerStyle | null {
  return v === "full" || v === "chest" ? v : null;
}

/**
 * Where the shot is (2026-11-03, for the video templates): in front of the
 * home (listing videos, Just Listed), the same with a slower, elegant move
 * (Luxury), on a street in the area (Market Update, Neighborhood), or in a
 * bright office with no photo (Agent Introduction).
 */
export type OpenerPlace = "home" | "elegant" | "area" | "office";

function promptFor(style: OpenerStyle, line?: string | null, place: OpenerPlace = "home"): string {
  const who = "The person from the avatar reference, the real estate agent,";
  const say = line ? `look straight into the camera and say: "${line.replace(/"/g, "")}" Then they` : "";
  const end = line ? "Natural, realistic and cinematic. Quiet ambience, no music. They say only that line." : "Natural, realistic and cinematic. They do not speak.";
  if (place === "area") return [
    `${who} stands on a sidewalk in the neighborhood in the reference photo, framed from the waist up, with the street, homes and trees softly behind them. They smile warmly at the camera, ${say ? `${say} ` : "then "}gesture with an open hand toward the street, inviting the viewer to look around. Camera at eye level, a slow, smooth push-in.`,
    "The street, homes, trees and sky look like the reference photo. No text, no signs and no logos.",
    end,
  ].join(" ");
  if (place === "office") return [
    `${who} stands in a bright, simple, modern real estate office with soft daylight from a window, framed from the waist up. They smile warmly at the camera, ${say ? `${say} ` : "then "}give a small, friendly nod. Camera at eye level, almost still.`,
    "No other people, no text, no signs and no logos.",
    end,
  ].join(" ");
  const shot = style === "full"
    ? `${who} stands on the front walkway of the house in the reference photo, seen full length from head to toe, with the front of the house behind them. They smile warmly at the camera, ${say ? `${say} ` : "then "}turn slightly and gesture with an open hand toward the front door, welcoming the viewer. Camera at eye level, a slow, smooth push-in.`
    : `${who} stands in front of the house in the reference photo, framed from the chest up and close to the camera, with the front of the house softly behind them. They smile warmly at the camera, ${say ? `${say} ` : "then "}gesture with an open hand back toward the house, welcoming the viewer. Camera at eye level, almost still.`;
  return [
    place === "elegant" ? shot.replace(/Camera at eye level[^.]*\./, "The camera glides slowly and smoothly at eye level; a refined, elegant mood.") : shot,
    "The house, its siding, shutters, windows, front door, roof, plants, lawn and sky look exactly as in the reference photo.",
    "Nothing is added to the property: no fences, no extra buildings, no cars, no other people, no signs, no text and no logos.",
    line ? "Natural, realistic and cinematic. Quiet outdoor ambience, no music. They say only that line." : "Natural, realistic and cinematic. They do not speak.",
  ].join(" ");
}

/** "24 Shagbark Ct E, Harleysville, PA 19438" → "Welcome to 24 Shagbark Court East in Harleysville. Come on in, let me show you around." */
const SAY: Record<string, string> = {
  st: "Street", ave: "Avenue", av: "Avenue", rd: "Road", dr: "Drive", ln: "Lane", ct: "Court", blvd: "Boulevard", pl: "Place",
  cir: "Circle", ter: "Terrace", pkwy: "Parkway", hwy: "Highway", trl: "Trail", sq: "Square", way: "Way",
  n: "North", s: "South", e: "East", w: "West", ne: "Northeast", nw: "Northwest", se: "Southeast", sw: "Southwest",
};
export function welcomeLine(address: string | null | undefined): string | null {
  const parts = (address ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const street = (parts[0] ?? "").replace(/\s*(#|apt\.?|unit|suite)\s*\S+$/i, "");
  if (!/^\d+\s+\S/.test(street)) return null;
  const ws = street.split(/\s+/);
  // Directions anywhere; "St", "Dr"… only at the end ("24 Shagbark Ct E"), so "St Andrews Rd" keeps its Saint.
  const spoken = ws.map((w, i) => {
    const k = w.toLowerCase().replace(/\.$/, "");
    const dir = k.length <= 2 && /^[nsew]{1,2}$/.test(k);
    return i === 0 || (!dir && i < ws.length - 2) ? w : SAY[k] ?? w;
  }).join(" ");
  const town = parts.length >= 3 ? parts[1] : "";
  return `Welcome to ${spoken}${town && !/\d/.test(town) ? ` in ${town}` : ""}. Come on in, let me show you around.`.slice(0, 160);
}

export async function makeAgentOpener(opts: {
  lookId: string;
  /** The photo the shot is made from; none for the office. */
  photoUrl?: string | null;
  place?: OpenerPlace;
  aspect: "16:9" | "9:16";
  style: OpenerStyle;
  seconds?: number;
  /** Give up after this long (ms). */
  timeoutMs?: number;
  /** One line for them to say (only a Digital Twin has their own voice). Silent without. */
  line?: string | null;
}): Promise<{ url: string; seconds: number; talks: boolean } | null> {
  // A spoken line needs time to land: about 2.6 words a second, plus a beat.
  const words = (opts.line ?? "").split(/\s+/).filter(Boolean).length;
  const seconds = words ? Math.max(opts.seconds ?? 6, Math.ceil(words / 2.6) + 2) : (opts.seconds ?? 6);
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return null;
  const headers = { "x-api-key": key, "Content-Type": "application/json" };
  const started = Date.now();
  try {
    const res = await fetch(`${API}/v3/videos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "cinematic_avatar",
        model: "heygen_video_1",
        avatar_id: [opts.lookId],
        ...(opts.photoUrl && opts.place !== "office" && { references: [{ type: "url", url: opts.photoUrl }] }),
        prompt: promptFor(opts.style, opts.line, opts.place),
        aspect_ratio: opts.aspect,
        resolution: "720p",
        duration: Math.min(15, Math.max(5, Math.round(seconds))),
        title: "SparkReels opener",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const created = await res.json().catch(() => null);
    const id = created?.data?.video_id as string | undefined;
    if (!res.ok || !id) {
      console.warn(`[opener] not accepted (HTTP ${res.status}): ${JSON.stringify(created ?? {}).slice(0, 300)}`);
      return null;
    }
    const deadline = started + (opts.timeoutMs ?? 180_000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      const r = await fetch(`${API}/v3/videos/${id}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      const d = r ? (await r.json().catch(() => null))?.data : null;
      if (!d) continue;
      if (d.status === "completed" && d.video_url) {
        console.log(`[opener] ${opts.style} shot ready in ${Math.round((Date.now() - started) / 1000)}s`);
        return { url: d.video_url as string, seconds: Number(d.duration) || seconds, talks: !!opts.line };
      }
      if (d.status === "failed") {
        console.warn(`[opener] failed: ${JSON.stringify(d.error ?? d.failure_message ?? d).slice(0, 300)}`);
        return null;
      }
    }
    console.warn("[opener] timed out");
    return null;
  } catch (err) {
    console.warn("[opener] error:", err instanceof Error ? err.message : err);
    return null;
  }
}
