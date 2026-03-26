const CREATOMATE_API = "https://api.creatomate.com/v2";

export interface RenderModifications {
  [key: string]: string | number | boolean | null;
}

export interface RenderRequest {
  template_id?: string;
  source?: Record<string, unknown>; // RenderScript for template-free renders
  modifications?: RenderModifications;
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
  // Creatomate returns an array
  return Array.isArray(data) ? data : [data];
}

export async function getRenderStatus(renderId: string): Promise<RenderResult> {
  const res = await fetch(`${CREATOMATE_API}/renders/${renderId}`, {
    headers: { Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}` },
  });

  if (!res.ok) throw new Error(`Creatomate status error ${res.status}`);
  return res.json();
}

// Build a simple blog video using RenderScript (no template required)
export function buildBlogVideoSource(params: {
  title: string;
  script: string;
  voiceoverText: string;
  backgroundVideoUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
}): Record<string, unknown> {
  return {
    output_format: "mp4",
    width: 1920,
    height: 1080,
    frame_rate: 30,
    duration: "auto",
    elements: [
      // Background
      ...(params.backgroundVideoUrl ? [{
        type: "video",
        source: params.backgroundVideoUrl,
        fit: "cover",
        volume: 0,
      }] : [{
        type: "shape",
        shape: "rectangle",
        fill_color: "#0F172A",
        width: "100%",
        height: "100%",
      }]),
      // Overlay for readability
      {
        type: "shape",
        shape: "rectangle",
        fill_color: "rgba(15,23,42,0.6)",
        width: "100%",
        height: "100%",
      },
      // Title
      {
        type: "text",
        text: params.title,
        font_family: "Roboto",
        font_weight: "700",
        font_size: 64,
        fill_color: "#FFFFFF",
        x_alignment: "50%",
        y_alignment: "30%",
        x: "50%",
        y: "30%",
        width: "80%",
        text_wrap: true,
      },
      // Voiceover (ElevenLabs via Creatomate native integration)
      {
        type: "audio",
        provider: "elevenlabs",
        text: params.voiceoverText,
        voice: "default",
        model: "eleven_multilingual_v2",
        transcript: {
          type: "text",
          font_family: "Inter",
          font_size: 36,
          fill_color: "#FFFFFF",
          background_color: "rgba(0,0,0,0.5)",
          background_x_padding: "8%",
          background_y_padding: "3%",
          x: "50%",
          y: "85%",
          width: "85%",
          x_alignment: "50%",
        },
      },
      // Logo (if provided)
      ...(params.logoUrl ? [{
        type: "image",
        source: params.logoUrl,
        x: "5%",
        y: "5%",
        width: 160,
        height: 48,
      }] : []),
    ],
  };
}

// Build a short-form (9:16) video using RenderScript
export function buildShortFormSource(params: {
  title: string;
  voiceoverText: string;
  backgroundVideoUrl?: string;
  primaryColor?: string;
}): Record<string, unknown> {
  return {
    output_format: "mp4",
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: "auto",
    elements: [
      ...(params.backgroundVideoUrl ? [{
        type: "video",
        source: params.backgroundVideoUrl,
        fit: "cover",
        volume: 0,
      }] : [{
        type: "shape",
        shape: "rectangle",
        fill_color: params.primaryColor || "#3B82F6",
        width: "100%",
        height: "100%",
      }]),
      {
        type: "shape",
        shape: "rectangle",
        fill_color: "rgba(15,23,42,0.5)",
        width: "100%",
        height: "100%",
      },
      {
        type: "text",
        text: params.title,
        font_family: "Roboto",
        font_weight: "700",
        font_size: 72,
        fill_color: "#FFFFFF",
        x_alignment: "50%",
        y_alignment: "20%",
        x: "50%",
        y: "20%",
        width: "85%",
        text_wrap: true,
      },
      {
        type: "audio",
        provider: "elevenlabs",
        text: params.voiceoverText,
        voice: "default",
        model: "eleven_multilingual_v2",
        transcript: {
          type: "text",
          font_family: "Inter",
          font_size: 48,
          fill_color: "#FFFFFF",
          background_color: "rgba(0,0,0,0.6)",
          background_x_padding: "6%",
          background_y_padding: "3%",
          x: "50%",
          y: "80%",
          width: "90%",
          x_alignment: "50%",
        },
      },
    ],
  };
}
