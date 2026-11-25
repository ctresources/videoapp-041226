import { chatJson } from "@/lib/api/perplexity-chat";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { makeCinematicAvatarClip } from "@/lib/api/agent-opener";

/**
 * Cinematic AI Avatar (2026-11-24, the owner's ask and approved mockup:
 * docs/mockups/cinematic-ai-avatar.html). The agent's Digital Twin says each
 * line of the script in a different place: a café, a street, a kitchen.
 *
 * Each scene is one cinematic_avatar shot (the same call as the listing
 * opener, lib/api/agent-opener.ts), spoken in the twin's own linked voice.
 * The route (app/api/video/cinematic-avatar) cuts each shot where its line
 * ends and joins them.
 *
 * What the first test found (2026-11-24, three scenes on the owner's twin):
 * the face, outfit and voice held across scenes and matched the mouth, and
 * each took under a minute. A scene given more time than its line filled the
 * rest with made-up words in another language, so every shot is told to fall
 * silent after the line, and is cut where the line's last word ends.
 */

/** heygen-video-1 makes shots of 5 to 15 seconds. */
const SHOT_MIN_SECONDS = 5;
const SHOT_MAX_SECONDS = 15;
/** About how fast a twin speaks. */
const WORDS_PER_SECOND = 2.6;
/** The longest line one scene holds: 15 seconds at that pace, less a beat. */
export const MAX_LINE_WORDS = 32;
export const CINEMATIC_MAX_SCENES = 24;
export const PLACE_MAX_CHARS = 60;

export interface CinematicScene { line: string; place: string }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** A sentence too long for one scene, cut at its commas, then by length. */
function chunk(sentence: string): string[] {
  if (words(sentence).length <= MAX_LINE_WORDS) return [sentence];
  const out: string[] = [];
  let cur = "";
  for (const part of sentence.split(/(?<=[,;:—–])\s+/)) {
    const next = cur ? `${cur} ${part}` : part;
    if (words(next).length <= MAX_LINE_WORDS) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = part;
  }
  if (cur) out.push(cur);
  // A part with no comma in it that is still too long: cut by count.
  return out.flatMap((p) => {
    const w = words(p);
    if (w.length <= MAX_LINE_WORDS) return [p];
    const pieces: string[] = [];
    for (let i = 0; i < w.length; i += 26) pieces.push(w.slice(i, i + 26).join(" "));
    return pieces;
  });
}

/** Lines packed greedily up to `cap` words, keeping sentences whole. */
function pack(units: string[], cap: number, shortJoins: boolean): string[] {
  const lines: string[] = [];
  for (const u of units) {
    const last = lines[lines.length - 1];
    const lw = last ? words(last).length : 0;
    const uw = words(u).length;
    const join = last && lw + uw <= cap && (!shortJoins || lw < 5 || uw < 4);
    if (join) lines[lines.length - 1] = `${last} ${u}`;
    else lines.push(u);
  }
  return lines;
}

/**
 * The script, cut into the lines the scenes say: a sentence each, a short one
 * joined to its neighbour, a long one cut at a comma. At most 24.
 */
export function splitSceneLines(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const units = sentences.flatMap(chunk);
  let lines = pack(units, 28, true);
  if (lines.length > CINEMATIC_MAX_SCENES) lines = pack(units, MAX_LINE_WORDS, false);
  return lines.slice(0, CINEMATIC_MAX_SCENES);
}

/** How long a scene's shot is asked for: the line, and a little room after it. */
export function secondsForLine(line: string): number {
  return Math.min(SHOT_MAX_SECONDS, Math.max(SHOT_MIN_SECONDS, Math.ceil(words(line).length / WORDS_PER_SECOND + 1.5)));
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Where the line ends in a shot, in seconds, from a transcript of the shot.
 *
 * The line's last word, found nearest the place it should be (a shot that
 * added words after the line has them after it). Failing that, the word at
 * the line's length. With no transcript, the line's length at the usual pace.
 */
export function speechEnd(
  transcript: { word: string; start: number; end: number }[],
  line: string,
  shotSeconds: number,
): number {
  const lineWords = words(line).map(norm).filter(Boolean);
  const n = lineWords.length;
  const cap = (s: number) => Math.max(1, Math.min(shotSeconds, s));
  if (!transcript.length || !n) return cap(n / WORDS_PER_SECOND + 0.8);
  const last = lineWords[n - 1];
  let best = -1;
  transcript.forEach((w, j) => {
    if (norm(w.word) !== last) return;
    if (best < 0 || Math.abs(j - (n - 1)) < Math.abs(best - (n - 1))) best = j;
  });
  const j = best >= 0 ? best : Math.min(n - 1, transcript.length - 1);
  // A beat after the word, but never into a word the shot added after it.
  const next = transcript[j + 1];
  return cap(Math.min(transcript[j].end + 0.3, next ? Math.max(transcript[j].end, next.start - 0.02) : Infinity));
}

/** A place as it may be shown and sent: short, one line, no quotes. */
export function cleanPlace(place: unknown): string {
  return typeof place === "string"
    ? place.replace(/["“”<>\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, PLACE_MAX_CHARS)
    : "";
}

const STOCK_PLACES = [
  "Bright modern kitchen",
  "Tree-lined street",
  "Café by the window",
  "Home office desk",
  "Sunny front porch",
  "Living room by the window",
  "Park path",
  "Downtown main street",
];

/**
 * A place for each line, chosen to fit what it says. OpenAI first, the
 * cheaper planner as the fallback, as the b-roll planner does; with neither,
 * the stock places in turn.
 */
export async function planScenePlaces(lines: string[], town?: string | null): Promise<string[]> {
  const n = lines.length;
  if (!n) return [];
  const system = `A real estate agent records a short video in which they say each numbered line below in a different place, looking into the camera. Choose where they stand for each line.

Return ONLY a JSON object: {"places": ["...", "..."]} with exactly ${n} strings, one per line, in order.

Each place is 2 to 6 words, written like a label with a capital first letter and no full stop: "Café by the window", "Tree-lined street", "Bright modern kitchen", "Home office desk".
- Fit the line: a line about a neighborhood is on a street or in a park; about a home's kitchen, in a kitchen; about numbers or a plan, at a desk; about a first chat, in a café.
- An everyday place in the United States that a camera could film, where one person can stand and talk.
- No two lines in a row in the same kind of place, and no place used twice in one video unless there are more than 12 lines.
- Never a specific private home, a named business or a brand.${town ? ` A public place in ${town} that the line names (a park, the main street) may be named.` : ""}`;
  const turns = [{ role: "user" as const, content: lines.map((l, i) => `${i + 1}. ${l.slice(0, 300)}`).join("\n") }];
  const read = (out: Record<string, unknown> | null): string[] => {
    const raw = Array.isArray(out?.places) ? (out!.places as unknown[]) : [];
    const places = raw.map(cleanPlace).filter(Boolean);
    return places.length === n ? places : [];
  };
  let places = read(await openaiChatJson(system, turns, { maxTokens: 1500, label: "cinematic-places", timeoutMs: 60_000 }));
  if (!places.length) {
    try {
      places = read(await chatJson(system, turns, { maxTokens: 900, temperature: 0.6, label: "cinematic-places" }));
    } catch (err) {
      console.warn("[cinematic] place plan failed:", err instanceof Error ? err.message : err);
    }
  }
  return places.length ? places : lines.map((_, i) => STOCK_PLACES[i % STOCK_PLACES.length]);
}

/** Outdoors, where the twin can walk towards the camera. */
const OUTDOORS = /\b(street|sidewalk|park|path|trail|downtown|neighbou?rhood|walk|garden|yard|beach|dock|pier|market|porch|lake|river|square|plaza)\b/i;
const FRAMES_INDOORS = [
  "framed from the waist up, the camera at eye level with a slow, smooth push-in",
  "framed from the chest up, the camera almost still",
  "framed from the waist up, the camera gliding slowly to one side",
];
const FRAME_WALKING = "walking slowly toward the camera, which moves backwards in front of them, framed from the waist up";

/** The whole prompt for one scene. */
export function scenePrompt(line: string, place: string, index: number): string {
  const frame = OUTDOORS.test(place) && index % 2 === 1 ? FRAME_WALKING : FRAMES_INDOORS[index % FRAMES_INDOORS.length];
  const said = line.replace(/["“”]/g, "").trim();
  return [
    `The person from the avatar reference, the real estate agent, is in this setting: ${cleanPlace(place) || "a bright, simple room"}, in the United States. They are ${frame}.`,
    `They look straight into the camera and say: "${said}" After that line they stop talking and simply smile at the camera in silence.`,
    "Natural, realistic and cinematic. Quiet ambience, no music. They say only that line, in English. No other people speak. No text, no signs and no logos.",
  ].join(" ");
}

export interface CinematicShot { url: string; seconds: number }

/**
 * One shot per scene, a few at a time, each with two tries while there is
 * time. A scene that could not be made is null: the caller fails the video,
 * because a missing scene is a missing line of the script.
 */
export async function makeCinematicShots(
  scenes: CinematicScene[],
  lookId: string,
  aspect: "16:9" | "9:16",
  giveUpAt: number,
  concurrency: number,
  onShot?: (i: number, shot: CinematicShot) => Promise<boolean>,
): Promise<(CinematicShot | null)[]> {
  const out: (CinematicShot | null)[] = new Array(scenes.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < scenes.length) {
      const i = next++;
      for (let attempt = 1; attempt <= 2 && !out[i]; attempt++) {
        const left = giveUpAt - Date.now();
        if (left < 40_000) break;
        const shot = await makeCinematicAvatarClip({
          lookId,
          prompt: scenePrompt(scenes[i].line, scenes[i].place, i),
          aspect,
          seconds: secondsForLine(scenes[i].line),
          timeoutMs: Math.min(150_000, left),
          title: `SparkReels cinematic scene ${i + 1}`,
          label: `cinematic scene ${i + 1}`,
        });
        if (shot && "busy" in shot) {
          // HeyGen is full: wait what it asked and ask again, without using a try.
          const wait = Math.min(shot.busy, 30) * 1000;
          if (giveUpAt - Date.now() - wait < 40_000) break;
          await new Promise((r) => setTimeout(r, wait));
          attempt -= 1;
          continue;
        }
        // Kept only once the caller has it (downloaded, saved); otherwise tried again.
        if (shot && (!onShot || (await onShot(i, shot).catch(() => false)))) out[i] = shot;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, scenes.length)) }, worker));
  return out;
}
