import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateVideo,
  getDefaultEnglishVoiceId,
  DIMENSIONS,
  type VideoType,
  type SceneInput,
  type TextElement,
} from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_SCRIPT_WORDS = 250;
const QUICK_SCRIPT_WORDS = 150;

function clampScript(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(" ") + ".";
}

function buildContactLine(profile: {
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  company_phone: string | null;
}): string {
  const parts: string[] = [];
  if (profile.full_name) parts.push(profile.full_name);
  if (profile.company_name) parts.push(profile.company_name);
  const phone = profile.phone || profile.company_phone;
  if (phone) parts.push(phone);
  return parts.join("  ·  ");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, videoType = "blog_long", script, hook, quickMode = false } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();

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

  const wordLimit = quickMode ? QUICK_SCRIPT_WORDS : MAX_SCRIPT_WORDS;
  const rawScript = script || (aiScript?.script as string) || project.title;
  const safeScript = clampScript(rawScript, wordLimit);

  const hookText = hook || (aiScript?.hook as string) || "";

  const title =
    videoType === "youtube_16x9"
      ? ((seoData?.youtube_title as string) || (aiScript?.title as string) || project.title)
      : ((aiScript?.title as string) || project.title);

  const { data: profileData } = await admin
    .from("profiles")
    .select("heygen_voice_id, avatar_url, full_name, company_name, phone, company_phone, heygen_photo_id, location_city, location_state")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    heygen_voice_id: string | null;
    avatar_url: string | null;
    heygen_photo_id: string | null;
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!profile?.heygen_photo_id && !profile?.avatar_url) {
    return NextResponse.json(
      { error: "Please upload your photo in Settings to create your video avatar." },
      { status: 400 },
    );
  }

  await admin.from("projects").update({ status: "generating" }).eq("id", projectId);

  try {
    const isShortForm = videoType === "reel_9x16";
    const orientation = isShortForm ? "portrait" : "landscape";

    const contactLine = profile ? buildContactLine(profile) : "";

    // Text overlays: hook caption top-right, contact info bottom-right
    const elements: TextElement[] = [
      ...(hookText ? [{
        type: "text" as const,
        text: hookText,
        position: "top-right" as const,
        style: { fontFamily: "Montserrat", fontSize: 36, fontColor: "#FFFFFF", bold: true },
      }] : []),
      ...(contactLine ? [{
        type: "text" as const,
        text: contactLine,
        position: "bottom-right" as const,
        style: { fontFamily: "Montserrat", fontSize: 22, fontColor: "#F1F5F9", bold: false },
      }] : []),
    ];

    const scene: SceneInput = {
      scriptText: safeScript,
      backgroundColor: "#0F172A",
      elements: elements.length > 0 ? elements : undefined,
    };

    const dimension = DIMENSIONS[videoType as VideoType] || DIMENSIONS.blog_long;

    // Always ensure a voice_id — without it HeyGen renders silent video
    const voiceId = profile?.heygen_voice_id
      || await getDefaultEnglishVoiceId().catch(() => null);

    if (!voiceId) throw new Error("No voice available. Please set up your voice in Settings.");

    const { data: videoRow, error: insertErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: projectId,
        user_id: user.id,
        video_type: videoType,
        render_provider: "heygen",
        render_status: "rendering",
        metadata: { dimension, orientation, title, quickMode },
      })
      .select()
      .single();

    if (insertErr || !videoRow) {
      throw new Error(`Failed to create video record: ${insertErr?.message || "unknown"}`);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/video/webhook`
      : undefined;

    const videoId = await generateVideo({
      scenes: [scene],
      talkingPhotoId: profile!.heygen_photo_id!,
      voiceId,
      dimension,
      title,
      callbackUrl,
      photoPosition: "bottom-left",
    });

    await admin
      .from("generated_videos")
      .update({ render_job_id: videoId })
      .eq("id", videoRow.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-v2",
      credits_used: 1,
      response_status: 202,
    });

    console.log(`[create-blog] v2 video submitted: ${videoId}, voice: ${voiceId}`);
    return NextResponse.json({
      video: { ...videoRow, render_job_id: videoId, render_status: "rendering" },
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
