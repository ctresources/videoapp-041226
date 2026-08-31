import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { generateSeoData } from "@/lib/api/perplexity";
import { ensureFaststart, needsFaststart } from "@/lib/utils/faststart";
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
  let hook: string;
  let city: string;
  let state: string;
  let cta: string;
  let uploadedInline = false;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      storagePath?: string;
      projectId?: string;
      videoType?: string;
      title?: string;
      script?: string;
      hook?: string;
      city?: string;
      state?: string;
      cta?: string;
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
    hook = (body.hook || "").trim().slice(0, 400);
    city = (body.city || "").trim().slice(0, 100);
    state = (body.state || "").trim().slice(0, 50);
    cta = (body.cta || "").trim().slice(0, 2000);
  } else {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    projectId = formData.get("projectId") as string | null;
    videoType = (formData.get("videoType") as string) || "reel_9x16";
    title = ((formData.get("title") as string) || "Camera Recording").slice(0, 120);
    spokenScript = ((formData.get("script") as string) || "").trim();
    // The legacy inline path is only used by small fallback uploads, which have
    // no form to collect any of this.
    hook = "";
    city = "";
    state = "";
    cta = "";

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
      // The market belongs on the project, not just in the copy: it is what
      // the editor and Publish read back, and for an uploaded clip it is
      // often a listing's town rather than the agent's own.
      .insert({
        user_id: user.id, title, project_type: "location_script", status: "ready",
        ...(city && { location_city: city }),
        ...(state && { location_state: state }),
      })
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

  // Make sure the recording will start on an iPhone.
  //
  // Recordings never pass through this server — the browser uploads them
  // straight to storage, since a 15-minute take dwarfs the serverless body
  // limit. So the only way to know how the file is laid out is to read its
  // head back, which is why this is a range request rather than a download.
  //
  // A browser recording MP4 writes a fragmented one, and those carry their
  // index at the front already, so this should find nothing to do. It exists
  // so that stays a checked fact rather than an assumption: if some browser
  // ever writes a plain MP4 with the index at the end, iPhones would quietly
  // stop playing camera videos again and nothing would say why.
  const videoId = (videoRow as { id: string }).id;
  if (storagePath.endsWith(".mp4")) {
    try {
      const head = await fetch(publicUrl, { headers: { Range: "bytes=0-262143" } });
      const needsFix = head.ok && needsFaststart(Buffer.from(await head.arrayBuffer()));
      if (needsFix) {
        const full = await fetch(publicUrl);
        const buf = Buffer.from(await full.arrayBuffer());
        // Remuxing means holding the whole file in memory and writing it twice.
        // A long take is hundreds of megabytes and would blow the time and
        // memory budget, so an oversized one is reported rather than attempted
        // — a loud log beats a request that dies halfway through a rewrite.
        if (buf.length > 80 * 1024 * 1024) {
          console.error(
            `[save-camera-recording] ${videoId}: MP4 index is at the end and the file is ` +
            `${Math.round(buf.length / 1024 / 1024)} MB — too large to remux here. It will not ` +
            `play on iOS. The recorder should be producing fragmented MP4; find out why it isn't.`,
          );
        } else {
          const fixed = await ensureFaststart(buf, videoId);
          if (fixed !== buf) {
            await admin.storage
              .from("assets")
              .upload(storagePath, fixed, { contentType: "video/mp4", upsert: true });
            // Same path, so a copy already in a cache would otherwise win.
            await admin
              .from("generated_videos")
              .update({ video_url: `${publicUrl}?v=${Date.now()}` })
              .eq("id", videoId);
          }
        }
      }
    } catch (err) {
      // The recording is saved and listed by this point. A layout it might not
      // have needed fixing is not worth failing the save over.
      console.error("[save-camera-recording] faststart check failed (non-fatal):", err);
    }
  }

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
  const canSummarise = spokenScript.length > 40;
  if (canSummarise || hook || cta) {
    try {
      const { data: existing } = await admin
        .from("projects")
        .select("seo_data, ai_script")
        .eq("id", resolvedProjectId)
        .single();

      const already = (existing as { seo_data: unknown } | null)?.seo_data;
      if (!already) {
        // Only worth an AI call when there are spoken words to summarise. An
        // uploaded clip has none — its words are still locked inside its audio
        // — so its post copy is built from what the form collected instead of
        // it arriving in My Videos with nothing to publish it with.
        //
        // Bounded: the recording is already saved and playable, so this must
        // never be what makes the request time out. Losing the metadata is
        // recoverable; reporting a failed save for a video that exists is not.
        const seo = canSummarise
          ? await Promise.race([
              generateSeoData(title, spokenScript, []),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
            ])
          : null;

        // The sign-off is appended rather than handed to the model. It is the
        // agent's own wording, and a summariser would paraphrase it.
        const body = seo?.youtube_description || hook || spokenScript;
        const description = [body, cta].filter(Boolean).join("\n\n").slice(0, 4900);

        await admin
          .from("projects")
          .update({
            seo_data: {
              ...(seo ?? {}),
              ...(description && { youtube_description: description }),
            } as unknown as Record<string, unknown>,
            // Keeps the script with the project so the editor and Publish
            // window have something to show for a camera video.
            ai_script: (existing as { ai_script: unknown } | null)?.ai_script
              ?? { title, script: spokenScript, hook, cta, keywords: [] },
          })
          .eq("id", resolvedProjectId);
      }
    } catch (err) {
      console.error("[save-camera-recording] metadata write failed (non-fatal):", err);
    }
  }

  return NextResponse.json({ video: { id: (videoRow as { id: string }).id }, videoId: (videoRow as { id: string }).id, title });
}
