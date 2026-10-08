import { chatJson } from "@/lib/api/perplexity-chat";

/**
 * Scenes for a reel that has no photos: the pictures are made from the script.
 *
 * The Cinematic reel moves a photograph the agent supplied. This makes the
 * picture itself, a few seconds at a time, from a description of what should
 * be on screen while each part of the narration is spoken. Same model, in its
 * text-to-video mode.
 *
 * What a first test of six clips found (2026-10-08), and what each became:
 *
 * - Asked for "an ordinary suburban house", it drew a British one: a
 *   semi-detached, pebble-dashed, with a letterbox in the door. So every scene
 *   is told outright that it is in the United States, in words about the
 *   building, because "suburban" is not a country.
 * - Six sent at once: three refused and one hung for six minutes. Two at a
 *   time, all four came back. So a few at a time, a deadline on each, and a
 *   second try, as the Cinematic clips already do.
 * - A reference image of a logo was refused three times running. Nothing here
 *   sends one.
 *
 * Nothing in a scene is checked against a source, because there is no source:
 * it is an invented picture, and is labelled as one (ai-made.ts). What keeps
 * it honest is what it is not allowed to show. No people, because an invented
 * resident in a neighbourhood scene is a statement about who lives there. No
 * lettering, no real place, no particular property.
 */

const API = "https://api.heygen.com";
const MODEL = "heygen-video-1";

/** Fewer than this is not a reel, and is not charged for. */
export const SCENES_MIN = 3;
export const SCENES_MAX = 8;
/** The longest narration a Scenes reel takes. */
export const SCENES_MAX_SECONDS = 60;
/** The provider makes clips of 5 to 15 seconds; past 10 a scene starts to wander. */
const CLIP_MIN_SECONDS = 5;
const CLIP_MAX_SECONDS = 10;

const CONCURRENCY = 4;
const CLIP_TIMEOUT_MS = 80_000;
const POLL_MS = 3_000;

export type SceneAspect = "9:16" | "16:9" | "1:1";

export interface SceneClip {
  /** Signed URL of the MP4. Short-lived: download it straight away. */
  url: string;
  seconds: number;
  width: number;
  height: number;
}

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not set");
  return key;
}

/**
 * How every scene is shot, and what none of them may contain. Appended to the
 * one or two sentences that say what the scene is of.
 */
const LOOK = [
  "This is in the United States. Any house is a typical American single-family home with horizontal siding or brick, a pitched shingle roof, a driveway and a lawn; any room has American fixtures and outlets.",
  "Shot on an ARRI Alexa Mini LF, 35mm at T2.8, locked off on a tripod with a very slow push in.",
  "Soft natural daylight. Fine film grain, true-to-life muted colour, no teal-orange grade, no glamour lighting, real textures and materials.",
  "One clear subject, simple uncluttered frame, natural physical motion only.",
  "No people at all: no faces, no hands, no figures, no silhouettes, no reflections of people.",
  "No logos, brand names, printed words, numbers, signs, house numbers, licence plates or badges anywhere in frame.",
  "Not a real, identifiable place or landmark.",
  "Audio: quiet natural room tone or light outdoor ambience only. No speech. No music.",
].join(" ");

/** Used when the planner cannot be reached. Plain, safe, and true of any market. */
const STOCK_SCENES = [
  "The front of a tidy house with a freshly painted front door, potted plants either side of the step, and a few leaves drifting across the path.",
  "A set of plain house keys on a simple metal ring resting on a clean kitchen counter, morning light moving slowly across it.",
  "A bright, empty living room with hardwood floors and tall windows, sunlight falling in long shapes across the floor.",
  "A stack of sealed plain cardboard moving boxes in an empty bedroom, a window open and a curtain moving gently.",
  "A clean modern kitchen with a kettle steaming on the stove and a bowl of fruit on the island.",
  "A quiet tree-lined residential street seen from the pavement, leaves moving in a light breeze, no cars.",
  "A back garden with a wooden deck, two empty chairs and a small table, late afternoon light through the trees.",
  "A neat home office desk with a closed laptop, a plain notebook, a pen and a mug of coffee, steam rising.",
];

/**
 * One description per scene, in the order the narration is spoken.
 *
 * The planner reads the script and says what should be on screen for each part
 * of it. It is told the same limits the clips are, and they are stated again
 * on every clip, because the planner's word that a scene has no people in it
 * is not what keeps people out of it.
 */
export async function planScenes(script: string, count: number): Promise<string[]> {
  const n = Math.min(SCENES_MAX, Math.max(SCENES_MIN, Math.round(count)));
  const system = `You choose the pictures for a short real-estate video that has no footage. The narration below is read aloud while ${n} short clips play one after another. Describe what each clip shows.

Return ONLY a JSON object: {"scenes": ["...", "..."]} with exactly ${n} strings, in the order the narration is spoken, each matching the part of the narration it plays under.

Each string is one or two plain sentences, at most 40 words, describing ONE still, simple thing a camera on a tripod could be pointed at: a room, a detail in a home, an object on a surface, the outside of a house, a garden, a quiet street. Include one small natural movement (light moving, steam rising, leaves drifting, a curtain stirring).

Hard limits, every scene:
- No people, hands, faces, figures or crowds. Show the thing, not someone using it.
- Nothing with words or numbers on it: no signs, screens with text, documents you could read, price tags, charts, house numbers, licence plates.
- No brands or logos. No real, nameable place, building or landmark, even if the narration names a town.
- A generic American home or neighbourhood. Not a specific property, and nothing that claims to be the town in the narration.
- Do not illustrate a statistic with a chart. Show something ordinary that fits the subject instead.
- No two scenes alike.`;

  const out = await chatJson(system, [{ role: "user", content: `NARRATION:\n${script.slice(0, 2000)}` }], {
    maxTokens: 900,
    temperature: 0.4,
    label: "scene-plan",
  });
  const raw = Array.isArray(out?.scenes) ? (out!.scenes as unknown[]) : [];
  const scenes = raw
    .filter((s): s is string => typeof s === "string" && s.trim().length > 12)
    .map((s) => s.trim().slice(0, 400))
    .slice(0, n);
  // Short of the number asked for, or nothing at all: made up from the stock list.
  for (let i = 0; scenes.length < n; i++) scenes.push(STOCK_SCENES[i % STOCK_SCENES.length]);
  return scenes;
}

async function generateOnce(description: string, seconds: number, aspect: SceneAspect, giveUpAt: number): Promise<SceneClip> {
  const headers = { "x-api-key": apiKey(), "Content-Type": "application/json" };
  const create = await fetch(`${API}/v3/models/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      mode: "text_to_video",
      prompt: `${description} ${LOOK}`,
      duration: seconds,
      resolution: "768p",
      aspect_ratio: aspect,
      // Written out in full above, and meant to be followed as written.
      prompt_enhancement: "disabled",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const created = await create.json().catch(() => null);
  const id = created?.data?.video_id as string | undefined;
  if (!create.ok || !id) {
    throw new Error(`not accepted (HTTP ${create.status}) ${JSON.stringify(created?.error ?? created ?? {}).slice(0, 200)}`);
  }

  const deadline = Math.min(Date.now() + CLIP_TIMEOUT_MS, giveUpAt);
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

/**
 * One clip per scene, in order. A scene whose clip could not be made comes
 * back as null and is left out of the reel; the others share its time.
 *
 * Each scene gets two tries while there is time for one. `giveUpAt` is when
 * the whole request has to move on to rendering, whatever has been made: a
 * reel of six scenes that exists beats one of eight that ran out of clock.
 */
export async function makeSceneClips(
  scenes: string[],
  secondsEach: number,
  aspect: SceneAspect,
  giveUpAt: number,
): Promise<(SceneClip | null)[]> {
  const seconds = Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_MIN_SECONDS, Math.ceil(secondsEach)));
  const out: (SceneClip | null)[] = new Array(scenes.length).fill(null);
  let next = 0;

  async function worker() {
    while (next < scenes.length) {
      const i = next++;
      for (let attempt = 1; attempt <= 2 && !out[i]; attempt++) {
        // Not worth starting a clip there is no time to wait for.
        if (giveUpAt - Date.now() < 20_000) break;
        try {
          out[i] = await generateOnce(scenes[i], seconds, aspect, giveUpAt);
        } catch (err) {
          console.warn(`[scenes] scene ${i + 1}, try ${attempt}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));
  console.log(
    `[scenes] ${out.filter(Boolean).length}/${scenes.length} clips at ${seconds}s each in ${Math.round((Date.now() - started) / 1000)}s`,
  );
  return out;
}
