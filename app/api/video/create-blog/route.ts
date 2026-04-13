import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { NextRequest, NextResponse } from "next/server";

// Fire-and-forget: we submit to HeyGen then return immediately.
// The client polls /api/video/status which queries DB (updated by webhook)
// or falls back to HeyGen directly when the webhook can't reach us (local dev).
// 120s covers: avatar upload + per-scene TTS + HeyGen submission.
export const maxDuration = 120;

// 3-minute max for ALL video types / templates / platforms
const MAX_SCRIPT_WORDS = 450;  // ~3 min at 150 wpm

/** Clamp script to stay within 3-minute video limit. */
function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}

/**
 * Split a script into scenes for multi-scene HeyGen video.
 * Splits by paragraphs first, then by sentences if needed.
 */
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

  // Fewer paragraphs than scenes — split by sentences
  const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
  if (sentences.length < 2) return [script]; // too short to split

  const scenes: string[] = [];
  const perScene = Math.ceil(sentences.length / numScenes);
  for (let i = 0; i < sentences.length; i += perScene) {
    scenes.push(sentences.slice(i, i + perScene).join(" ").trim());
  }
  return scenes.filter((s) => s.length > 0).slice(0, numScenes);
}

/**
 * Build location-specific b-roll search terms from the script + AI keywords.
 * Ensures b-roll is cinematic and relevant to the city/state.
 */
function buildBrollSearchTerms(
  aiKeywords: string[],
  city?: string,
  state?: string,
): string[] {
  const locationPrefix = city ? `${city} ${state || ""}`.trim() : "";

  // Location-specific terms first
  const terms: string[] = [];
  if (locationPrefix) {
    terms.push(`${locationPrefix} homes neighborhood`);
    terms.push(`${locationPrefix} aerial downtown`);
    terms.push(`${locationPrefix} community lifestyle`);
  }

  // Add AI-generated keywords (cleaned for video search)
  for (const kw of aiKeywords.slice(0, 3)) {
    const cleaned = kw.replace(/[^a-zA-Z\s]/g, "").trim();
    if (cleaned.length > 3) terms.push(cleaned);
  }

  // Generic fallbacks if nothing better
  if (terms.length < 3) {
    terms.push("real estate homes exterior");
    terms.push("suburban neighborhood aerial");
    terms.push("family home interior modern");
  }

  return terms.slice(0, 6); // max 6 search queries
}

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();

  // Load project
  const { data: projectData } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!projectData) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = projectData as {
    id: string;
    title: string;
    ai_script: Record<string, unknown> | null;
    seo_data: Record<string, unknown> | null;
  };

  const aiScript = project.ai_script as Record<string, unknown> | null;
  const seoData = project.seo_data as Record<string, unknown> | null;

  // Extract script — clamp to 3-minute max
  const rawScript = script || (aiScript?.script as string) || project.title;
  const safeScript = clampScript(rawScript);

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  // Load user profile
  const { data: profileData } = await admin
    .from("profiles")
    .select("voice_clone_id, avatar_url, logo_url, full_name, heygen_photo_id, location_city, location_state")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    voice_clone_id: string | null;
    avatar_url: string | null;
    logo_url: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  // Require avatar + voice (user sets these up in Settings)
  if (!profile?.avatar_url && !profile?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Please upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  // Auto-register with HeyGen if photo exists but hasn't been registered yet
  if (profile?.avatar_url && !profile?.heygen_photo_id) {
    try {
      console.log("[create-blog] Auto-registering avatar with HeyGen...");
      const imgRes = await fetch(profile.avatar_url);
      if (!imgRes.ok) throw new Error(`Failed to download avatar: ${imgRes.status}`);
      const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const photoId = await uploadTalkingPhoto(imageBuffer, contentType);

      // Save to profile for future use
      await admin
        .from("profiles")
        .update({ heygen_photo_id: photoId })
        .eq("id", user.id);

      profile.heygen_photo_id = photoId;
      console.log(`[create-blog] Auto-registered HeyGen talking photo: ${photoId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[create-blog] Auto-registration failed:", errMsg);
      return NextResponse.json(
        { error: `Failed to register your photo with HeyGen: ${errMsg}` },
        { status: 400 },
      );
    }
  }

  if (!profile?.voice_clone_id) {
    return NextResponse.json(
      { error: "Please upload a voice sample in Settings to clone your voice." },
      { status: 400 },
    );
  }

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    // ── Step 1: Split script into scenes ────────────────────────────────
    const isShortForm = videoType === "reel_9x16" || videoType === "short_1x1";
    const numScenes = isShortForm ? 3 : 5;
    const sceneTexts = splitIntoScenes(safeScript, numScenes);
    console.log(`[create-blog] Split script into ${sceneTexts.length} scenes`);

    // ── Step 2: Search location-specific b-roll ─────────────────────────
    // B-roll is searched using city/state from the script location data
    // or from the user's profile location.
    const scriptLocation = aiScript?.location as string | undefined;
    const city = scriptLocation?.split(",")[0]?.trim() || profile.location_city || "";
    const state = scriptLocation?.split(",")[1]?.trim() || profile.location_state || "";

    const aiKeywords = (aiScript?.keywords as string[]) || [];
    const orientation = isShortForm ? "portrait" : "landscape";
    const searchTerms = buildBrollSearchTerms(aiKeywords, city, state);

    let stockVideoAssetIds: string[] = [];
    try {
      console.log(`[create-blog] Searching b-roll for: ${city}, ${state}`);
      const clips = await searchStockVideos(searchTerms, orientation, 1); // 1 per keyword
      console.log(`[create-blog] Found ${clips.length} stock clips, uploading to HeyGen...`);

      // Download each Pixabay clip and upload to HeyGen (external URLs are not reliable)
      for (let i = 0; i < clips.length; i++) {
        try {
          const clipRes = await fetch(clips[i].url);
          if (!clipRes.ok) {
            console.warn(`[create-blog] B-roll ${i + 1} download failed: ${clipRes.status}`);
            continue;
          }
          const clipBuffer = Buffer.from(await clipRes.arrayBuffer());
          const assetId = await uploadVideoAsset(clipBuffer);
          stockVideoAssetIds.push(assetId);
        } catch (upErr) {
          console.warn(`[create-blog] B-roll ${i + 1} upload failed:`, upErr);
        }
      }
      console.log(`[create-blog] Uploaded ${stockVideoAssetIds.length} b-roll assets to HeyGen`);
    } catch (err) {
      console.warn("[create-blog] Stock search failed, will use solid background:", err);
    }

    // ── Step 3: Create DB row ───────────────────────────────────────────
    const dimension = DIMENSIONS[videoType as VideoType] || DIMENSIONS.blog_long;

    const { data: videoRow } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "heygen",
        render_status: "rendering",
      })
      .select()
      .single();

    // ── Step 4: Generate per-scene ElevenLabs audio and upload each ────
    // HeyGen cannot access privately-cloned ElevenLabs voices — we generate
    // audio per scene so each scene has its own matching voice track.
    console.log(`[create-blog] Generating ${sceneTexts.length} per-scene audio tracks via ElevenLabs...`);

    const sceneAudioAssetIds: string[] = [];
    for (let i = 0; i < sceneTexts.length; i++) {
      const text = sceneTexts[i];
      console.log(`[create-blog] Scene ${i + 1}/${sceneTexts.length}: generating voice (${text.length} chars)...`);
      const audioBuffer = await generateSpeech(text, profile.voice_clone_id!);
      const assetId = await uploadAudioAsset(audioBuffer);
      sceneAudioAssetIds.push(assetId);
      console.log(`[create-blog] Scene ${i + 1} audio uploaded: ${assetId}`);
    }

    // Build scene inputs with per-scene audio + HeyGen-hosted b-roll
    const scenes: SceneInput[] = sceneTexts.map((text, i) => ({
      scriptText: text,
      audioAssetId: sceneAudioAssetIds[i],
      backgroundVideoAssetId: stockVideoAssetIds.length > 0
        ? stockVideoAssetIds[i % stockVideoAssetIds.length]
        : undefined,
      backgroundColor: "#0F172A",
    }));

    // ── Step 5: Submit to HeyGen (fire-and-forget) ─────────────────────
    // HeyGen will call our webhook when the render completes.
    // In environments where the webhook can't reach us (local dev), the
    // /api/video/status endpoint falls back to querying HeyGen directly.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    let heygenVideoId: string;
    try {
      console.log("[create-blog] Submitting multi-scene video to HeyGen...");
      heygenVideoId = await generateVideo({
        scenes,
        talkingPhotoId: profile.heygen_photo_id!,
        dimension,
        title,
        callbackUrl,
      });
    } catch (primaryErr) {
      // Fallback: single-scene with first audio asset
      console.warn("[create-blog] Multi-scene failed, trying single-scene fallback:", primaryErr);
      heygenVideoId = await generateVideoWithAudio({
        audioAssetId: sceneAudioAssetIds[0],
        talkingPhotoId: profile.heygen_photo_id!,
        backgroundVideoAssetId: stockVideoAssetIds[0],
        dimension,
        title,
        callbackUrl,
      });
    }

    // ── Step 6: Save HeyGen video_id and return immediately ────────────
    await admin
      .from("generated_videos")
      .update({ render_job_id: heygenVideoId })
      .eq("id", videoRow?.id);

    await admin.from("api_usage_log").insert([
      {
        user_id: user.id,
        api_provider: "heygen",
        endpoint: "studio-video-generate",
        credits_used: 1,
        response_status: 202,
      },
    ]);

    console.log(`[create-blog] Submitted to HeyGen (${heygenVideoId}) — client will poll for completion`);
    return NextResponse.json({
      video: {
        ...videoRow,
        render_job_id: heygenVideoId,
        render_status: "rendering",
      },
    });

  } catch (err) {
    await admin.from("projects").update({ status: "error" }).eq("id", projectId);
    await admin
      .from("generated_videos")
      .update({ render_status: "failed" })
      .eq("project_id", projectId)
      .eq("render_status", "rendering");

    const msg = err instanceof Error ? err.message : "Video generation failed";
    console.error("[create-blog] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
