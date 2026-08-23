import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { generateSeoData } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Free-tier camera recording is a 30-day trial from the user's first
  // generated video, not forever — paid plans are unaffected. Checked here,
  // not just in the UI, since this is the actual point a recording gets
  // persisted.
  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const admin = createAdminClient();

  // Two entry modes:
  //  - JSON { storagePath }: the browser already uploaded the file directly to
  //    Supabase Storage via a signed URL (required for long recordings — the
  //    serverless request-body limit is far below a multi-minute video).
  //  - multipart form-data with the file inline: legacy fallback for small clips.
  let storagePath: string;
  let projectId: string | null;
  let videoType: string;
  let title: string;
  let spokenScript: string;
  let uploadedInline = false;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      storagePath?: string;
      projectId?: string;
      videoType?: string;
      title?: string;
      script?: string;
    };

    if (!body.storagePath) {
      return NextResponse.json({ error: "storagePath required" }, { status: 400 });
    }
    // Only allow paths inside the caller's own camera-recordings folder
    if (!body.storagePath.startsWith(`camera-recordings/${user.id}/`)) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 403 });
    }

    storagePath = body.storagePath;
    projectId = body.projectId || null;
    videoType = body.videoType || "reel_9x16";
    title = (body.title || "Camera Recording").slice(0, 120);
    spokenScript = (body.script || "").trim();
  } else {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    projectId = formData.get("projectId") as string | null;
    videoType = (formData.get("videoType") as string) || "reel_9x16";
    title = ((formData.get("title") as string) || "Camera Recording").slice(0, 120);
    spokenScript = ((formData.get("script") as string) || "").trim();

    if (!file) return NextResponse.json({ error: "No video file provided" }, { status: 400 });

    const ext = file.type.includes("mp4") ? "mp4" : "webm";
    storagePath = `camera-recordings/${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("assets")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    uploadedInline = true;
  }

  // Resolve project — use the existing script project if supplied, else create a stub
  let resolvedProjectId: string;

  if (projectId) {
    const { data: existing, error } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (error || !existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    resolvedProjectId = existing.id as string;
  } else {
    const { data: newProject, error: projectErr } = await admin
      .from("projects")
      .insert({ user_id: user.id, title, project_type: "location_script", status: "ready" })
      .select("id")
      .single();

    if (projectErr || !newProject) {
      return NextResponse.json({ error: projectErr?.message || "Failed to create project" }, { status: 500 });
    }
    resolvedProjectId = (newProject as { id: string }).id;
  }

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(storagePath);

  // Save as a completed video — no HeyGen or ElevenLabs involved
  const { data: videoRow, error: videoErr } = await admin
    .from("generated_videos")
    .insert({
      project_id: resolvedProjectId,
      user_id: user.id,
      video_url: publicUrl,
      video_type: videoType,
      render_provider: "camera",
      render_status: "completed",
      metadata: { source: "teleprompter" },
    })
    .select("id")
    .single();

  if (videoErr || !videoRow) {
    if (uploadedInline) {
      await admin.storage.from("assets").remove([storagePath]);
    }
    return NextResponse.json({ error: videoErr?.message || "Failed to save video" }, { status: 500 });
  }

  await admin
    .from("projects")
    .update({ status: "ready" })
    .eq("id", resolvedProjectId);

  // Titles, descriptions and hashtags for a camera video.
  //
  // Every other way of making a video writes these when the script is written.
  // Camera recordings never had a script-writing step, so they arrived in My
  // Videos with nothing to post them with. Generated from what was actually
  // read on camera.
  //
  // Non-fatal and deliberately last: the recording is already saved and
  // playable by this point, so a slow or failed SEO call must not lose it.
  // Skipped when the project already has SEO — the teleprompter path comes
  // from a scripted project that wrote its own, and regenerating would
  // overwrite wording the user may have edited.
  if (spokenScript.length > 40) {
    try {
      const { data: existing } = await admin
        .from("projects")
        .select("seo_data, ai_script")
        .eq("id", resolvedProjectId)
        .single();

      const already = (existing as { seo_data: unknown } | null)?.seo_data;
      if (!already) {
        // Bounded: the recording is already saved and playable, so this must
        // never be what makes the request time out. Losing the metadata is
        // recoverable; reporting a failed save for a video that exists is not.
        const seo = await Promise.race([
          generateSeoData(title, spokenScript, []),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
        ]);
        if (!seo) throw new Error("SEO generation timed out");
        await admin
          .from("projects")
          .update({
            seo_data: seo as unknown as Record<string, unknown>,
            // Keeps the script with the project so the editor and Publish
            // window have something to show for a camera video.
            ai_script: (existing as { ai_script: unknown } | null)?.ai_script
              ?? { title, script: spokenScript, hook: "", keywords: [] },
          })
          .eq("id", resolvedProjectId);
      }
    } catch (err) {
      console.error("[save-camera-recording] SEO generation failed (non-fatal):", err);
    }
  }

  return NextResponse.json({ video: { id: (videoRow as { id: string }).id }, videoId: (videoRow as { id: string }).id, title });
}
