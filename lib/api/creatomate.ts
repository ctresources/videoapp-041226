/**
 * Creatomate video rendering API.
 *
 * Background modes:
 *   1. "stock-video"  — real video b-roll clips (default, via Pixabay)
 *   2. "animated"     — animated color gradient scenes (no external deps)
 *
 * All modes include:
 *   • Track-based timeline layering
 *   • Word-synced captions via transcript_source / transcript_effect
 *   • Agent headshot PiP with name badge
 *   • Logo watermark
 */

const CREATOMATE_API = "https://api.creatomate.com/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderRequest {
  template_id?: string;
  source?: Record<string, unknown>;
  modifications?: Record<string, string | number | boolean | null>;
  webhook_url?: string;
  metadata?: string;
}

export interface RenderResult {
  id: string;
  status: "planned" | "waiting" | "transcribing" | "rendering" | "succeeded" | "failed";
  progress: number | null;
  url: string | null;
  snapshot_url: string | null;
  error_message: string | null;
  metadata: string | null;
}

export type BackgroundMode = "stock-video" | "animated";

export interface VideoParams {
  title: string;
  voiceoverText: string;
  audioUrl: string;
  backgroundMode?: BackgroundMode;
  keywords?: string[];
  stockVideoUrls?: string[];    // direct MP4 URLs for stock-video mode
  primaryColor?: string;
  captionColor?: string;
  captionHighlightColor?: string;
  logoUrl?: string;
  avatarUrl?: string;
  agentName?: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function createRender(request: RenderRequest): Promise<RenderResult[]> {
  if (!process.env.CREATOMATE_API_KEY) throw new Error("CREATOMATE_API_KEY is not set");

  const res = await fetch(`${CREATOMATE_API}/renders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Video render service error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export async function getRenderStatus(renderId: string): Promise<RenderResult> {
  if (!process.env.CREATOMATE_API_KEY) throw new Error("CREATOMATE_API_KEY is not set");

  const res = await fetch(`${CREATOMATE_API}/renders/${renderId}`, {
    headers: { Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Render status check failed (${res.status})`);
  return res.json();
}

/** Clamp script to keep render time reasonable. */
export function clampScript(text: string, maxWords = 500): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

// ─── Background builders ─────────────────────────────────────────────────────

const DEFAULT_LOGO =
  "https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif";

/**
 * Stock video clips as b-roll background.
 * Videos play sequentially on the same track with crossfade transitions.
 * Each clip is trimmed to sceneDuration and muted (voiceover is on its own track).
 */
function stockVideoScenes(
  urls: string[],
  track: number,
  sceneDuration: number,
  fit: string,
): Record<string, unknown>[] {
  if (urls.length === 0) return [];

  return urls.map((url, i) => ({
    type: "video",
    track,
    time: i * sceneDuration,
    duration: sceneDuration,
    source: url,
    fit,
    width: "100%",
    height: "100%",
    volume: "0%",                  // mute b-roll — voiceover is on its own track
    trim_start: 0,
    trim_duration: sceneDuration,
    animations: [
      // Gentle Ken Burns on video clips for cinematic feel
      { type: "scale", start_scale: "100%", end_scale: "108%", easing: "linear" },
      { type: "fade", fade_in: 0.5, fade_out: 0.5 },
    ],
  }));
}

/**
 * Animated gradient scenes — no external deps needed.
 * Multiple color palettes cycle for visual variety.
 */
function gradientScenes(
  track: number,
  sceneDuration: number,
  layout: "wide" | "tall" | "square",
): Record<string, unknown>[] {
  const palettes = [
    { base: "#0F172A", accent: "#3B82F6" },
    { base: "#1E3A5F", accent: "#06B6D4" },
    { base: "#1A1A2E", accent: "#E94560" },
    { base: "#0D1B2A", accent: "#00D4AA" },
  ];

  return palettes.map(({ base, accent }, i) => ({
    type: "composition",
    track,
    time: i * sceneDuration,
    duration: sceneDuration,
    fill_color: base,
    animations: [{ type: "fade", fade_in: 0.5, fade_out: 0.5 }],
    elements: [
      { type: "shape", shape: "rectangle", fill_color: base, width: "100%", height: "100%" },
      {
        type: "shape",
        shape: "circle",
        fill_color: accent,
        width: layout === "tall" ? "80%" : "55%",
        height: layout === "tall" ? "45%" : "90%",
        x: i % 2 === 0 ? "20%" : "80%",
        y: i % 2 === 0 ? "70%" : "30%",
        x_alignment: "50%",
        y_alignment: "50%",
        opacity: 0.2,
        animations: [
          {
            type: "slide",
            x_start: i % 2 === 0 ? "-10%" : "10%",
            x_end: i % 2 === 0 ? "10%" : "-10%",
            easing: "linear",
          },
        ],
      },
    ],
  }));
}

/**
 * Resolve background elements.
 * Tries stock video first, falls back to gradient if no clips available.
 */
function buildBackground(
  p: VideoParams,
  track: number,
  sceneDur: number,
  fit: string,
  layout: "wide" | "tall" | "square",
): Record<string, unknown>[] {
  // Use stock video if available
  if (p.stockVideoUrls && p.stockVideoUrls.length > 0) {
    return stockVideoScenes(p.stockVideoUrls, track, sceneDur, fit);
  }

  // Always fall back to animated gradient (works without any external API)
  return gradientScenes(track, sceneDur, layout);
}

// ─── Shared element builders ──────────────────────────────────────────────────

function darkOverlay(track: number): Record<string, unknown> {
  return {
    type: "shape",
    track,
    shape: "rectangle",
    fill_color: "rgba(0,0,0,0.50)",
    width: "100%",
    height: "100%",
  };
}

function avatarPip(
  avatarUrl: string,
  agentName: string | undefined,
  track: number,
  layout: "wide" | "tall" | "square",
): Record<string, unknown>[] {
  const size = layout === "tall" ? 200 : layout === "square" ? 160 : 150;
  const x = layout === "tall" ? "50%" : "88%";
  const yImg = layout === "tall" ? "55%" : "82%";

  const els: Record<string, unknown>[] = [
    {
      type: "shape",
      track,
      shape: "circle",
      fill_color: "#FFFFFF",
      x,
      y: yImg,
      width: size + 8,
      height: size + 8,
      x_alignment: "50%",
      y_alignment: "50%",
    },
    {
      type: "image",
      track: track + 1,
      source: avatarUrl,
      x,
      y: yImg,
      width: size,
      height: size,
      x_alignment: "50%",
      y_alignment: "50%",
      fit: "cover",
      border_radius: "50%",
    },
  ];

  if (agentName) {
    const nameY = layout === "tall"
      ? `${parseInt(yImg) + 8}%`
      : `${parseInt(yImg) + 6}%`;

    els.push({
      type: "text",
      track: track + 2,
      text: agentName,
      font_family: "Montserrat",
      font_weight: "600",
      font_size: layout === "tall" ? 26 : 20,
      fill_color: "#FFFFFF",
      stroke_color: "rgba(0,0,0,0.6)",
      stroke_width: 1,
      background_color: "rgba(0,0,0,0.45)",
      background_x_padding: "12",
      background_y_padding: "6",
      background_border_radius: "8",
      x,
      y: nameY,
      x_alignment: "50%",
      y_alignment: "0%",
    });
  }

  return els;
}

// ─── Source builders ──────────────────────────────────────────────────────────

/*
 * Track layout (all formats):
 *   1  — Background (stock video clips / animated gradient)
 *   2  — Dark overlay
 *   3  — Title card + accent bar (timed)
 *   4  — Voiceover audio (named "Voiceover")
 *   5  — Word-synced captions (transcript_source → "Voiceover")
 *   6  — Logo
 *   7–9 — Agent PiP (border ring, headshot, name badge)
 *  10  — End-card CTA (YouTube only)
 */

export function buildBlogVideoSource(p: VideoParams): Record<string, unknown> {
  const logo = p.logoUrl || DEFAULT_LOGO;
  const accent = p.primaryColor || "#3B82F6";
  const captionColor = p.captionColor || "#FFFFFF";
  const highlightColor = p.captionHighlightColor || "#FACC15";

  const elements: Record<string, unknown>[] = [
    ...buildBackground(p, 1, 8, "cover", "wide"),
    darkOverlay(2),

    // Title card (0–4 s)
    {
      type: "text", track: 3, time: 0, duration: 4,
      text: p.title,
      font_family: "Montserrat", font_weight: "800", font_size: 64,
      fill_color: "#FFFFFF", stroke_color: "#000000", stroke_width: 2,
      x: "50%", y: "42%", width: "78%",
      x_alignment: "50%", y_alignment: "50%", text_wrap: true,
      animations: [
        { type: "text-appear", split: "line", duration: 0.6 },
        { type: "fade", fade_out: 0.4 },
      ],
    },
    {
      type: "shape", track: 3, time: 0, duration: 4,
      shape: "rectangle", fill_color: accent,
      width: "10%", height: 5, x: "50%", y: "56%",
      x_alignment: "50%", y_alignment: "50%",
      animations: [{ type: "fade", fade_in: 0.6, fade_out: 0.3 }],
    },

    // Voiceover
    { name: "Voiceover", type: "audio", track: 4, source: p.audioUrl, volume: "100%" },

    // Word-synced captions
    {
      type: "text", track: 5,
      transcript_source: "Voiceover", transcript_effect: "highlight",
      transcript_color: highlightColor,
      font_family: "Montserrat", font_weight: "700", font_size: 42,
      fill_color: captionColor, stroke_color: "#000000", stroke_width: 2,
      background_color: "rgba(0,0,0,0.55)",
      background_x_padding: "16", background_y_padding: "10", background_border_radius: "8",
      x: "50%", y: "88%", width: "82%",
      x_alignment: "50%", y_alignment: "50%",
    },

    // Logo
    { type: "image", track: 6, source: logo, x: "4%", y: "5%", width: 130, height: "auto", opacity: 0.9 },
  ];

  if (p.avatarUrl) elements.push(...avatarPip(p.avatarUrl, p.agentName, 7, "wide"));

  return { output_format: "mp4", width: 1920, height: 1080, frame_rate: 30, duration: "auto", elements };
}

export function buildYouTubeVideoSource(p: VideoParams): Record<string, unknown> {
  const logo = p.logoUrl || DEFAULT_LOGO;
  const accent = "#FACC15";
  const captionColor = p.captionColor || "#FFFFFF";
  const highlightColor = p.captionHighlightColor || accent;

  const elements: Record<string, unknown>[] = [
    ...buildBackground(p, 1, 8, "cover", "wide"),
    darkOverlay(2),

    // Title (0–4 s)
    {
      type: "text", track: 3, time: 0, duration: 4,
      text: p.title,
      font_family: "Montserrat", font_weight: "800", font_size: 72,
      fill_color: "#FFFFFF", stroke_color: "#000000", stroke_width: 2,
      x: "50%", y: "38%", width: "80%",
      x_alignment: "50%", y_alignment: "50%", text_wrap: true,
      animations: [
        { type: "text-appear", split: "line", duration: 0.6 },
        { type: "fade", fade_out: 0.4 },
      ],
    },
    {
      type: "shape", track: 3, time: 0, duration: 4,
      shape: "rectangle", fill_color: accent,
      width: "10%", height: 6, x: "50%", y: "54%",
      x_alignment: "50%", y_alignment: "50%",
      animations: [{ type: "fade", fade_in: 0.6, fade_out: 0.3 }],
    },
    {
      type: "text", track: 3, time: 0.8, duration: 3.2,
      text: "Subscribe for more real estate insights",
      font_family: "Montserrat", font_weight: "400", font_size: 28,
      fill_color: "rgba(255,255,255,0.85)",
      x: "50%", y: "62%", width: "70%",
      x_alignment: "50%", y_alignment: "50%", text_wrap: true,
      animations: [{ type: "fade", fade_in: 0.4, fade_out: 0.3 }],
    },

    // Voiceover
    { name: "Voiceover", type: "audio", track: 4, source: p.audioUrl, volume: "100%" },

    // Word-synced captions
    {
      type: "text", track: 5,
      transcript_source: "Voiceover", transcript_effect: "highlight",
      transcript_color: highlightColor,
      font_family: "Montserrat", font_weight: "700", font_size: 40,
      fill_color: captionColor, stroke_color: "#000000", stroke_width: 2,
      background_color: "rgba(0,0,0,0.55)",
      background_x_padding: "16", background_y_padding: "10", background_border_radius: "8",
      x: "50%", y: "88%", width: "84%",
      x_alignment: "50%", y_alignment: "50%",
    },

    // Logo
    { type: "image", track: 6, source: logo, x: "4%", y: "5%", width: 130, height: "auto", opacity: 0.9 },

    // End-card CTA
    {
      type: "text", track: 10, time: "end - 4", duration: 4,
      text: "👍  Like & Subscribe for more!",
      font_family: "Montserrat", font_weight: "700", font_size: 36,
      fill_color: accent,
      background_color: "rgba(0,0,0,0.6)",
      background_x_padding: "20", background_y_padding: "10", background_border_radius: "10",
      x: "50%", y: "14%", width: "70%",
      x_alignment: "50%", y_alignment: "50%",
      animations: [{ type: "slide", direction: "down", fade: true }],
    },
  ];

  if (p.avatarUrl) elements.push(...avatarPip(p.avatarUrl, p.agentName, 7, "wide"));

  return { output_format: "mp4", width: 1920, height: 1080, frame_rate: 30, duration: "auto", elements };
}

export function buildShortFormSource(p: VideoParams): Record<string, unknown> {
  const captionColor = p.captionColor || "#FFFFFF";
  const highlightColor = p.captionHighlightColor || "#FACC15";

  const elements: Record<string, unknown>[] = [
    ...buildBackground(p, 1, 6, "cover", "tall"),
    darkOverlay(2),

    // Hook title (0–3 s)
    {
      type: "text", track: 3, time: 0, duration: 3,
      text: p.title,
      font_family: "Montserrat", font_weight: "800", font_size: 68,
      fill_color: "#FFFFFF", stroke_color: "#000000", stroke_width: 2,
      x: "50%", y: "12%", width: "88%",
      x_alignment: "50%", y_alignment: "0%", text_wrap: true,
      animations: [
        { type: "text-appear", split: "word", duration: 0.4 },
        { type: "fade", fade_out: 0.3 },
      ],
    },

    // Voiceover
    { name: "Voiceover", type: "audio", track: 4, source: p.audioUrl, volume: "100%" },

    // Word-synced captions
    {
      type: "text", track: 5,
      transcript_source: "Voiceover", transcript_effect: "highlight",
      transcript_color: highlightColor,
      font_family: "Montserrat", font_weight: "700", font_size: 52,
      fill_color: captionColor, stroke_color: "#000000", stroke_width: 2,
      background_color: "rgba(0,0,0,0.55)",
      background_x_padding: "14", background_y_padding: "10", background_border_radius: "8",
      x: "50%", y: "72%", width: "90%",
      x_alignment: "50%", y_alignment: "50%",
    },
  ];

  if (p.avatarUrl) elements.push(...avatarPip(p.avatarUrl, p.agentName, 7, "tall"));

  return { output_format: "mp4", width: 1080, height: 1920, frame_rate: 30, duration: "auto", elements };
}

export function buildSquareVideoSource(p: VideoParams): Record<string, unknown> {
  const logo = p.logoUrl || DEFAULT_LOGO;
  const captionColor = p.captionColor || "#FFFFFF";
  const highlightColor = p.captionHighlightColor || "#FACC15";

  const elements: Record<string, unknown>[] = [
    ...buildBackground(p, 1, 7, "cover", "square"),
    darkOverlay(2),

    // Title (0–3.5 s)
    {
      type: "text", track: 3, time: 0, duration: 3.5,
      text: p.title,
      font_family: "Montserrat", font_weight: "800", font_size: 58,
      fill_color: "#FFFFFF", stroke_color: "#000000", stroke_width: 2,
      x: "50%", y: "22%", width: "86%",
      x_alignment: "50%", y_alignment: "50%", text_wrap: true,
      animations: [
        { type: "text-appear", split: "line", duration: 0.5 },
        { type: "fade", fade_out: 0.4 },
      ],
    },

    // Voiceover
    { name: "Voiceover", type: "audio", track: 4, source: p.audioUrl, volume: "100%" },

    // Word-synced captions
    {
      type: "text", track: 5,
      transcript_source: "Voiceover", transcript_effect: "highlight",
      transcript_color: highlightColor,
      font_family: "Montserrat", font_weight: "700", font_size: 44,
      fill_color: captionColor, stroke_color: "#000000", stroke_width: 2,
      background_color: "rgba(0,0,0,0.55)",
      background_x_padding: "14", background_y_padding: "10", background_border_radius: "8",
      x: "50%", y: "80%", width: "90%",
      x_alignment: "50%", y_alignment: "50%",
    },

    // Logo
    { type: "image", track: 6, source: logo, x: "4%", y: "4%", width: 110, height: "auto", opacity: 0.9 },
  ];

  if (p.avatarUrl) elements.push(...avatarPip(p.avatarUrl, p.agentName, 7, "square"));

  return { output_format: "mp4", width: 1080, height: 1080, frame_rate: 30, duration: "auto", elements };
}
