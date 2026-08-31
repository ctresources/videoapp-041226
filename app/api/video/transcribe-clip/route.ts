/**
 * POST /api/video/transcribe-clip — { videoId }
 *
 * Turns an uploaded clip's own audio into text, and hands that text to
 * everything downstream that had been going without it.
 *
 * An uploaded clip was the one video the app could not describe: the camera
 * tab has the script that was read and every rendered video has the script it
 * was written from, but this clip's words were locked inside its audio. So it
 * arrived in My Videos with a filename, no captions, and a description built
 * out of whatever the upload form could be bothered to collect.
 *
 * The transcription runs against the file already in storage rather than
 * anything posted here, which is what keeps a 500 MB walkthrough from having
 * to fit through a serverless request body. One pass produces the captions,
 * the .srt, the description and the hashtags.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureVideoSrt } from "@/lib/utils/video-srt";
import { parseSrt, srtToPlainText } from "@/lib/utils/srt";
import { generateSeoData } from "@/lib/api/perplexity";
import { NextRequest, NextResponse } from "next/server";

// Downloading the recording and transcribing it, on the same budget the
// captions route runs on for the same work.
export const maxDuration = 300;

/** Below this there is nothing worth asking a summariser about — a stray
 *  "hello" at the top of a silent walkthrough is not a description. */
const MIN_WORDS_FOR_SEO = 25;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();

  const srtResult = await ensureVideoSrt(admin, user.id, videoId);
  if (!srtResult.ok) {
    // A clip with no speech in it is a normal outcome, not a failure — plenty
    // of walkthroughs are shot silent. The caller says so quietly rather than
    // showing an error over a video that saved perfectly well.
    const silent = srtResult.status === 422;
    return NextResponse.json(
      { error: srtResult.error, silent },
      { status: silent ? 200 : srtResult.status },
    );
  }

  const text = srtToPlainText(parseSrt(srtResult.srt));
  const words = text ? text.split(/\s+/).length : 0;

  const { data: video } = await admin
    .from("generated_videos")
    .select("project_id")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  const projectId = (video as { project_id: string | null } | null)?.project_id;
  if (!projectId) return NextResponse.json({ text, words, applied: false });

  try {
    const { data: project } = await admin
      .from("projects")
      .select("title, ai_script, seo_data")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    const ai = (project?.ai_script as Record<string, unknown> | null) ?? {};
    const seo = (project?.seo_data as Record<string, unknown> | null) ?? {};
    const title = (project?.title as string) || "Video";
    // Written by the upload form, and re-appended below rather than fed to the
    // summariser: it is the agent's own wording and would come back paraphrased.
    const cta = typeof ai.cta === "string" ? ai.cta : "";

    // Never overwrite words someone typed. A clip re-transcribed after its
    // transcript was corrected must not have the correction thrown away, and
    // the same route reached twice must not undo the first pass.
    const existingScript = typeof ai.script === "string" ? ai.script.trim() : "";

    let description = typeof seo.youtube_description === "string" ? seo.youtube_description : "";
    let seoTitle = typeof seo.youtube_title === "string" ? seo.youtube_title : "";
    let hashtags = Array.isArray(seo.hashtags) ? seo.hashtags : [];

    if (words >= MIN_WORDS_FOR_SEO) {
      // Bounded, and non-fatal: the transcript is the point of this request and
      // is already saved by now. Losing the SEO pass costs a description;
      // failing the request over it would cost the transcript too.
      const generated = await Promise.race([
        generateSeoData(title, text, []).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000)),
      ]);
      if (generated) {
        const body = (generated as { youtube_description?: string }).youtube_description;
        if (body) description = [body, cta].filter(Boolean).join("\n\n").slice(0, 4900);
        seoTitle = (generated as { youtube_title?: string }).youtube_title || seoTitle;
        const tags = (generated as { hashtags?: string[] }).hashtags;
        if (Array.isArray(tags) && tags.length) hashtags = tags;
      }
    }

    await admin
      .from("projects")
      .update({
        ai_script: { ...ai, ...(existingScript ? {} : { script: text }) },
        seo_data: {
          ...seo,
          ...(seoTitle && { youtube_title: seoTitle }),
          ...(description && { youtube_description: description }),
          ...(hashtags.length && { hashtags }),
        },
      })
      .eq("id", projectId);

    return NextResponse.json({ text, words, applied: true });
  } catch (err) {
    // The transcript itself is cached on the video row regardless, so the
    // captions and the .srt are already better off than before this ran.
    console.error("[transcribe-clip] could not apply transcript to project:", err);
    return NextResponse.json({ text, words, applied: false });
  }
}
