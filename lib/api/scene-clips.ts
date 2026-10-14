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
export const SCENES_MAX = 24;
/**
 * The longest narration a Scenes reel takes. Three minutes, since the reel is
 * built after the reply has gone and no page has to stay open for it.
 */
export const SCENES_MAX_SECONDS = 180;
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
 * What is said of every scene, after the one or two sentences that say what
 * it is of: the limits, which never change.
 *
 * The place, the camera and the light used to be in here too, the same three
 * sentences on every clip, and a three-minute reel came back as one grey and
 * brick house seen from across the street eighteen times in twenty-one (the
 * owner, 2026-10-10: "not enough variety, same background"). Every clip was
 * told what a house looks like, so every clip had that house in it, through a
 * window if it was indoors. Those three are chosen for each scene now; see
 * placeFor, SHOTS and LIGHTS.
 */
const LOOK = [
  "Fine film grain, true-to-life colour, no teal-orange grade, no glamour lighting, real textures and materials.",
  "One clear subject, simple uncluttered frame, natural physical motion only.",
  "No people at all: no faces, no hands, no figures, no silhouettes, no reflections of people.",
  "No logos, brand names, printed words, numbers, signs, house numbers, licence plates or badges anywhere in frame.",
  "Not a real, identifiable place or landmark.",
  "Audio: quiet natural room tone or light outdoor ambience only. No speech. No music.",
].join(" ");

/**
 * How a scene is framed. The planner names one for each scene; a scene with
 * none is given one in turn.
 */
const SHOTS = {
  wide: "24mm at T4, a wide shot that takes in the whole space, with a very slow push in.",
  medium: "35mm at T2.8, locked off on a tripod with a very slow push in.",
  close: "85mm at T2, close on the subject so that it fills the frame, the background soft and out of focus, with a very slow slide to one side.",
  detail: "100mm macro at T2.8, a very close view of the one detail, shallow focus, almost still.",
  overhead: "35mm at T2.8, looking straight down from directly above, locked off.",
  low: "28mm at T2.8, from low down near the ground or the surface and looking slightly up, with a slow move forward.",
} as const;
type Shot = keyof typeof SHOTS;
/** The ones that suit any description, for a scene whose planner did not say. */
const SHOTS_IN_TURN: Shot[] = ["medium", "close", "wide", "low"];

/** What a scene is lit by. Named by the planner too. */
const LIGHTS = {
  morning: "Low, warm early-morning sun with long soft shadows.",
  midday: "Bright, clear daylight.",
  overcast: "Soft, even overcast daylight.",
  golden: "Late-afternoon golden light, warm and low.",
  dusk: "Dusk: blue evening light outdoors, warm lamps on indoors.",
} as const;
type Light = keyof typeof LIGHTS;
const LIGHTS_IN_TURN: Light[] = ["overcast", "morning", "midday", "golden", "dusk"];

/**
 * A different house each time one is shown.
 *
 * It still has to be said what a house is: asked for "an ordinary suburban
 * house" with nothing more, the model drew a British one (see the top of this
 * file). So it is said, but only on a scene that has a house in it, and not
 * the same one twice.
 */
const HOUSES = [
  "a white two-storey colonial with dark shutters and a centred front door",
  "a single-storey ranch with tan horizontal siding and a low roof",
  "a craftsman bungalow painted sage green, with a deep covered front porch",
  "a two-storey red-brick home with a covered entry",
  "a blue-grey cape cod with dormer windows and white trim",
  "a white board-and-batten farmhouse-style home with a dark metal porch roof",
  "a stone-and-stucco home with an arched entry",
  "a split-level with cream siding and a brick lower storey",
];
/**
 * A scene with the outside of a home in it. "Home" alone is not one: a home
 * office is a room. Nor is a front door or an entryway, which is as often
 * seen from indoors, and given a house to show put the one opposite in the
 * doorway.
 */
const SHOWS_A_HOUSE = /\b(houses?|street|neighbou?rhood|driveway|porch|yard|lawn|curb|kerb|roof|gutters?|garage|exterior|facade|cul-de-sac|sidewalk|pavement)\b/i;

function placeFor(description: string, houseNumber: number): string {
  return SHOWS_A_HOUSE.test(description)
    ? `This is in the United States. Any house is an American single-family home: ${HOUSES[houseNumber % HOUSES.length]}, with a pitched shingle roof and a driveway.`
    // Nothing about houses, or one turns up through the window.
    : "This is in the United States; any room has American fixtures and outlets. A window or open door in frame shows only sky, trees or soft light, never a building or a street.";
}

/**
 * The planner's choice of shot and light travels at the front of its
 * description, as "[close/dusk] A hand turns...", so that a plan is still a
 * list of strings to everything that passes one along.
 */
const TAG = /^\s*\[\s*([a-z]+)\s*\/\s*([a-z]+)\s*\]\s*/i;

interface Shoot { description: string; shot: Shot; light: Light; place: string }

/**
 * Settles how each scene is shot: the planner's choice where it made one, the
 * next in turn where it did not, and never the same framing twice running.
 */
function shootingPlan(scenes: string[]): Shoot[] {
  const out: Shoot[] = [];
  let houses = 0;
  scenes.forEach((raw, i) => {
    const m = raw.match(TAG);
    const description = m ? raw.slice(m[0].length) : raw;
    const asked = m?.[1]?.toLowerCase() as Shot | undefined;
    const lit = m?.[2]?.toLowerCase() as Light | undefined;
    let shot: Shot = asked && asked in SHOTS ? asked : SHOTS_IN_TURN[i % SHOTS_IN_TURN.length];
    const before = out[i - 1]?.shot;
    if (shot === before) {
      shot = SHOTS_IN_TURN.find((x) => x !== before && x !== out[i - 2]?.shot) ?? shot;
    }
    const light: Light = lit && lit in LIGHTS ? lit : LIGHTS_IN_TURN[i % LIGHTS_IN_TURN.length];
    const place = placeFor(description, houses);
    if (SHOWS_A_HOUSE.test(description)) houses++;
    out.push({ description, shot, light, place });
  });
  return out;
}

/** The whole prompt for one clip. */
function promptFor(s: Shoot, look: SceneLook): string {
  const limits = look === "behind-speaker" ? LOOK_BEHIND_SPEAKER : look === "distant-people" ? LOOK_DISTANT_PEOPLE : LOOK;
  return `${s.description} ${s.place} Shot on an ARRI Alexa Mini LF, ${SHOTS[s.shot]} ${LIGHTS[s.light]} ${limits}`;
}

/**
 * The same look, for a background that has to show what is being talked
 * about, which is often someone doing something.
 *
 * The owner's choice (2026-10-09), made for the scenes behind an avatar
 * video: people may appear, from behind or at a distance, never a face. The
 * line about who they are is the fair-housing one. A scene that describes its
 * people is choosing them, and nothing here should.
 */
const LOOK_DISTANT_PEOPLE = LOOK
  .replace(
    "No people at all: no faces, no hands, no figures, no silhouettes, no reflections of people.",
    "Any person is seen only from behind or at a distance, at work or walking away, never posed: no face turned towards the camera, no close-up of a face, no eye contact. " +
    "Any phone, laptop or camera screen shows only a soft glow or blurred shapes, never words, pictures of people or an interface.",
  )
  + " One continuous shot: no cuts, no dissolves, no change of scene.";

/**
 * And for a picture with the speaker over it: behind an avatar video they sit
 * in a circle in the bottom right corner. A Scenes reel has nobody there.
 */
const LOOK_BEHIND_SPEAKER = LOOK_DISTANT_PEOPLE
  + " Compose with the subject in the left two thirds of the frame; the bottom right corner will be covered, so nothing important is there.";

/** Which of these a clip is shot in. */
export type SceneLook = "no-people" | "distant-people" | "behind-speaker";

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
- No two scenes alike, and no two next to each other in the same kind of place. At most one in three is the outside of a house; the rest are rooms, and details and objects seen close.
- Do not say what colour a house is or what it is built of.`;

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

/**
 * One picture for each stretch of narration, showing what that stretch is
 * about.
 *
 * planScenes above is for a reel about property and keeps to homes. This one
 * is for the background behind someone talking, where the subject is whatever
 * they are talking about: a script about making content was getting a porch
 * and a kitchen, because rooms were all the planner was allowed.
 *
 * Returns exactly one description per beat, or nothing at all if the planner
 * could not be reached, so the caller can fall back rather than show pictures
 * that were not chosen for these words.
 */
export async function planScenesForBeats(beats: string[]): Promise<string[]> {
  const n = beats.length;
  if (n === 0) return [];
  const system = `You choose the pictures for a short video made by a real-estate professional, who narrates it. Their narration is below, cut into ${n} numbered parts. While each part is spoken, one short clip plays. For each part, describe what that clip shows.

Return ONLY a JSON object: {"scenes": ["...", "..."]} with exactly ${n} strings, one per numbered part, in order.

Every string begins with a tag in square brackets naming the shot and the light, then the description:
"[close/morning] A hand turns a brass key in a front door lock."
- shot is one of: wide (the whole room or place), medium (one thing in its setting), close (one object filling the frame, background soft), detail (a very close view of one small thing), overhead (straight down onto a table, desk or counter), low (from near the ground or the surface).
- light is one of: morning, midday, overcast, golden, dusk.

The rule that matters most: each clip shows THE THING THAT PART IS ABOUT. Read the part, decide what a viewer should be looking at while hearing it, and describe that. If the part is about recording a video, show a phone on a tripod. If it is about not having time, show a full desk and a clock. If it is about a house, a kitchen or a street, show that. Do not default to rooms and houses: show a home only when the part is about homes or places.

After the tag, one or two plain sentences, at most 40 words, describing ONE simple scene a camera could be pointed at.

The second rule: THE PICTURES MUST KEEP CHANGING. A viewer shown the same kind of picture twice stops watching.
- Show the particular thing the part names, not the general subject of the video. In a video about selling a house, a part about the furnace shows a hand sliding a filter into a furnace, a part about lighting shows a finger on a light switch, a part about first impressions shows a doormat and a pair of boots. It does not show the house again.
- The outside of a house: in at most one part in four, never in two parts running, and never seen through a window or a doorway from indoors.
- No two parts running share a setting (the same room, the same desk, the same street) or a shot. Use every shot at least once when there are six parts or more, and make about half of all parts close or detail.
- Change the light too: not the same light in more than two parts running. Use dusk where lamps or lit windows are the point.
- If the narration is about a season or a kind of weather, name it in the words of every description where the outdoors can be seen at all, through a window included ("on a winter day", "bare trees outside"). Do not mix snow with green summer lawns.
- A hallway, entryway or front door seen from indoors has its door closed.
- Do not say what colour a house is or what it is built of; that is chosen for you.

What may appear:
- The tools and places of the work: a phone on a tripod, a ring light, a microphone, a laptop, a notebook, a calendar, a desk, a front door with a lockbox, house keys, a doormat, moving boxes, a car in a driveway.
- People, but only from behind or at a distance: someone at a desk seen over their shoulder, hands holding a phone, a figure walking up a path. Never a face towards the camera.
- Homes, rooms and streets, when the part is about them: a generic American home or neighbourhood.

Hard limits, every scene:
- Never describe who a person is: no age, race, ethnicity, gender, family, religion or disability. Say "a person" or "someone" and nothing more about them.
- No readable words or numbers anywhere: no signs of any kind (no yard sign, no for-sale sign, no sign post, no street sign), no documents you could read, no charts, no price tags, no house numbers. Screens show only a soft glow or blurred shapes.
- No brands, logos or app interfaces. Do not show or name the product being talked about.
- No real, nameable place, building or landmark, even if the narration names a town. Not a specific property.
- No two scenes alike.`;

  let out: Record<string, unknown> | null = null;
  try {
    out = await chatJson(
      system,
      [{ role: "user", content: `NARRATION:\n${beats.map((b, i) => `${i + 1}. ${b.slice(0, 400)}`).join("\n")}` }],
      // Room for 24 of them, and warmer than it was: the cooler it ran, the
      // more often it chose the same picture.
      { maxTokens: 2400, temperature: 0.6, label: "scene-plan-beats" },
    );
  } catch (err) {
    console.warn("[scenes] beat plan failed:", err instanceof Error ? err.message : err);
    return [];
  }
  const raw = Array.isArray(out?.scenes) ? (out!.scenes as unknown[]) : [];
  const scenes = raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 12)
    .map((x) => x.trim().slice(0, 400));
  // One per beat or it is not a plan for these beats.
  return scenes.length === n ? scenes : [];
}

/** Marks a refusal because HeyGen is running its ten jobs, with the wait it asked for. */
const AT_CAPACITY = "AT_CAPACITY:";

async function generateOnce(prompt: string, seconds: number, aspect: SceneAspect, giveUpAt: number): Promise<SceneClip> {
  const headers = { "x-api-key": apiKey(), "Content-Type": "application/json" };
  const create = await fetch(`${API}/v3/models/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      mode: "text_to_video",
      prompt,
      duration: seconds,
      resolution: "768p",
      aspect_ratio: aspect,
      // Written out in full above, and meant to be followed as written.
      prompt_enhancement: "disabled",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  // HeyGen's ten jobs are all taken: a place in a queue, not a failed scene.
  if (create.status === 429) {
    throw new Error(`${AT_CAPACITY}${Number(create.headers.get("retry-after")) || 15}`);
  }
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
  /** One length for every clip, or a length for each. */
  secondsEach: number | number[],
  aspect: SceneAspect,
  giveUpAt: number,
  look: SceneLook = "no-people",
  /**
   * How many to make at once. Fewer when videos are waiting in line
   * (lib/video/render-queue), so scenes leave HeyGen's slots for them.
   */
  concurrency: number = CONCURRENCY,
): Promise<(SceneClip | null)[]> {
  const clamp = (v: number) => Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_MIN_SECONDS, Math.ceil(v)));
  const lengths = scenes.map((_, i) => clamp(Array.isArray(secondsEach) ? (secondsEach[i] ?? CLIP_MIN_SECONDS) : secondsEach));
  const seconds = Array.isArray(secondsEach) ? Math.round(lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length)) : lengths[0] ?? CLIP_MIN_SECONDS;
  const out: (SceneClip | null)[] = new Array(scenes.length).fill(null);
  // Settled for the whole reel before any is made, so that which house and
  // which framing a scene gets does not depend on the order they come back.
  const shoots = shootingPlan(scenes);
  console.log(`[scenes] shots: ${shoots.map((x) => `${x.shot}/${x.light}`).join(", ")}`);
  let next = 0;

  async function worker() {
    while (next < scenes.length) {
      const i = next++;
      for (let attempt = 1; attempt <= 2 && !out[i]; attempt++) {
        // Not worth starting a clip there is no time to wait for.
        if (giveUpAt - Date.now() < 20_000) break;
        try {
          out[i] = await generateOnce(promptFor(shoots[i], look), lengths[i], aspect, giveUpAt);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith(AT_CAPACITY)) {
            // HeyGen is full: wait the time it asked for and ask again, which
            // does not use up a try. It used to count as one, so two refusals
            // in a row lost the scene while the clock still had minutes on it.
            const wait = Math.min(Number(msg.slice(AT_CAPACITY.length)) || 15, 30) * 1000;
            if (giveUpAt - Date.now() - wait < 20_000) break;
            await new Promise((r) => setTimeout(r, wait));
            attempt -= 1;
            continue;
          }
          console.warn(`[scenes] scene ${i + 1}, try ${attempt}: ${msg}`);
        }
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, scenes.length)) }, worker));
  console.log(
    `[scenes] ${out.filter(Boolean).length}/${scenes.length} clips at ${Array.isArray(secondsEach) ? "about " : ""}${seconds}s each in ${Math.round((Date.now() - started) / 1000)}s`,
  );
  return out;
}
