import { countGemini, geminiDeleteFile, geminiJson, geminiUpload, type GeminiPart } from "@/lib/api/gemini";
import { chatText } from "@/lib/api/perplexity-chat";
import { scriptBriefGuidance } from "@/lib/api/perplexity-prompts";
import { FAIR_HOUSING_SHORT } from "@/lib/utils/fair-housing";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";

/**
 * Make one like this (2026-11-16, the owner's ask; plan in
 * docs/mockups/like-this-video-mockup.html).
 *
 * Gemini watches a video the agent loves and writes down how it is built
 * (hook, length, pace, order, tone, captions, music, shape, who is on
 * screen). Perplexity then writes a fresh script on the agent's own topic in
 * that shape. Nothing of the original is copied: not its footage, face, voice,
 * music or words.
 */

export type OnScreen = "full" | "circle" | "voice" | "self";

export interface LikeStyle {
  summary: string;
  hook: string;
  seconds: number;
  pace: string;
  order: string;
  beats: string[];
  tone: string;
  captions: string;
  music: string;
  shape: "vertical" | "horizontal";
}

export interface LikePicks {
  onScreen: OnScreen;
  shape: "reel" | "youtube";
  captions: boolean;
  music: string; // a MUSIC_PRESETS id, "none" for none
}

export const MAX_SECONDS = 180;
export const MONTHLY_READS = 20;

const MOODS = MUSIC_PRESETS.filter((m) => m.query).map((m) => `${m.id} (${m.label})`).join(", ");

/** youtube.com/watch, youtu.be and /shorts/ links, as the watch URL Gemini reads. Null for anything else. */
export function youtubeWatchUrl(link: string): string | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Watches the video and returns its style plus the settings to start from.
 * `video` is the file bytes, or a YouTube watch URL. Null if it couldn't be read.
 */
export async function readVideoStyle(video: { buf: Buffer; mime: string } | { youtube: string }):
  Promise<{ style: LikeStyle; picks: LikePicks } | null> {
  let fileName = "";
  try {
    let part: GeminiPart;
    if ("buf" in video) {
      const up = await geminiUpload(video.buf, video.mime, "like-video", 180_000);
      if (!up) return null;
      fileName = up.name;
      part = up.part;
    } else {
      part = { fileData: { fileUri: video.youtube } };
    }

    const out = await geminiJson<Record<string, unknown>>({
      parts: [
        part,
        {
          text: `A real estate agent loves this short social video and wants to make their own in the same style, on a different topic. Describe HOW it is built, not what it says.

Return ONLY JSON:
{"summary": "what kind of video it is, under 12 words",
 "hook": "how it opens in the first seconds, under 16 words",
 "seconds": total length in seconds (number),
 "pace": "how fast it moves, under 10 words",
 "order": "the parts in order joined by →, e.g. Hook → 3 numbered tips → wrap → follow ask",
 "beats": ["short name of each part in order", ...],
 "tone": "how it sounds, under 8 words",
 "captions": "how the on-screen words look, under 8 words, or None",
 "music": "the music, under 6 words, or None",
 "shape": "vertical" or "horizontal",
 "presenter": "talking_head" (a person talking to camera fills the frame most of the time), "corner" (a person small in a corner or circle over footage), "voice_over" (no person, a voice over footage or photos), or "selfie" (a person filming themselves on a phone, handheld),
 "has_captions": true or false,
 "music_mood": the closest of [${MOODS}] by id, or "none" if there is no music}

Plain words. Never quote more than a few words of what is said.`,
        },
      ],
      temperature: 0.2,
      timeoutMs: 120_000,
      label: "like-video",
    });
    if (!out) return null;
    void countGemini("like_video");

    const seconds = Math.min(MAX_SECONDS, Math.max(10, Math.round(Number(out.seconds) || 45)));
    const shape = out.shape === "horizontal" ? "horizontal" : "vertical";
    const beats = (Array.isArray(out.beats) ? out.beats : [])
      .map((b) => str(b, 40)).filter(Boolean).slice(0, 10);
    const style: LikeStyle = {
      summary: str(out.summary, 120),
      hook: str(out.hook, 160),
      seconds,
      pace: str(out.pace, 100),
      order: str(out.order, 200) || beats.join(" → "),
      beats,
      tone: str(out.tone, 80),
      captions: str(out.captions, 80) || "None",
      music: str(out.music, 60) || "None",
      shape,
    };
    const presenter = String(out.presenter ?? "");
    const mood = String(out.music_mood ?? "none");
    const picks: LikePicks = {
      onScreen: presenter === "corner" ? "circle"
        : presenter === "voice_over" ? "voice"
          : presenter === "selfie" ? "self"
            : "full",
      shape: shape === "horizontal" ? "youtube" : "reel",
      captions: out.has_captions !== false,
      music: MUSIC_PRESETS.some((m) => m.id === mood && m.query) ? mood : "none",
    };
    return { style, picks };
  } catch (e) {
    console.error("[like-video] read failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    if (fileName) void geminiDeleteFile(fileName);
  }
}

/**
 * Writes the agent's script in the video's shape. Spoken words only, one
 * paragraph per part, no closing line: the agent's own closing line from
 * Settings is added at setup, as it is for every script.
 */
export async function writeLikeScript(opts: {
  style: LikeStyle;
  topic: string;
  city?: string;
  state?: string;
  maxWords: number;
  audience?: string;
  tone?: string;
  purpose?: string;
}): Promise<{ script: string; title: string } | null> {
  const { style } = opts;
  const words = Math.min(opts.maxWords, Math.max(60, Math.round(style.seconds * 2.5)));
  const low = Math.round(words * 0.85);
  const market = [opts.city, opts.state].map((v) => (v ?? "").trim()).filter(Boolean).join(", ");
  const brief = scriptBriefGuidance({ audience: opts.audience, tone: opts.tone, purpose: opts.purpose });

  const system = `You write short spoken scripts for real estate agents' social videos. First person, the agent talking to the viewer. Only the words to be spoken: no labels, no headings, no stage directions, no emojis, no hashtags, no citations.${brief ? `\n${brief}` : ""}
${FAIR_HOUSING_SHORT}`;

  const user = `Write a script on this topic: "${opts.topic.trim()}"
${market ? `\nThe agent works in ${market}. Ground it there, unless the topic names a different place, which wins.` : ""}

Build it the same way as a video the agent loves:
- Opening: ${style.hook || "a strong hook in the first seconds"}
- Parts, in this order: ${style.order || style.beats.join(" → ") || "hook, the main points, a short wrap"}
- Pace: ${style.pace || "brisk"}
- Tone: ${style.tone || "friendly and direct"}

Rules:
- ${low}–${words} words in total. Never longer.
- One short paragraph per part, separated by a blank line.
- Short sentences that are easy to say out loud. Real, specific, useful facts; never invent numbers.
- Written fresh: do not reuse the original video's lines.
- No call to action, no "follow me", no contact details: the agent's own closing line is added after.
- On the first line, write TITLE: and a title of up to 8 words that is different from the opening sentence. Then a blank line, then the script.`;

  const text = await chatText(system, [{ role: "user", content: user }], {
    search: true,
    maxTokens: Math.min(1600, Math.round(words * 1.6) + 200),
    temperature: 0.6,
    label: "like-video-script",
  });
  if (!text) return null;

  let body = text.replace(/\[\d+(?:,\s*\d+)*\]/g, "").replace(/\*\*/g, "").trim();
  let title = "";
  const m = body.match(/^\s*TITLE:\s*(.+)\n/i);
  if (m) {
    title = m[1].replace(/^["']|["']$/g, "").trim().slice(0, 100);
    body = body.slice(m[0].length).trim();
  }
  // Labels a writer adds anyway ("Hook:", "Tip 1 —") would be spoken.
  body = body
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:hook|intro|opening|tip\s*\d+|point\s*\d+|step\s*\d+|wrap(?:-up)?|outro|ask|closing)\s*[:—–-]\s*/i, "").trim())
    .filter(Boolean)
    .join("\n\n");
  if (!body) return null;
  return { script: body, title: title || opts.topic.trim().slice(0, 100) };
}
