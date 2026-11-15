import { perplexityChat } from "@/lib/api/perplexity";

/**
 * What a piece of work should be a picture OF.
 *
 * Both image paths only ever knew a template or a title and the market — so
 * every blog header and every video thumbnail came out a house, whatever the
 * piece was about. Probate, rates, school catchments, when to downsize: all
 * the same sunlit colonial, because the only subject either prompt had was the
 * one baked into it.
 *
 * An image model cannot read an article and decide what to show; it draws the
 * nouns it is given. So a cheap text pass reads the piece and writes the one
 * sentence a photographer would be briefed with, and that becomes the subject.
 *
 * Deliberately a suggestion, not a decision: what this returns is put in front
 * of the agent in the Describe box, where a word can be changed before another
 * background is made.
 */
export async function photoBriefFor(opts: {
  /** The headline or video title — what this piece is called. */
  headline: string;
  /** The article or script, as much of it as matters. Trimmed here. */
  body?: string;
  city?: string;
  state?: string;
  /**
   * Where the picture goes. A thumbnail is glanced at on a phone and has a
   * cutout standing in it; an article header is looked at. Same subject, two
   * different photographs of it.
   */
  kind?: "article" | "thumbnail";
  /** Thumbnails only: this agent's last few scenes, so the next one differs. */
  recentScenes?: string[];
}): Promise<string | null> {
  const headline = opts.headline.trim();
  if (!headline) return null;
  const where = [opts.city, opts.state].filter(Boolean).join(", ");

  try {
    const thumb = opts.kind === "thumbnail";
    if (thumb) return await thumbnailBrief(headline, opts.body || "", where, opts.recentScenes ?? []);
    // Enough to know what the piece is about. The opening carries the subject;
    // the rest is detail that would only crowd the brief.
    const body = (opts.body || "").replace(/\s+/g, " ").trim().slice(0, 900);
    const raw = await perplexityChat([
      {
        role: "system",
        content: thumb
          ? "You brief photographers for video thumbnails. You answer with one concrete scene and nothing else. Return only valid JSON."
          : "You brief photographers for editorial article headers. You answer with one concrete scene and nothing else. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Describe the photograph that should ${thumb ? "sit behind the title of this video" : "head this article"}.

${thumb ? "TITLE" : "HEADLINE"}: "${headline}"
${body ? `OPENING: "${body}"\n` : ""}${where ? `PLACE: ${where}\n` : ""}
RULES:
- One sentence, under 25 words, describing a single real scene a photographer could shoot.
- It must be about what the ${thumb ? "VIDEO" : "ARTICLE"} is about. Do not default to a house exterior unless it is genuinely about buying, selling or touring a property.
${thumb ? "- It will be seen small and scrolled past: one clear subject, strong shapes, nothing fussy or crowded." : ""}
- Concrete nouns and light, no abstractions: "a kitchen table with a calculator, spread paperwork and a cooling mug in morning light", not "financial planning".
- No text, signs, logos or readable writing in the scene.
- No faces. ${thumb ? "No people at all — a cutout of the presenter is composited into this frame." : "People may appear only from behind, at a distance, or cropped below the chin."}

Return ONLY this JSON: {"scene": "YOUR SENTENCE"}`,
      },
    ], "sonar");
    return sceneFrom(raw);
  } catch (err) {
    // Not fatal, and not worth a retry: the caller falls back to the headline
    // itself as the subject, which is still the article rather than a house.
    console.error("[photo-brief] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function sceneFrom(raw: string): string | null {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const { scene } = JSON.parse(text) as { scene?: string };
  const out = scene?.trim();
  return out ? out.slice(0, 300) : null;
}

/**
 * Thumbnail scenes (2026-11-15, the owner's ask: more variety, and the picture
 * must match what the script talks about).
 *
 * Of 30 recent thumbnails, 17 were a kitchen table or a desk with the same
 * props, nearly all in morning light. Two causes: the brief saw only the
 * first 900 characters, so most of what a video covers never reached it, and
 * its one example ("a kitchen table with a calculator… a cooling mug in
 * morning light") was being copied. Now it reads the whole script and names
 * the most specific thing in it; variety only changes how that is shot.
 */
const LIGHTS: { name: string; seen: RegExp }[] = [
  { name: "golden hour, low warm sun", seen: /golden|sunset|late[- ]afternoon/i },
  { name: "soft overcast light", seen: /overcast|cloud/i },
  { name: "bright midday sun", seen: /midday|noon/i },
  { name: "dusk, deep blue sky with warm lights glowing", seen: /dusk|twilight|evening|night|blue hour/i },
  { name: "clear early-morning light", seen: /morning|sunrise|dawn/i },
];
const ANGLES = [
  "wide, from across the street or room",
  "close-up of one telling detail",
  "from above, looking down",
  "low angle, looking up",
  "eye level, straight on",
];

async function thumbnailBrief(headline: string, script: string, where: string, recent: string[]): Promise<string | null> {
  const body = script.replace(/\s+/g, " ").trim().slice(0, 4000);
  const last = recent.map((s) => s.trim()).filter(Boolean).slice(0, 8);
  // A light none of the last three used, then any angle: the writer may
  // override either when the script needs it (snow at night, say).
  const fresh = LIGHTS.filter((l) => !last.slice(0, 3).some((s) => l.seen.test(s)));
  const pool = fresh.length ? fresh : LIGHTS;
  const light = pool[Math.floor(Math.random() * pool.length)].name;
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

  const raw = await perplexityChat([
    {
      role: "system",
      content: "You brief photographers for video thumbnails. You answer with one concrete scene and nothing else. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Describe the photograph that should sit behind the title of this video.

TITLE: "${headline}"
${body ? `SCRIPT: "${body}"\n` : ""}${where ? `PLACE: ${where}\n` : ""}
RULES:
- Matching the script comes first; variety second. Someone who reads the title and sees the picture should think "yes, that's what this video is about".
- Read the whole script. Picture the most specific, visual thing it actually talks about: a place it names, a feature of a home, a problem, an event, a season, or the tool it is about. Name that thing in the scene.
- One sentence, under 30 words, describing a single real scene a photographer could shoot.
- A house exterior only if the video is about buying, selling or touring a property.
- If the video is about an app, a website, video-making, social media, leads or online marketing, show that tool in use: a phone on a tripod filming, a ring light, a screen glowing in a real place. Put it somewhere other than a plain desk: a kitchen island in a staged home, a car dashboard mount, a front porch, a coffee shop window seat, an open-house entry.
- Otherwise no laptop, phone, screen, calculator, keys, coffee mug, paperwork or model house.
- Outdoors in the town only if the script talks about the town, and then the part of town it mentions.
- Light: ${light}. Angle: ${angle}. Change either only if the script clearly needs it.
- It will be seen small and scrolled past: one clear subject, strong shapes, nothing fussy or crowded.
- No text, signs, logos or readable writing in the scene.
- No people at all: a cutout of the presenter is composited into this frame.
${last.length ? `\nThis agent's last thumbnails. Use a different setting, main objects and light than every one of them:\n${last.map((s) => `- ${s}`).join("\n")}\n` : ""}
Examples of the range wanted (do not copy them):
- "Butler Avenue storefronts in Ambler at golden hour, seen from across the street"
- "Close-up of hairline cracks in beige stucco beside a window, soft overcast light"
- "A new cedar deck over a fenced backyard, low angle, bright midday sun"
- "A creekside park trail in autumn seen from above, clear early-morning light"
- "A snowy cul-de-sac at dusk with warm windows glowing"

Return ONLY this JSON: {"scene": "YOUR SENTENCE"}`,
    },
  ], "sonar");
  return sceneFrom(raw);
}
