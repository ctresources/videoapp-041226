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
}): Promise<Buffer | null> {
  const openai = getOpenAI();
  if (!openai) {
    console.log("[openai-image] OPENAI_API_KEY not set — using gradient thumbnail background");
    return null;
  }

  const location = [opts.city, opts.state].filter(Boolean).join(", ")
    || "an aspirational American neighborhood";

  const prompt = `A scroll-stopping YouTube thumbnail background photo that looks like a real still frame captured from a real estate video shot in ${location}.

VIDEO TOPIC (visual mood only — not literal text): "${(opts.topic || "").trim().slice(0, 140)}"

Style: bright, vibrant, high-energy. EXAGGERATED saturated DEEP BLUE SKY with crisp white clouds dominating the upper frame. Punchy color grading built around TWO dominant vibrant colors — the vivid blue sky plus one warm accent (sun-lit lawns, warm brick, or golden light). Crisp daylight, high contrast, HD photographic quality.

Composition: leave the right ~40% of the frame relatively clean and uncluttered (a presenter photo will be placed there); concentrate the hero imagery in the left ~60%.

STRICT RULES:
- NO people, NO faces, NO hands.
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

export interface HookThumbnailOptions {
  hookText: string;
  city?: string;
  state?: string;
  audience?: string;
  tone?: string;
  orientation: "landscape" | "portrait" | "square";
  userId: string;
  projectId: string;
}

/**
 * Generate a thumbnail-style background image inspired by the video's hook
 * text and upload it to the public `assets` bucket. Returns the public URL,
 * or null if OPENAI_API_KEY is not configured / the request fails.
 *
 * The generated image is intentionally composed with empty space on the right
 * (landscape) or bottom (portrait) so the avatar can be cleanly composited
 * over it without obscuring the focal subject.
 *
 * The result is used as the OPENING / FIRST-FRAME background by the HeyGen
 * Video Agent — replacing the default black panel that the agent otherwise
 * renders behind the avatar in the cold-open shot.
 */
export async function generateHookThumbnail(
  opts: HookThumbnailOptions,
): Promise<string | null> {
  const openai = getOpenAI();
  if (!openai) {
    console.log("[openai-image] OPENAI_API_KEY not set — skipping thumbnail generation");
    return null;
  }

  const location = [opts.city, opts.state].filter(Boolean).join(", ")
    || "an aspirational American neighborhood";
  const tone = opts.tone || "Modern";
  const audience = opts.audience || "Mixed";
  const hook = (opts.hookText || "").trim().slice(0, 140) || "Your Local Real Estate Expert";

  const size =
    opts.orientation === "portrait" ? "1024x1536" :
    opts.orientation === "square" ? "1024x1024" :
    "1536x1024";

  const compositionDirective =
    opts.orientation === "portrait"
      ? "Leave the bottom ~40% of the frame uncluttered (a presenter will stand there); concentrate the hero imagery in the top ~60%."
      : "Leave the right ~40% of the frame relatively clean and uncluttered (a presenter will stand there); concentrate the hero imagery in the left ~60%.";

  const prompt = `A scroll-stopping editorial YouTube-thumbnail-style background for a real estate marketing video.

HEADLINE CONCEPT (visual mood, not literal text): "${hook}"
LOCATION: ${location}
AUDIENCE: ${audience}
BRAND TONE: ${tone}

Style: cinematic, premium magazine, warm natural golden-hour lighting, shallow depth of field, slightly desaturated highlights with rich shadows. Lifestyle real estate aesthetic.

Composition: ${compositionDirective}

STRICT RULES:
- NO people, NO faces, NO hands.
- NO text, NO words, NO numbers, NO letters, NO logos, NO watermarks anywhere in the image.
- NO black backgrounds, NO empty negative space, NO solid color blocks.
- NO collages, NO split panels, NO borders or frames.
- The image must be a single cohesive photographic scene that fills the entire frame edge-to-edge with believable depth and texture.

Subject matter should evoke the headline concept and location: e.g. inviting home exteriors at sunset, lush tree-lined streets, warm-lit interior glimpse through a window, aerial neighborhood vistas, etc.`;

  try {
    console.log(`[openai-image] generating thumbnail (${size}) for hook: "${hook.slice(0, 60)}..."`);
    const result = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: size as "1024x1024" | "1024x1536" | "1536x1024",
      n: 1,
    });

    const buffer = await imageBytes(result.data?.[0]);
    if (!buffer) {
      console.warn("[openai-image] no image data returned");
      return null;
    }

    const admin = createAdminClient();
    const path = `${opts.userId}/thumbnails/${opts.projectId}-${Date.now()}.png`;

    const { error } = await admin.storage.from("assets").upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) {
      console.error("[openai-image] upload error:", error.message);
      return null;
    }

    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);
    console.log(`[openai-image] thumbnail ready: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[openai-image] generation failed:", msg);
    return null;
  }
}
