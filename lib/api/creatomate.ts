const CREATOMATE_API = "https://api.creatomate.com/v2";

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
  url: string | null;
  snapshot_url: string | null;
  error_message: string | null;
  metadata: string | null;
}

export async function createRender(request: RenderRequest): Promise<RenderResult[]> {
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
    throw new Error(`Creatomate render error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export async function getRenderStatus(renderId: string): Promise<RenderResult> {
  const res = await fetch(`${CREATOMATE_API}/renders/${renderId}`, {
    headers: { Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Creatomate status error ${res.status}`);
  return res.json();
}

// ─── Shared video params ───────────────────────────────────────────────────
export interface VideoParams {
  title: string;
  voiceoverText: string;
  backgroundUrls?: string[];      // Blotato-generated b-roll
  avatarId?: string;              // HeyGen avatar ID (native Creatomate connector)
  heygenVoiceId?: string;         // HeyGen voice (used when avatarId set)
  elevenLabsVoiceId?: string;     // ElevenLabs voice clone ID (overrides default TTS)
  logoUrl?: string;
  primaryColor?: string;
}

// Build the ElevenLabs audio element with native Creatomate integration
function elevenLabsAudioElement(
  text: string,
  voiceId: string | undefined,
  transcriptY: string,
  transcriptWidth: string
): Record<string, unknown> {
  return {
    type: "audio",
    provider: "elevenlabs",
    // Pass the user's cloned voice ID if available, otherwise Creatomate picks a default
    ...(voiceId ? { voice_id: voiceId } : {}),
    text,
    model: "eleven_multilingual_v2",
    // ElevenLabs quality settings
    stability: 0.5,
    similarity_boost: 0.8,
    style: 0.0,
    use_speaker_boost: true,
    // Auto-caption transcript overlay
    transcript: {
      type: "text",
      font_family: "Inter",
      font_weight: "600",
      font_size: 40,
      fill_color: "#FFFFFF",
      stroke_color: "#000000",
      stroke_width: 2,
      x: "50%",
      y: transcriptY,
      width: transcriptWidth,
      x_alignment: "50%",
      text_wrap: true,
      highlight_color: "#3B82F6",
      // Word-level highlighting for karaoke-style captions
      highlight_style: "word",
    },
  };
}

// ─── Blog Video (16:9) ─────────────────────────────────────────────────────
// Layers: Blotato b-roll → dark overlay → ElevenLabs TTS + captions
//         → HeyGen avatar PiP (native) → logo
export function buildBlogVideoSource(params: VideoParams): Record<string, unknown> {
  const hasBroll = !!params.backgroundUrls?.length;
  const bgColor = params.primaryColor || "#0F172A";
  const logo = params.logoUrl ||
    "https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif";

  const backgroundElement: Record<string, unknown> = hasBroll
    ? {
        type: "composition",
        width: "100%",
        height: "100%",
        elements: params.backgroundUrls!.map((url, i) => ({
          type: "image",
          source: url,
          fit: "cover",
          time: i * 4,
          duration: 4.5,
          animations: [{ type: "scale", start_scale: "100%", end_scale: "105%", easing: "linear" }],
        })),
      }
    : { type: "shape", shape: "rectangle", fill_color: bgColor, width: "100%", height: "100%" };

  // Caption area shifts left when avatar PiP is visible
  const captionY = params.avatarId ? "70%" : "82%";
  const captionWidth = params.avatarId ? "58%" : "85%";

  return {
    output_format: "mp4",
    width: 1920,
    height: 1080,
    frame_rate: 30,
    duration: "auto",
    elements: [
      // 0: Blotato b-roll background (or solid color fallback)
      backgroundElement,

      // 1: Readability overlay
      { type: "shape", shape: "rectangle", fill_color: "rgba(0,0,0,0.55)", width: "100%", height: "100%" },

      // 2: Title card (first 3s)
      {
        type: "text",
        text: params.title,
        font_family: "Roboto",
        font_weight: "700",
        font_size: 64,
        fill_color: "#FFFFFF",
        x_alignment: "50%",
        y_alignment: "40%",
        x: "50%",
        y: "40%",
        width: "75%",
        text_wrap: true,
        time: 0,
        duration: 3,
        animations: [{ type: "fade", fade_in: 0.4, fade_out: 0.3 }],
      },

      // 3: ElevenLabs TTS (native) + auto-captions
      elevenLabsAudioElement(
        params.voiceoverText,
        params.elevenLabsVoiceId,
        captionY,
        captionWidth
      ),

      // 4: HeyGen Avatar PiP — native Creatomate connector (circle crop, bottom-right)
      ...(params.avatarId
        ? [{
            type: "video",
            provider: "heygen",
            avatar_id: params.avatarId,
            ...(params.heygenVoiceId ? { voice_id: params.heygenVoiceId } : {}),
            x: "84%",
            y: "78%",
            width: "28%",
            height: "auto",
            fit: "contain",
            border_radius: "50%",
            border_width: 3,
            border_color: "#3B82F6",
          }]
        : []),

      // 5: Logo watermark
      { type: "image", source: logo, x: "4%", y: "4%", width: 160, height: "auto", opacity: 0.9 },
    ],
  };
}

// ─── Short-form / Reel (9:16) ──────────────────────────────────────────────
// Layers: Blotato b-roll → overlay → hook title → ElevenLabs TTS + captions
//         → HeyGen avatar fullscreen → logo
export function buildShortFormSource(params: VideoParams): Record<string, unknown> {
  const hasBroll = !!params.backgroundUrls?.length;
  const bgColor = params.primaryColor || "#3B82F6";

  const backgroundElement: Record<string, unknown> = hasBroll
    ? { type: "image", source: params.backgroundUrls![0], fit: "cover", width: "100%", height: "100%" }
    : { type: "shape", shape: "rectangle", fill_color: bgColor, width: "100%", height: "100%" };

  const captionY = params.avatarId ? "62%" : "78%";

  return {
    output_format: "mp4",
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: "auto",
    elements: [
      // 0: B-roll background
      backgroundElement,

      // 1: Overlay
      { type: "shape", shape: "rectangle", fill_color: "rgba(0,0,0,0.45)", width: "100%", height: "100%" },

      // 2: Hook title (first 2.5s)
      {
        type: "text",
        text: params.title,
        font_family: "Roboto",
        font_weight: "700",
        font_size: 72,
        fill_color: "#FFFFFF",
        x_alignment: "50%",
        y_alignment: "12%",
        x: "50%",
        y: "12%",
        width: "88%",
        text_wrap: true,
        time: 0,
        duration: 2.5,
        animations: [{ type: "slide", direction: "down", fade: true }],
      },

      // 3: ElevenLabs TTS (native) + karaoke captions
      elevenLabsAudioElement(
        params.voiceoverText,
        params.elevenLabsVoiceId,
        captionY,
        "88%"
      ),

      // 4: HeyGen Avatar — centered, fullscreen vertical
      ...(params.avatarId
        ? [{
            type: "video",
            provider: "heygen",
            avatar_id: params.avatarId,
            ...(params.heygenVoiceId ? { voice_id: params.heygenVoiceId } : {}),
            x: "50%",
            y: "42%",
            width: "85%",
            height: "auto",
            fit: "contain",
            x_alignment: "50%",
            y_alignment: "50%",
          }]
        : []),
    ],
  };
}
