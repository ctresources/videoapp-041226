import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
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
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      n: 1,
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return null;
    return Buffer.from(b64, "base64");
  } catch (err) {
    console.error("[openai-image] thumbnail background failed:", err instanceof Error ? err.message : err);
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
      model: "gpt-image-1",
      prompt,
      size: size as "1024x1024" | "1024x1536" | "1536x1024",
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      console.warn("[openai-image] no image data returned");
      return null;
    }

    const buffer = Buffer.from(b64, "base64");
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
