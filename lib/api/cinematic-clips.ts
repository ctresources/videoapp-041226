import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * Cinematic motion for a photo reel: each photo becomes a few seconds of
 * camera movement, opening on exactly that photo.
 *
 * The rule this file exists to keep: a clip may move, but it may not show
 * anything the photograph did not. On a listing, anything else is inventing
 * part of a property.
 *
 * What testing on one real listing found (2026-10-06, 20 clips), and what each
 * finding became:
 *
 * - In the photo's own shape a slow move stayed true every time: rooms, a
 *   mirror, an exterior with a house number, staged furniture. So the photo is
 *   sent whole. It is never cut to the reel's shape first.
 * - Cut to a tall 9:16 strip first, it did not stay true. The middle of a wide
 *   bathroom photo is a door and a blank wall, and from that first frame the
 *   model left the room and drew a different one, with a dresser, a lamp and
 *   curtains. Twice, the second time under an instruction that the camera
 *   barely moves and nothing new may be shown. So an instruction is not a
 *   safeguard, and every clip is CHECKED: see stayedOnThePhoto.
 * - A move that travels outside the frame (a sideways glide) drew decking and
 *   chairs that were not there. So one move only, forwards, and gentle. The
 *   renderer plays every other clip backwards for variety, which ends on the
 *   true photo.
 * - People are redrawn: swimmers changed position and appearance. The check
 *   cannot see that (the pool clip scored 0.94), so the form warns about
 *   photos with people in them.
 *
 * Costs about $0.015 per second of clip (measured: 5 s = $0.08, 10 s = $0.15,
 * a little more for wider frames). A failed generation is not charged; a clip
 * that is made and then rejected by the check is.
 */

const API = "https://api.heygen.com";
const MODEL = "heygen-video-1";

/** The provider accepts 5 to 15 seconds. */
export const CLIP_MIN_SECONDS = 5;
/**
 * Never asked for longer than this. The longer a clip runs the further it can
 * wander, and this is also the longest the renderer will play backwards.
 */
export const CLIP_MAX_SECONDS = 8;

/** Never more than this many being made at once. */
const CONCURRENCY = 4;
/** One clip took 6 to 11 seconds in testing. This is the patience for a slow one. */
const CLIP_TIMEOUT_MS = 75_000;
const POLL_MS = 3_000;

/** Longest edge of the photo as sent. Small enough to send inline, more than the clip's 768 lines needs. */
const FIRST_FRAME_EDGE = 1536;

/**
 * How alike a clip's later frames must be to the photo it was made from.
 *
 * Both are shrunk to 32x32 greyscale and correlated. Measured on real clips:
 * the ones that stayed on their photo scored 0.66 to 1.00, and the one that
 * invented a room scored 0.29. A clip that pushed in so far it ended on a
 * single window scored 0.23 while being perfectly true, and it fails this too,
 * which is the right way round: when in doubt, the photo is shown as a photo.
 */
const MIN_SIMILARITY = 0.6;

/**
 * The instruction, sent as written (prompt_enhancement is off: the default
 * rewrites the prompt, and "change nothing" is the part that must survive).
 *
 * Deliberately almost no movement. A plain "slow push-in" ran a long way in: a
 * 10 second clip ended tight on the dining table and a tall crop of the house
 * front ended on one window.
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
  /** Its size, so the renderer can tell a wide clip from a tall one. */
  width: number;
  height: number;
  /** How like the photo its later frames are, 0 to 1. Kept for the logs. */
  similarity: number;
}

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not set");
  return key;
}

/** The whole photo, upright, at a size that can be sent inline. Never cropped. */
async function firstFrame(photoUrl: string): Promise<Buffer> {
  const res = await fetch(photoUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`photo download HTTP ${res.status}`);
  return sharp(Buffer.from(await res.arrayBuffer()))
    .rotate() // honour the phone's orientation flag
    .resize({ width: FIRST_FRAME_EDGE, height: FIRST_FRAME_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** A picture as 1,024 grey values, for comparing. Stretched, not cropped, so two shapes of the same scene still line up. */
async function fingerprint(image: Buffer): Promise<number[]> {
  const raw = await sharp(image).resize(32, 32, { fit: "fill" }).greyscale().raw().toBuffer();
  return Array.from(raw);
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  const d = Math.sqrt(sa * sb);
  return d > 0 ? s / d : 0;
}

function grabFrame(video: string, at: number, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg(video)
      .seekInput(Math.max(0, at))
      .outputOptions(["-frames:v", "1", "-q:v", "3"])
      .on("error", () => resolve(false))
      .on("end", () => resolve(true))
      .save(dest);
  });
}

/**
 * Did the clip stay on its photograph?
 *
 * Looks at the middle and the end of the clip and compares each with the photo
 * it was made from. The lower of the two is the score: a clip that wandered
 * off and came back is no better than one that wandered off and stayed.
 *
 * Returns 0 when the clip cannot be read, which fails it. A clip that cannot
 * be checked is not shown.
 */
export async function stayedOnThePhoto(clipUrl: string, photo: Buffer, seconds: number): Promise<number> {
  const dir = join(tmpdir(), `cinematic-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const res = await fetch(clipUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return 0;
    const clipPath = join(dir, "clip.mp4");
    await fs.writeFile(clipPath, Buffer.from(await res.arrayBuffer()));

    const truth = await fingerprint(photo);
    let lowest = 1;
    for (const [name, at] of [["mid", seconds / 2], ["end", seconds - 0.3]] as const) {
      const framePath = join(dir, `${name}.jpg`);
      if (!(await grabFrame(clipPath, at, framePath))) return 0;
      lowest = Math.min(lowest, correlation(truth, await fingerprint(await fs.readFile(framePath))));
    }
    return lowest;
  } catch {
    return 0;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function generateOnce(photo: Buffer, seconds: number): Promise<Omit<CinematicClip, "similarity">> {
  const headers = { "x-api-key": apiKey(), "Content-Type": "application/json" };
  const create = await fetch(`${API}/v3/models/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      mode: "image_to_video",
      prompt: PROMPT,
      image: { type: "base64", media_type: "image/jpeg", data: photo.toString("base64") },
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
      return {
        url: d.video_url as string,
        seconds: Number(d.duration) || seconds,
        width: Number(d.width) || 0,
        height: Number(d.height) || 0,
      };
    }
    if (d.status === "failed" || d.status === "cancelled") {
      throw new Error(`${d.status}: ${d.failure_code ?? ""} ${d.failure_message ?? ""}`.trim());
    }
  }
  throw new Error("timed out");
}

/** One attempt: make the clip, then make sure it is still the photo. */
async function attempt(photo: Buffer, seconds: number): Promise<CinematicClip> {
  const clip = await generateOnce(photo, seconds);
  const similarity = await stayedOnThePhoto(clip.url, photo, clip.seconds);
  if (similarity < MIN_SIMILARITY) {
    throw new Error(`left the photo (similarity ${similarity.toFixed(2)}, needs ${MIN_SIMILARITY})`);
  }
  return { ...clip, similarity };
}

/**
 * One clip per photo, in order. A photo whose clip could not be made, or whose
 * clip did not stay on the photo, comes back as null, and the renderer shows
 * that photo the classic way instead. One bad clip never costs the whole reel,
 * and never reaches it.
 *
 * Each photo gets two attempts. In testing one generation in nine failed for no
 * stated reason and succeeded unchanged the second time.
 */
export async function makeCinematicClips(
  photoUrls: string[],
  /** How long each photo is on screen. The clip is asked for at that length, within the limits above. */
  secondsPerPhoto: number,
): Promise<(CinematicClip | null)[]> {
  const seconds = Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_MIN_SECONDS, Math.ceil(secondsPerPhoto)));
  const out: (CinematicClip | null)[] = new Array(photoUrls.length).fill(null);
  let next = 0;

  async function worker() {
    while (next < photoUrls.length) {
      const i = next++;
      try {
        const photo = await firstFrame(photoUrls[i]);
        try {
          out[i] = await attempt(photo, seconds);
        } catch (first) {
          console.warn(`[cinematic] photo ${i + 1}: first try ${first instanceof Error ? first.message : first}; trying once more`);
          out[i] = await attempt(photo, seconds);
        }
      } catch (err) {
        console.warn(`[cinematic] photo ${i + 1}: shown as a still (${err instanceof Error ? err.message : err})`);
        out[i] = null;
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, photoUrls.length) }, worker));
  const made = out.filter((c): c is CinematicClip => !!c);
  console.log(
    `[cinematic] ${made.length}/${photoUrls.length} clips at ${seconds}s each in ${Math.round((Date.now() - started) / 1000)}s` +
    (made.length ? ` · similarity ${made.map((c) => c.similarity.toFixed(2)).join(", ")}` : ""),
  );
  return out;
}
