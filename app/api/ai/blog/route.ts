import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBlogFromScript } from "@/lib/api/blog-writer";
import { ensureVideoSrt } from "@/lib/utils/video-srt";
import { parseSrt, srtToPlainText } from "@/lib/utils/srt";

/**
 * POST /api/ai/blog — { projectId, force? }
 *
 * Writes the blog article for a project from whatever script that project
 * has, whoever wrote it and however the video was made.
 *
 * One endpoint rather than a call bolted onto each of the five create routes.
 * Two reasons. It is the same work every time — a script goes in, an article
 * comes out — so five copies would be five places to drift. And the routes it
 * would have to be bolted onto are the ones that can least afford it:
 * save-camera-recording has a 60 second budget and already spends up to 25 of
 * them summarising for the post copy, so a second Perplexity call in there
 * would put a video that is already uploaded and safe at risk of reporting a
 * failure.
 *
 * It is also the only shape that works for a photo reel, which has no create
 * route with a script in it at all — the words only exist after the render.
 */

// Writing the article is well under a minute. The budget is for the case
// underneath it: a Speak naturally recording has no script, so the words have
// to be transcribed off the video first, and that means downloading it — the
// same 300 the captions and transcript routes run on, for the same work.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, force } = (await req.json()) as { projectId?: string; force?: boolean };
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: projectRow } = await admin
    .from("projects")
    .select("id, user_id, title, ai_script, location_city, location_state")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  const project = projectRow as {
    id: string;
    title: string | null;
    ai_script: Record<string, unknown> | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const script = (project.ai_script ?? {}) as Record<string, unknown>;

  // Already written, and not asked to redo it. Returned rather than
  // regenerated so opening the Share Kit twice does not cost two calls.
  const existingBody = String(script.blog_body ?? "");
  if (existingBody && !force) {
    return NextResponse.json({
      blog: {
        intro: String(script.blog_intro ?? ""),
        body: existingBody,
        conclusion: String(script.blog_conclusion ?? ""),
      },
      reused: true,
    });
  }

  let spoken = String(script.script ?? "").trim();

  /**
   * Nothing written down — so read it off the video instead.
   *
   * This is the Speak naturally route, and an upload of footage shot
   * elsewhere. Both produce a real video with real words in it and an empty
   * `script`, because there never was a teleprompter. Refusing them an
   * article would leave the one route where the agent has the most to say
   * as the only route that cannot have it written up.
   *
   * ensureVideoSrt caches, so this costs a transcription once per video and
   * nothing on any later visit — including the one the Edit transcript button
   * may already have paid for.
   */
  if (spoken.length < 200) {
    const { data: vid } = await admin
      .from("generated_videos")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("render_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const videoId = (vid as { id: string } | null)?.id;
    if (videoId) {
      const srt = await ensureVideoSrt(admin, user.id, videoId);
      if (srt.ok) spoken = srtToPlainText(parseSrt(srt.srt)).trim();
    }
  }

  if (spoken.length < 200) {
    // Said plainly rather than returning an empty blog. A ten-second take has
    // nothing to expand into a thousand words, and an article invented from
    // three sentences is worse than none.
    return NextResponse.json(
      { error: "There aren't enough words in this video yet to write an article from." },
      { status: 422 },
    );
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const article = await generateBlogFromScript({
    title: String(script.title ?? project.title ?? "").trim(),
    script: spoken,
    city: project.location_city,
    state: project.location_state,
    agentName: (profileRow as { full_name: string | null } | null)?.full_name ?? null,
    // The unbranded cut's own rule follows the script it was written for.
    unbranded: script.cta === "",
  });

  if (!article) {
    return NextResponse.json(
      { error: "Couldn't write the article just now. Try again in a moment." },
      { status: 502 },
    );
  }

  // Merged into ai_script rather than replacing it — everything else on that
  // object is the script itself, and this endpoint owns three fields of it.
  const { error: updateErr } = await admin
    .from("projects")
    .update({
      ai_script: {
        ...script,
        blog_intro: article.intro,
        blog_body: article.body,
        blog_conclusion: article.conclusion,
      },
    })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[ai/blog] save failed:", updateErr.message);
    // The article exists and the caller can still use it; only the copy on
    // the project is missing. Returning it beats throwing it away.
    return NextResponse.json({ blog: article, saved: false });
  }

  return NextResponse.json({ blog: article, saved: true });
}
