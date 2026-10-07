import sharp from "sharp";

/**
 * Cinematic motion for a photo reel: each photo becomes a few seconds of
 * camera movement, opening on exactly that photo.
 *
 * NOT WIRED IN. Nothing calls this yet, and it must not be offered until the
 * check described below exists. Kept because the generating, retrying and
 * shape handling here are tested and are what the feature will be built on.
 *
 * What testing on one real listing found (2026-10-06, 20 clips):
 *
 * - In the photo's own wide shape, a slow push-in stayed true every time:
 *   rooms, a mirror, an exterior with a house number, staged furniture.
 * - Cut to the tall 9:16 shape first, it did not. The middle of a wide bathroom
 *   photo is a door and a blank wall, and from that first frame the model left
 *   the room altogether and drew a different one, with a dresser, a lamp and
 *   curtains. Twice, with two different instructions, including one that said
 *   the camera barely moves and nothing may be revealed. On a listing that is
 *   inventing part of a property.
 * - A move that travels outside the frame (a sideways glide) draws what the
 *   photograph never showed. Hence one move only, forwards, and gentle.
 * - People are redrawn: swimmers changed position and appearance.
 *
 * So an instruction is not a safeguard. What is: comparing the clip's last
 * frame with its first. Shrunk to 32x32 greyscale and correlated, the clips
 * that stayed on their photo scored 0.66 to 1.00 and the invented room 0.29.
 * A clip under about 0.6 has to be thrown away and that photo shown the
 * classic way. That check is the missing piece. It cannot see a person being
 * redrawn (the pool scored 0.94), so the warning about people stays too.
 *
 * Costs about $0.015 per second of clip (measured: 5 s = $0.08, 10 s = $0.15,
 * a little more for wider frames). A failed generation is not charged.
 */

const API = "https://api.heygen.com";
const MODEL = "heygen-video-1";

/** The provider accepts 5 to 15 seconds. */
export const CLIP_MIN_SECONDS = 5;
export const CLIP_MAX_SECONDS = 15;

/** Never more than this many being made at once. */
const CONCURRENCY = 4;
/** One clip took 6 to 11 seconds in testing. This is the patience for a slow one. */
const CLIP_TIMEOUT_MS = 75_000;
const POLL_MS = 3_000;

export type CinematicShape = "9:16" | "16:9" | "1:1";

/**
 * What goes to the model as the first frame, per shape. The clip comes back in
 * the same shape as the image it is given, so the photo is cut to the reel's
 * shape here rather than letterboxed later.
 */
const FRAME: Record<CinematicShape, { width: number; height: number }> = {
  "9:16": { width: 864, height: 1536 },
  "16:9": { width: 1536, height: 864 },
  "1:1": { width: 1152, height: 1152 },
};

/**
 * The instruction, sent as written (prompt_enhancement is off: the default
 * rewrites the prompt, and "change nothing" is the part that must survive).
 *
 * Deliberately almost no movement. A plain "slow push-in" ran a long way in: a
 * 10 second clip ended tight on the dining table and a tall crop of the house
 * front ended on one window. This wording kept wide and well-filled frames
 * nearly still. It did not stop the bathroom crop leaving the room; see above.
 */
const PROMPT = [
  "The camera is almost still. Over the whole shot it eases forward only very slightly, a slow and barely perceptible drift, as if on a tripod slider moving a hand's width.",
  "The framing at the end is nearly identical to the first frame: the same things are in view, from the same position.",
  "The camera does not turn, does not pan, does not move through doorways and does not reveal anything that is not in the first frame.",
  "Nothing in the scene changes: every object, surface, fixture, plant and piece of furniture stays exactly as it is in the first frame.",
  "Nothing is added and nothing is removed. No new people, no animals, no text or logos added.",
  "The lighting and the view through any windows stay the same.",
  "Quiet, no speech, no music.",
].join(" ");

export interface CinematicClip {
  /** Signed URL of the MP4. Short-lived: download it straight away. */
  url: string;
  /** How long the clip runs. */
  seconds: number;
}

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not set");
  return key;
}

/** The photo, cut to the reel's shape and small enough to send inline. */
async function firstFrame(photoUrl: string, shape: CinematicShape): Promise<string> {
  const res = await fetch(photoUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`photo download HTTP ${res.status}`);
  const { width, height } = FRAME[shape];
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate() // honour the phone's orientation flag before cropping
    .resize({ width, height, fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();
  return jpeg.toString("base64");
}

async function generateOnce(image: string, seconds: number): Promise<CinematicClip> {
  const headers = { "x-api-key": apiKey(), "Content-Type": "application/json" };
  const create = await fetch(`${API}/v3/models/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      mode: "image_to_video",
      prompt: PROMPT,
      image: { type: "base64", media_type: "image/jpeg", data: image },
      duration: seconds,
      resolution: "768p",
      prompt_enhancement: "disabled",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const created = await create.json().catch(() => null);
  const id = created?.data?.video_id as string | undefined;
  if (!create.ok || !id) {
    throw new Error(`not accepted (HTTP ${create.status}) ${JSON.stringify(created ?? {}).slice(0, 200)}`);
  }

  const deadline = Date.now() + CLIP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const r = await fetch(`${API}/v3/models/videos/${id}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const d = r ? (await r.json().catch(() => null))?.data : null;
    if (!d) continue; // a dropped poll is not a failed clip
    if (d.status === "completed" && d.video_url) {
      return { url: d.video_url as string, seconds: Number(d.duration) || seconds };
    }
    if (d.status === "failed" || d.status === "cancelled") {
      throw new Error(`${d.status}: ${d.failure_code ?? ""} ${d.failure_message ?? ""}`.trim());
    }
  }
  throw new Error("timed out");
}

/**
 * One clip per photo, in order. A photo whose clip could not be made comes back
 * as null, and the renderer shows that photo the classic way instead, so one
 * bad clip never costs the whole reel.
 *
 * Each photo gets two attempts. In testing one generation in nine failed for no
 * stated reason and succeeded unchanged the second time.
 */
export async function makeCinematicClips(
  photoUrls: string[],
  shape: CinematicShape,
  /** How long each photo is on screen. The clip is asked for at that length, within what the provider allows. */
  secondsPerPhoto: number,
): Promise<(CinematicClip | null)[]> {
  const seconds = Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_MIN_SECONDS, Math.ceil(secondsPerPhoto)));
  const out: (CinematicClip | null)[] = new Array(photoUrls.length).fill(null);
  let next = 0;

  async function worker() {
    while (next < photoUrls.length) {
      const i = next++;
      try {
        const image = await firstFrame(photoUrls[i], shape);
        try {
          out[i] = await generateOnce(image, seconds);
        } catch (first) {
          console.warn(`[cinematic] photo ${i + 1}: first try failed (${first instanceof Error ? first.message : first}), retrying`);
          out[i] = await generateOnce(image, seconds);
        }
      } catch (err) {
        console.warn(`[cinematic] photo ${i + 1}: no clip (${err instanceof Error ? err.message : err})`);
        out[i] = null;
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, photoUrls.length) }, worker));
  const made = out.filter(Boolean).length;
  console.log(
    `[cinematic] ${made}/${photoUrls.length} clips at ${seconds}s each (${shape}) in ${Math.round((Date.now() - started) / 1000)}s`,
  );
  return out;
}

/** The shape the model is asked for, from the reel's own format id. */
export function cinematicShapeFor(videoType: string): CinematicShape {
  return videoType === "reel_9x16" ? "9:16" : videoType === "short_1x1" ? "1:1" : "16:9";
}
