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
 * No script and no voice in this mode: the shot is silent and the video's own
 * narration, music or opening line carry the sound.
 *
 * Returns null on any failure, so a video is never held up by its opener.
 */

const API = "https://api.heygen.com";

export type OpenerStyle = "full" | "chest";

export function parseOpenerStyle(v: unknown): OpenerStyle | null {
  return v === "full" || v === "chest" ? v : null;
}

function promptFor(style: OpenerStyle): string {
  const who = "The person from the avatar reference, the real estate agent,";
  const shot = style === "full"
    ? `${who} stands on the front walkway of the house in the reference photo, seen full length from head to toe, with the front of the house behind them. They smile warmly at the camera, then turn slightly and gesture with an open hand toward the front door, welcoming the viewer. Camera at eye level, a slow, smooth push-in.`
    : `${who} stands in front of the house in the reference photo, framed from the chest up and close to the camera, with the front of the house softly behind them. They smile warmly at the camera, then gesture with an open hand back toward the house, welcoming the viewer. Camera at eye level, almost still.`;
  return [
    shot,
    "The house, its siding, shutters, windows, front door, roof, plants, lawn and sky look exactly as in the reference photo.",
    "Nothing is added to the property: no fences, no extra buildings, no cars, no other people, no signs, no text and no logos.",
    "Natural, realistic and cinematic. They do not speak.",
  ].join(" ");
}

export async function makeAgentOpener(opts: {
  lookId: string;
  photoUrl: string;
  aspect: "16:9" | "9:16";
  style: OpenerStyle;
  seconds?: number;
  /** Give up after this long (ms). */
  timeoutMs?: number;
}): Promise<{ url: string; seconds: number } | null> {
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
        references: [{ type: "url", url: opts.photoUrl }],
        prompt: promptFor(opts.style),
        aspect_ratio: opts.aspect,
        resolution: "720p",
        duration: Math.min(15, Math.max(5, Math.round(opts.seconds ?? 6))),
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
        return { url: d.video_url as string, seconds: Number(d.duration) || opts.seconds || 6 };
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
