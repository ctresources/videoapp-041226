import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateVideoV3,
  getPrivateVoiceId,
  getDefaultEnglishVoiceId,
  getAvatarLooks,
  DIMENSIONS,
  type VideoType,
} from "@/lib/api/heygen";
import { sanitizeNarration } from "@/lib/utils/sanitize-narration";

export const maxDuration = 60;

// Direct Video speaks the whole script; keep a generous cap only as a
// runaway-cost guard (~15 min at 145 wpm).
const MAX_SCRIPT_WORDS = 2200;

function clampScript(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_SCRIPT_WORDS) return text;
  return words.slice(0, MAX_SCRIPT_WORDS).join(" ") + ".";
}


export interface RerenderEdits {
  script: string;
  title: string;
  format: VideoType;
  quickMode?: boolean;
  brandColor?: string;
  logoEnabled?: boolean;
  captionsEnabled?: boolean;
  voiceId?: string | null;
  /**
   * Avatar selection: a HeyGen look/stock id, the user's avatar group id
   * (resolved to a look server-side), the literal "none" for voiceover-only,
   * or null/undefined to default to the user's avatar.
   */
  avatarId?: string | null;
  captionColor?: string;
  captionHighlightColor?: string;
  musicUrl?: string | null;
  /** Listing/b-roll photos for the Video Agent to weave in (up to 8). */
  photoUrls?: string[];
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

  // Tracks the placeholder generated_videos row so we can mark it failed if
  // HeyGen rejects the job (otherwise it lingers as "rendering" forever).
  let placeholderVideoId: string | null = null;

  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_voice_id, heygen_photo_id, heygen_digital_twin_look_id, full_name, company_name, phone, company_phone, location_city, location_state, website, voice_clone_id, credits_remaining")
    .eq("id", user.id)
    .single();

  const p = profile as {
    heygen_voice_id: string | null;
    heygen_photo_id: string | null;
    heygen_digital_twin_look_id: string | null;
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    location_city: string | null;
    location_state: string | null;
    website: string | null;
    voice_clone_id: string | null;
    credits_remaining: number;
  } | null;

  if (!p?.heygen_photo_id) {
    return NextResponse.json(
      { error: "Upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  if (p.credits_remaining < 1) {
    return NextResponse.json(
      { error: "No videos remaining this month. Please upgrade your plan." },
      { status: 402 },
    );
  }

  // Strip markdown/bullets/emoji so HeyGen speaks it verbatim.
  const safeScript = clampScript(sanitizeNarration(edits.script));
  const isShortForm = edits.format === "reel_9x16" || edits.format === "short_1x1";
  const orientation = isShortForm ? "portrait" : "landscape";
  const city = p.location_city || "";
  const state = p.location_state || "";

  try {
    const dimension = DIMENSIONS[edits.format] || DIMENSIONS.blog_long;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    // Re-render uses Direct Video (POST /v3/videos): the avatar speaks the FULL
    // script verbatim (the Video Agent summarized long scripts). Uploaded photos
    // are composited as b-roll by the webhook, exactly like the paste flow.
    //
    // Resolve a concrete avatar look: explicit pick → digital twin → the photo
    // group's first completed look (Direct Video can't render a group id).
    let avatarId: string | undefined =
      (edits.avatarId && edits.avatarId !== "none" ? edits.avatarId : undefined) ||
      p.heygen_digital_twin_look_id || undefined;
    if ((!avatarId || avatarId === p.heygen_photo_id) && p.heygen_photo_id) {
      try {
        const looks = await getAvatarLooks(p.heygen_photo_id);
        const ready = looks.find((l) => l.status === "completed") || looks[0];
        if (ready?.id) avatarId = ready.id;
      } catch (e) {
        console.warn("[rerender] avatar resolution failed:", e instanceof Error ? e.message : e);
      }
    }
    if (!avatarId) throw new Error("Set up your avatar in Settings → Brand Profile to re-render.");

    // Voice: the user's cloned HeyGen voice → private → default English.
    let voiceId = edits.voiceId || p.heygen_voice_id;
    if (!voiceId) {
      const privateVoiceId = await getPrivateVoiceId().catch(() => null);
      if (privateVoiceId) {
        voiceId = privateVoiceId;
        void admin.from("profiles").update({ heygen_voice_id: privateVoiceId }).eq("id", user.id);
      }
    }
    voiceId = voiceId || await getDefaultEnglishVoiceId().catch(() => null);
    if (!voiceId) throw new Error("No voice found. Please set up your voice clone in Settings.");

    const directPhotos = Array.isArray(edits.photoUrls)
      ? edits.photoUrls.filter((u): u is string => typeof u === "string").slice(0, 8)
      : [];

    const { data: newVideo, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: video.project_id,
        user_id: user.id,
        video_type: edits.format,
        render_provider: "heygen_v3_direct",
        render_status: "rendering",
        metadata: {
          dimension, orientation, city, state, title: edits.title,
          // Both applied by the webhook at store time.
          ...(edits.musicUrl && { music_url: edits.musicUrl }),
          ...(directPhotos.length > 0 && { photo_urls: directPhotos }),
        },
      })
      .select()
      .single();

    if (insertErr || !newVideo) throw new Error(insertErr?.message || "Insert failed");
    placeholderVideoId = newVideo.id;

    // Digital Twin looks render on Avatar V (highest fidelity, same price).
    const isDigitalTwin = avatarId === p.heygen_digital_twin_look_id;
    const videoId = await generateVideoV3({
      avatarId,
      voiceId,
      scriptText: safeScript,
      dimension,
      title: edits.title,
      callbackUrl,
      callbackId: newVideo.id,
      ...(isDigitalTwin && { engine: "avatar_v" as const }),
    });

    await admin
      .from("generated_videos")
      // credit_cost enables an automatic refund if the render later fails
      .update({ render_job_id: videoId, metadata: { ...(newVideo.metadata ?? {}), credit_cost: 1 } })
      .eq("id", newVideo.id);

    await admin.from("profiles").update({ credits_remaining: p.credits_remaining - 1 }).eq("id", user.id);
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-v3-direct-rerender",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[rerender] Direct video ${videoId} (avatar ${avatarId}, ${directPhotos.length} photos, ${safeScript.split(/\s+/).length} words)`);
    return NextResponse.json({
      video: { ...newVideo, render_job_id: videoId, render_status: "rendering" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Re-render failed";
    console.error("[rerender] error:", msg);

    // Mark the placeholder row as failed so it doesn't linger as "rendering"
    if (placeholderVideoId) {
      await admin
        .from("generated_videos")
        .update({ render_status: "failed" })
        .eq("id", placeholderVideoId)
        .then(() => undefined, () => undefined);
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
