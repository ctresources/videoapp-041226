const HEYGEN_API = "https://api.heygen.com";

export interface AvatarVideoRequest {
  script: string;
  avatar_id?: string;
  voice_id?: string;
  width?: number;
  height?: number;
}

export interface AvatarVideoResult {
  video_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  video_url?: string;
  thumbnail_url?: string;
  error?: string;
}

export async function createAvatarVideo(params: AvatarVideoRequest): Promise<AvatarVideoResult> {
  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: "POST",
    headers: {
      "X-Api-Key": process.env.HEYGEN_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: params.avatar_id || "Abigail_expressive_2024112501",
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: params.script,
            voice_id: params.voice_id || "1bd001e7e50f421d891986aad5158bc8",
          },
          background: {
            type: "color",
            value: "#F1F5F9",
          },
        },
      ],
      dimension: {
        width: params.width || 1080,
        height: params.height || 1920,
      },
      aspect_ratio: null,
      test: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return {
    video_id: data.data?.video_id || data.video_id,
    status: "pending",
  };
}

export async function getVideoStatus(videoId: string): Promise<AvatarVideoResult> {
  const res = await fetch(`${HEYGEN_API}/v1/video_status.get?video_id=${videoId}`, {
    headers: { "X-Api-Key": process.env.HEYGEN_API_KEY! },
  });

  if (!res.ok) throw new Error(`HeyGen status error ${res.status}`);
  const data = await res.json();

  return {
    video_id: videoId,
    status: data.data?.status === "completed" ? "completed"
      : data.data?.status === "failed" ? "failed"
      : "processing",
    video_url: data.data?.video_url,
    thumbnail_url: data.data?.thumbnail_url,
    error: data.data?.error,
  };
}

export async function generateThumbnail(prompt: string): Promise<{ image_url: string }> {
  const res = await fetch(`${HEYGEN_API}/v2/photo_avatar/photo/generate`, {
    method: "POST",
    headers: {
      "X-Api-Key": process.env.HEYGEN_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "thumbnail",
      age: "adult",
      gender: "neutral",
      ethnicity: "american",
      orientation: "horizontal",
      pose: "custom",
      style: "Photogenic",
      appearance: prompt,
    }),
  });

  if (!res.ok) {
    throw new Error(`HeyGen thumbnail error ${res.status}`);
  }

  const data = await res.json();
  return { image_url: data.data?.image_url || data.image_url };
}
