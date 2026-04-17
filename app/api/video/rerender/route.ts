import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { generateSpeech } from "@/lib/api/elevenlabs";
import { searchStockVideos } from "@/lib/api/stock-video";
import {
  generateVideo,
  generateVideoWithAudio,
  uploadAudioAsset,
  uploadVideoAsset,
  uploadTalkingPhoto,
  DIMENSIONS,
  type VideoType,
  type SceneInput,
} from "@/lib/api/heygen";

export const maxDuration = 120;

const MAX_SCRIPT_WORDS = 450;

function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}

function splitIntoScenes(script: string, numScenes = 4): string[] {
  const paragraphs = script.split(/\n\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= numScenes) {
    const scenes: string[] = [];
    const perScene = Math.ceil(paragraphs.length / numScenes);
    for (let i = 0; i < paragraphs.length; i += perScene) {
      scenes.push(paragraphs.slice(i, i + perScene).join("\n\n"));
    }
    return scenes.slice(0, numScenes);
  }
  const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
  if (sentences.length < 2) return [script];
  const scenes: string[] = [];
  const perScene = Math.ceil(sentences.length / numScenes);
  for (let i = 0; i < sentences.length; i += perScene) {
    scenes.push(sentences.slice(i, i + perScene).join(" ").trim());
  }
  return scenes.filter((s) => s.length > 0).slice(0, numScenes);
}

export interface RerenderEdits {
  script: string;
  title: string;
  format: VideoType;
  brandColor?: string;
  logoEnabled?: boolean;
  captionsEnabled?: boolean;
  voiceId?: string | null;
  avatarId?: string | null;
  captionColor?: string;
  captionHighlightColor?: string;
  musicUrl?: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, edits } = (await req.json()) as { videoId: string; edits: RerenderEdits };
  if (!videoId || !edits?.script) {
    return NextResponse.json({ error: "videoId and edits.script required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: video } = await admin
    .from("generated_videos")
    .select("*, projects(user_id, ai_script)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles")
    .select("voice_clone_id, logo_url, avatar_url, full_name, heygen_photo_id, location_city, location_state")
    .eq("id", user.id)
    .single();

  const p = profile as {
    voice_clone_id: string | null;
    logo_url: string | null;
    avatar_url: string | null;
    full_name: string | null;
    heygen_photo_id: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!p?.avatar_url && !p?.heygen_photo_id) {
    return NextResponse.json({ error: "Upload your photo in Settings first." }, { status: 400 });
  }

  if (p?.avatar_url && !p?.heygen_photo_id) {
    try {
      console.log("[rerender] Auto-registering avatar with HeyGen...");
      const imgRes = await fetch(p.avatar_url);
      if (!imgRes.ok) throw new Error(`Failed to download avatar: ${imgRes.status}`);
      const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const photoId = await uploadTalkingPhoto(imageBuffer, contentType);

      await admin
        .from("profiles")
        .update({ heygen_photo_id: photoId })
        .eq("id", user.id);

      p.heygen_photo_id = photoId;
      console.log(`[rerender] Auto-registered HeyGen talking photo: ${photoId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[rerender] Auto-registration failed:", errMsg);
      return NextResponse.json(
        { error: `Failed to register your photo with HeyGen: ${errMsg}` },
        { status: 400 },
      );
    }
  }

  if (!p?.voice_clone_id) {
    return NextResponse.json({ error: "Upload a voice sample in Settings first." }, { status: 400 });
  }

  const safeScript = clampScript(edits.script);
  const isShortForm = edits.format === "reel_9x16" || edits.format === "short_1x1";
  const numScenes = isShortForm ? 3 : 5;

  try {
    const sceneTexts = splitIntoScenes(safeScript, numScenes);

    const proj = video.projects as { ai_script?: Record<string, unknown> } | null;
    const keywords = (proj?.ai_script?.keywords as string[]) || [];
    const city = p.location_city || "";
    const state = p.location_state || "";
    const searchTerms = keywords.length > 0
      ? keywords.slice(0, 4)
      : [`${city} ${state} homes`.trim(), "real estate neighborhood"];

    let stockVideoAssetIds: string[] = [];
    try {
      const clips = await searchStockVideos(
        searchTerms,
        isShortForm ? "portrait" : "landscape",
        1,
      );
      console.log(`[rerender] Found ${clips.length} b-roll clips, uploading to HeyGen...`);
      for (let i = 0; i < clips.length; i++) {
        try {
          const clipRes = await fetch(clips[i].url);
          if (!clipRes.ok) continue;
          const clipBuffer = Buffer.from(await clipRes.arrayBuffer());
          const assetId = await uploadVideoAsset(clipBuffer);
          stockVideoAssetIds.push(assetId);
        } catch (upErr) {
          console.warn(`[rerender] B-roll ${i + 1} upload failed:`, upErr);
        }
      }
    } catch { /* fallback to solid bg */ }

    const dimension = DIMENSIONS[edits.format] || DIMENSIONS.blog_long;

    const { data: newVideo, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: video.project_id,
        user_id: user.id,
        video_type: edits.format,
        render_provider: "heygen",
        render_status: "rendering",
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    const voiceId = edits.voiceId || p.voice_clone_id!;
    console.log(`[rerender] Generating ${sceneTexts.length} per-scene audio tracks via ElevenLabs...`);

    const sceneAudioAssetIds: string[] = [];
    for (let i = 0; i < sceneTexts.length; i++) {
      const text = sceneTexts[i];
      console.log(`[rerender] Scene ${i + 1}/${sceneTexts.length}: generating voice (${text.length} chars)...`);
      const audioBuffer = await generateSpeech(text, voiceId);
      const assetId = await uploadAudioAsset(audioBuffer);
      sceneAudioAssetIds.push(assetId);
    }

    const scenes: SceneInput[] = sceneTexts.map((text, i) => ({
      scriptText: text,
      audioAssetId: sceneAudioAssetIds[i],
      backgroundVideoAssetId: stockVideoAssetIds.length > 0
        ? stockVideoAssetIds[i % stockVideoAssetIds.length]
        : undefined,
      backgroundColor: edits.brandColor || "#0F172A",
    }));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    let heygenVideoId: string;
    try {
      heygenVideoId = await generateVideo({
        scenes,
        talkingPhotoId: p.heygen_photo_id!,
        dimension,
        title: edits.title,
        callbackUrl,
      });
    } catch (primaryErr) {
      console.warn("[rerender] Multi-scene failed, single-scene fallback:", primaryErr);
      heygenVideoId = await generateVideoWithAudio({
        audioAssetId: sceneAudioAssetIds[0],
        talkingPhotoId: p.heygen_photo_id!,
        backgroundVideoAssetId: stockVideoAssetIds[0],
        dimension,
        title: edits.title,
        callbackUrl,
      });
    }

    await admin
      .from("generated_videos")
      .update({ render_job_id: heygenVideoId })
      .eq("id", newVideo?.id);

    console.log(`[rerender] Submitted to HeyGen (${heygenVideoId}) — client will poll`);
    return NextResponse.json({
      video: {
        ...newVideo,
        render_job_id: heygenVideoId,
        render_status: "rendering",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Re-render failed";
    console.error("[rerender] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
