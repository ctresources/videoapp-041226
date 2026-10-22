/**
 * Background music presets shared by the video editor (rerender) and the
 * create flow.
 *
 * Each preset carries a semantic search query for HeyGen's licensed music
 * catalog (GET /v3/audio/sounds). Selecting a preset resolves the query to a
 * fresh track URL via /api/music/search (catalog URLs are pre-signed and
 * expire after ~7 days, so they cannot be hardcoded here — the previous
 * hardcoded mixkit URLs had gone 403 and never produced music at all).
 *
 * The chosen track is NOT sent to HeyGen — the Video Agent rejects audio
 * attachments ("does not support asset type 'audio'"). Instead the track URL
 * is stored on the video row and mixed under the voiceover with ffmpeg when
 * the finished render is stored (see lib/utils/mix-music.ts).
 */
export interface MusicPreset {
  id: string;
  label: string;
  emoji: string;
  /** Catalog search query; null for "none" and the custom-upload trigger. */
  query: string | null;
}

export const MUSIC_PRESETS: MusicPreset[] = [
  { id: "none",       label: "No Music",          emoji: "🔇", query: null },
  { id: "corporate",  label: "Upbeat Corporate",   emoji: "💼", query: "upbeat corporate motivational background music" },
  { id: "inspiring",  label: "Inspiring",          emoji: "🌅", query: "inspiring uplifting cinematic background music" },
  { id: "jazz",       label: "Smooth Jazz",        emoji: "🎷", query: "smooth jazz ambient background music" },
  { id: "motivate",   label: "Motivational",       emoji: "🔥", query: "energetic motivational driving background music" },
  { id: "luxury",     label: "Luxury / Elegant",   emoji: "✨", query: "elegant luxury cinematic background music" },
  // Calm Piano out, three upbeat and inspiring in (2026-10-21, the owner's ask).
  { id: "bright",     label: "Bright & Hopeful",   emoji: "☀️", query: "bright hopeful uplifting acoustic background music" },
  { id: "feelgood",   label: "Feel-Good Pop",      emoji: "🎉", query: "happy upbeat feel good pop background music" },
  { id: "anthem",     label: "Big Moment",         emoji: "🚀", query: "uplifting energetic inspirational anthem background music" },
  { id: "custom",     label: "Upload my music",    emoji: "⬆️", query: null },
];

/**
 * Prompt fragment used when the user picked a music track: the agent must NOT
 * add its own soundtrack, or the post-render mix would layer two tracks.
 */
export const MUSIC_PROMPT_INSTRUCTION = `=====================================
BACKGROUND MUSIC
=====================================
- Do NOT add any background music or soundtrack of your own — the user's chosen music track is mixed in after rendering.
- Keep the rendered audio clean: voiceover only.

`;
