import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * The image model, in one place and overridable.
 *
 * `flare` is the current generation's everyday generator — one-shot images
 * rather than the editing workflows `sunburst` is tuned for, which is exactly
 * what this file asks for three times. It also bills image output at $30 per
 * million tokens against gpt-image-1's $40.
 *
 * Env-overridable because a model name is somebody else's to retire, and a
 * redeploy is a poor way to react to that: if flare misbehaves, or something
 * newer lands, this moves without a code change. Every caller here already
 * falls back to a plain background when a request fails, so the worst case of
 * a bad value is graphics that look like they did before the key was added.
 */
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";

/**
 * The bytes of a generated image, however this model chose to return them.
 *
 * gpt-image-1 always answers with base64 inline. A different model — which the
 * variable above now makes easy to switch to — may answer with a URL instead,
 * and reading only `b64_json` would turn that into a silent fall back to a
 * plain background: the most expensive kind of bug, because it looks like the
 * feature working badly rather than not running.
 */
async function imageBytes(
  item: { b64_json?: string | null; url?: string | null } | undefined,
): Promise<Buffer | null> {
  if (!item) return null;
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url) {
    const res = await fetch(item.url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!res?.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

/**
 * Generate a bright, vibrant YouTube-thumbnail background that looks like a
 * still frame from the video. Returns the raw PNG buffer (caller composites
 * headline + headshot and uploads), or null when OPENAI_API_KEY is missing or
 * the request fails — the caller falls back to a gradient background.
 */
export async function generateThumbnailBackground(opts: {
  topic: string;
  city?: string;
  state?: string;
  /**
   * What to photograph, written from the video itself.
   *
   * Without it this fell back to the topic as "visual mood only" — an
   * instruction to ignore it as a subject — and the only concrete nouns left
   * in the prompt were a blue sky, a lawn and some brick. Every video got the
   * same house.
   */
  scene?: string;
}): Promise<Buffer | null> {
  const openai = getOpenAI();
  if (!openai) {
    console.log("[openai-image] OPENAI_API_KEY not set — using gradient thumbnail background");
    return null;
  }

  // No invented fallback. This used to default to "an aspirational American
  // neighborhood", which is a house with extra steps and was in every prompt
  // that had no market set.
  const location = [opts.city, opts.state].filter(Boolean).join(", ");
  const scene = (opts.scene || "").trim().slice(0, 300);

  const prompt = `A scroll-stopping YouTube thumbnail background photo that looks like a real still frame from a video${location ? ` shot in ${location}` : ""}.

SUBJECT: ${scene || `the subject of this video — "${(opts.topic || "").trim().slice(0, 140)}" — photographed literally, not a generic property shot`}

Style: bright, vibrant, high-energy. Punchy color grading built around TWO dominant colors with one warm accent. Crisp daylight, high contrast, HD photographic quality. If the subject is outdoors, a deep saturated sky belongs in the upper frame; if it is indoors or a close subject, light it bright and clean instead.

Composition: leave the right ~40% of the frame relatively clean and uncluttered (a presenter photo will be placed there); concentrate the hero imagery in the left ~60%. One clear subject — this is seen small, on a phone, while scrolling.

STRICT RULES:
- NO people, NO faces, NO hands. A cutout of the presenter is composited into this frame afterwards.
- NO text, NO words, NO numbers, NO letters, NO logos, NO watermarks anywhere.
- NO collages, NO split panels, NO borders or frames.
- One cohesive photographic scene that fills the entire frame edge to edge.`;

  try {
    console.log(`[openai-image] generating thumbnail background for: "${(opts.topic || "").slice(0, 60)}"`);
    const result = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: "1536x1024",
      n: 1,
    });
    return await imageBytes(result.data?.[0]);
  } catch (err) {
    console.error("[openai-image] thumbnail background failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * What each image-generator template should look like when the agent has not
 * described a scene. Also sent alongside a described one, as mood.
 */
const TEMPLATE_MOOD: Record<string, string> = {
  just_listed: "an inviting, well-lit photograph of a home's most appealing room or its exterior, the shot a listing leads with",
  open_house: "a welcoming home exterior or front entry in warm daylight, with the walkway or front door in view",
  market_update: "a wide, calm view over a residential neighborhood or a small-town main street",
  blog_header: "an editorial lifestyle photograph of a home that sets the scene for an article",
  blank: "a clean, premium real estate lifestyle photograph",
};

/**
 * A photographic background for the Spark Tools image generator. The words on
 * the finished image are drawn afterwards as real type, never by the model,
 * which is why the prompt forbids text outright: an image model misspells, and
 * a wrong price on a listing graphic is worse than no graphic.
 *
 * Returns the raw PNG, or null when OPENAI_API_KEY is missing or the request
 * fails; the caller falls back to a plain background and does not count it.
 */
export async function generateImageBackground(opts: {
  template: string;
  scene?: string;
  city?: string;
  state?: string;
  orientation: "portrait" | "landscape";
  /** 0 for the first option; anything else asks for a different take. */
  variant: number;
}): Promise<Buffer | null> {
  const openai = getOpenAI();
  if (!openai) {
    console.log("[openai-image] OPENAI_API_KEY not set — image generator using a plain background");
    return null;
  }

  const mood = TEMPLATE_MOOD[opts.template] ?? TEMPLATE_MOOD.blank;
  const scene = (opts.scene || "").trim().slice(0, 300);
  const location = [opts.city, opts.state].filter(Boolean).join(", ");

  /**
   * An article header is not a listing graphic.
   *
   * The framing and the style line both said "real estate", which dragged
   * every subject back toward property however the scene was described — ask
   * for a kitchen table of paperwork and the model still reached for the house
   * it imagined that table was in. Just Listed and Open House keep that
   * framing, because they genuinely are about a property.
   */
  const editorial = opts.template === "blog_header";

  /**
   * People, on the article side only.
   *
   * The blanket ban exists because image models ruin faces, and a warped face
   * on a listing graphic is unusable. But an empty room is the wrong picture
   * for a piece about a family deciding whether to move, and "no people at
   * all" is a good part of why these headers read as stock furniture. Faces
   * stay banned; a figure from behind or at a distance is what a magazine
   * would have shot anyway.
   */
  const peopleRule = editorial
    ? "- NO faces: people may appear only from behind, at a distance, blurred, or cropped below the chin. No close-up hands."
    : "- NO people, NO faces, NO hands.";

  const prompt = `${editorial
    ? `An editorial photograph to head an article${location ? `, set in ${location}` : ""}.`
    : `A photograph for a real estate marketing graphic${location ? ` in ${location}` : ""}.`}

SUBJECT: ${scene || mood}
MOOD: ${mood}
${opts.variant > 0 ? "Make this a clearly different take from the obvious one: another angle, another time of day, or another part of the scene.\n" : ""}
Style: natural light, true-to-life color, sharp detail, ${editorial
    ? "editorial magazine photography. Photograph the SUBJECT of the article — a house belongs in frame only if the article is about a house."
    : "professional real estate photography."} Believable, not glossy CGI.

Composition: keep the lower third calmer and less detailed, because headline text will sit over it. Keep the key subject out of the top corners.

STRICT RULES:
- NO text, words, numbers, letters, signs with writing, logos or watermarks anywhere.
${peopleRule}
- NO collages, split panels, borders or frames.
- One photographic scene that fills the frame edge to edge.`;

  try {
    console.log(`[openai-image] image generator background (${opts.template}, ${opts.orientation}, v${opts.variant})`);
    const result = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: opts.orientation === "portrait" ? "1024x1536" : "1536x1024",
      // Medium keeps a background to a few cents. The type drawn on top is what
      // has to be crisp, and that is rendered at full size afterwards.
      quality: "medium",
      n: 1,
    });
    return await imageBytes(result.data?.[0]);
  } catch (err) {
    console.error("[openai-image] image generator background failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
