import type { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { chatJson } from "@/lib/api/perplexity-chat";
import { generateTwinBackdrop } from "@/lib/api/openai-image";
import { getAccessLevel, type AccessLevel } from "@/lib/access";

/**
 * Spark Podcast (2026-10-30, the owner's ask; step 1 behind the
 * "spark_podcast" switch). HeyGen's Video Podcast has no API (their support,
 * 2026-10-30), so an episode is one POST /v3/videos in studio mode: a scene
 * per turn of the conversation, the host as the agent's own avatar and voice
 * and the co-host as one of HeyGen's ready-made avatars, both on the same
 * studio set. Cutting between them reads as a two-camera podcast.
 */

type Admin = ReturnType<typeof createAdminClient>;
const HEYGEN_API = "https://api.heygen.com";
const key = () => process.env.HEYGEN_API_KEY ?? "";

export const PODCAST_FEATURE = "spark_podcast";
/** Producer and up (2026-10-30, the owner's call), and admins. */
export const PODCAST_LEVELS: readonly AccessLevel[] = ["producer", "influencer", "admin"];
export const podcastPlanOk = (p: { subscription_tier?: string | null; role?: string | null } | null) =>
  PODCAST_LEVELS.includes(getAccessLevel(p));
/** What one episode (up to 3 minutes) uses from the plan: two short videos. */
export const PODCAST_SHORT_VIDEOS = 2;
export const PODCAST_MAX_MINUTES = 3;
/** Studio mode takes at most 50 scenes. */
const MAX_TURNS = 40;

// ── Studio sets ──────────────────────────────────────────────────────────────
export const STUDIO_SETS = [
  { id: "warm", label: "Warm studio", description: "a cozy professional podcast studio with warm lamp light, a wood slat wall, acoustic panels, a shelf with plants and books, soft depth of field, no people, no microphones in the foreground, no text or logos" },
  { id: "bright", label: "Bright studio", description: "a bright modern podcast studio in white and light oak with soft daylight from a large window, acoustic panels, a green plant, clean and airy, no people, no microphones in the foreground, no text or logos" },
  { id: "office", label: "Office lounge", description: "a stylish real estate office lounge set up as a podcast set, leather chairs, warm pendant lights, a large window with a softly blurred town view, no people, no text or logos" },
] as const;
export type StudioSetId = (typeof STUDIO_SETS)[number]["id"];

/** The set's picture, made once for everyone the first time it's used. */
export async function studioSetUrl(admin: Admin, id: StudioSetId): Promise<string> {
  const set = STUDIO_SETS.find((s) => s.id === id) ?? STUDIO_SETS[0];
  const path = `podcast-sets/${set.id}.png`;
  const url = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return url;
  const bytes = await generateTwinBackdrop({ description: set.description, orientation: "landscape" });
  if (!bytes) throw new Error("Couldn't make the studio set. Try again.");
  const { error } = await admin.storage.from("assets").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(error.message);
  return url;
}

// ── Co-hosts: HeyGen's ready-made studio avatars ────────────────────────────
export interface CoHost { id: string; name: string; image: string | null; voiceId: string; gender: string | null }
let coHostCache: { at: number; list: CoHost[] } | null = null;

export async function listCoHosts(): Promise<CoHost[]> {
  if (coHostCache && Date.now() - coHostCache.at < 6 * 3600_000) return coHostCache.list;
  const out: CoHost[] = [];
  // One look per person ("Bryce in Blue blazer", "Bryce in Grey blazer"…),
  // a blazer when there is one.
  const seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 6 && out.length < 16; page++) {
    const params = new URLSearchParams({ ownership: "public", avatar_type: "studio_avatar", limit: "50", ...(token ? { token } : {}) });
    const res = await fetch(`${HEYGEN_API}/v3/avatars/looks?${params}`, { headers: { "x-api-key": key() } }).catch(() => null);
    if (!res?.ok) break;
    const data = await res.json() as {
      data?: { id: string; name: string; preview_image_url: string | null; default_voice_id: string | null; supported_api_engines?: string[]; preferred_orientation?: string; gender?: string | null }[];
      has_more?: boolean; next_token?: string | null;
    };
    const usable = (data.data ?? []).filter((l) => l.default_voice_id && l.preview_image_url
      && (!l.supported_api_engines || l.supported_api_engines.includes("avatar_iii"))
      && (!l.preferred_orientation || l.preferred_orientation === "landscape"))
      .sort((a, b) => Number(/blazer/i.test(b.name)) - Number(/blazer/i.test(a.name)));
    for (const l of usable) {
      const person = l.name.split(/\s+in\s+|\s*\(/i)[0].trim();
      if (!person || seen.has(person.toLowerCase())) continue;
      seen.add(person.toLowerCase());
      out.push({ id: l.id, name: person.slice(0, 30), image: l.preview_image_url, voiceId: l.default_voice_id!, gender: l.gender ?? null });
      if (out.length >= 16) break;
    }
    token = data.has_more && data.next_token ? data.next_token : undefined;
    if (!token) break;
  }
  if (out.length) coHostCache = { at: Date.now(), list: out };
  return out;
}

// ── The conversation ────────────────────────────────────────────────────────
export interface Turn { speaker: "host" | "guest"; text: string }
export interface Conversation { title: string; turns: Turn[] }
export const FEELS: Record<string, string> = {
  chat: "a friendly, natural conversation between two people who like each other",
  interview: "an expert interview: the co-host asks, the host answers with specifics",
  myths: "myth vs fact: the co-host raises common beliefs, the host sets the record straight",
  qa: "listener Q&A: the co-host reads typical buyer and seller questions, the host answers",
};

export async function writeConversation(o: {
  topic: string; source?: string; minutes: number; feel: string;
  hostName: string; guestName: string; city?: string | null; state?: string | null; cta?: string | null;
}): Promise<Conversation> {
  const words = Math.round(Math.min(PODCAST_MAX_MINUTES, Math.max(1, o.minutes)) * 150);
  const market = [o.city, o.state].filter(Boolean).join(", ");
  const system = `You write short two-person video podcast episodes for a real estate agent.
HOST: ${o.hostName}, the agent${market ? ` in ${market}` : ""}. They are the expert.
CO-HOST: ${o.guestName}, a curious co-host who asks what buyers and sellers wonder about. Never an agent, never gives real estate advice.
Style: ${FEELS[o.feel] ?? FEELS.chat}.
Length: about ${words} spoken words in total, never more than ${words + 30}. ${Math.max(6, Math.round(words / 22))} to ${Math.min(MAX_TURNS, Math.round(words / 12))} turns, alternating, starting with the HOST welcoming people to the show.
Rules: spoken English, short sentences, no stage directions, no emojis, no names of data vendors, no promises of results. Facts must be general or clearly framed as typical; never invent precise statistics. Each turn under 60 words.
End with the HOST thanking the co-host and inviting viewers to reach out${o.cta ? ` with this closing line in their own words: "${o.cta.slice(0, 200)}"` : ""}.
Return ONLY JSON: {"title":"episode title under 60 characters","turns":[{"speaker":"host","text":"..."},{"speaker":"guest","text":"..."}]}`;
  const user = `Episode topic: ${o.topic}${o.source ? `\n\nBase the conversation on this material (use its facts, not its wording):\n${o.source.slice(0, 12000)}` : ""}`;
  const raw = (await openaiChatJson(system, [{ role: "user", content: user }], { label: "podcast-script", maxTokens: 3000, timeoutMs: 60_000 }))
    ?? (await chatJson(system, [{ role: "user", content: user }], { label: "podcast-script", maxTokens: 2200 }));
  return cleanConversation(raw);
}

export function cleanConversation(raw: unknown): Conversation {
  const r = (raw ?? {}) as { title?: unknown; turns?: unknown };
  const turns: Turn[] = [];
  for (const t of (Array.isArray(r.turns) ? r.turns : []) as { speaker?: unknown; text?: unknown }[]) {
    const text = typeof t.text === "string" ? t.text.replace(/\s+/g, " ").trim().slice(0, 600) : "";
    if (!text) continue;
    turns.push({ speaker: t.speaker === "guest" ? "guest" : "host", text });
    if (turns.length >= MAX_TURNS) break;
  }
  if (turns.length < 2) throw new Error("Couldn't write the conversation. Try again.");
  return { title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 80) : "Spark Podcast", turns };
}

export const wordCount = (turns: Turn[]) => turns.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);

// ── The studio-mode request ────────────────────────────────────────────────
export interface Speaker { avatarId: string; voiceId: string; removeBackground: boolean }

/** One scene per turn, the same speaker's back-to-back turns joined. */
export function studioBody(o: {
  title: string; turns: Turn[]; host: Speaker; guest: Speaker; setUrl: string;
  callbackUrl?: string; callbackId?: string;
}) {
  const merged: Turn[] = [];
  for (const t of o.turns) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === t.speaker) last.text = `${last.text} ${t.text}`;
    else merged.push({ ...t });
  }
  const background = { type: "image", source: { type: "url", url: o.setUrl } };
  return {
    type: "studio",
    title: o.title.slice(0, 100),
    aspect_ratio: "16:9",
    resolution: "1080p",
    // The sidecar only: captions are burned in our own style when it's stored.
    caption: { file_format: "srt" },
    ...(o.callbackUrl && { callback_url: o.callbackUrl }),
    ...(o.callbackId && { callback_id: o.callbackId }),
    scenes: merged.slice(0, 50).map((t) => {
      const s = t.speaker === "host" ? o.host : o.guest;
      return {
        type: "avatar_video",
        input: {
          type: "avatar",
          avatar_id: s.avatarId,
          voice_id: s.voiceId,
          script: t.text,
          // Avatar III, the owner's standing choice for cost (2026-10-20).
          engine: { type: "avatar_iii" },
          ...(s.removeBackground && { remove_background: true, background }),
        },
      };
    }),
  };
}

/** Submits the episode; returns HeyGen's video_id. */
export async function submitStudioVideo(body: Record<string, unknown>, idempotencyKey: string): Promise<string> {
  const res = await fetch(`${HEYGEN_API}/v3/videos`, {
    method: "POST",
    headers: { "x-api-key": key(), "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[podcast] studio submit ${res.status}: ${text.slice(0, 400)}`);
  if (!res.ok) throw Object.assign(new Error(`HeyGen studio video failed (${res.status}): ${text.slice(0, 300)}`), { status: res.status, body: text });
  const id = (JSON.parse(text) as { data?: { video_id?: string } }).data?.video_id;
  if (!id) throw new Error(`HeyGen studio video returned no video_id: ${text.slice(0, 200)}`);
  return id;
}
