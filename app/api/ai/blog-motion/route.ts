/**
 * POST /api/ai/blog-motion   { projectId, kind: "header" | "teaser" }
 *
 * Two moving things made from an article's header image.
 *
 * "header": the header picture, moving. A few seconds of slow camera movement
 * that opens on the image, played forwards and then backwards so it loops
 * without a jump, silent, and small enough to sit at the top of a post. Copy
 * as HTML then puts it there, with the still picture inside it as the
 * fallback for a site that will not play video.
 *
 * "teaser": a short vertical clip for social, to send people to the article:
 * the same movement, the headline in real type over it, the agent's name and
 * logo, music, and a closing card that says to read the full article. The
 * headline is set as type by the renderer and not asked of the model, which
 * is reliable for three words and not for a sentence.
 *
 * Both start from a picture that already exists and that the agent chose, so
 * the same rule holds as for a Cinematic reel: the clip may move, but may not
 * show anything the picture did not. It is the same maker, with the same
 * check (cinematic-clips.ts), and a clip that leaves its picture is refused.
 *
 * What is animated is the picture UNDER the header, not the header. A header
 * usually has the headline, the logo and a headshot drawn on it, and the
 * first real run animated one as it stood: by the middle of the clip the
 * headline and the logo had dissolved, and the check that guards against a
 * clip leaving its picture passed it, because a wide view with its words gone
 * still looks like the same wide view. The image generator keeps the clean
 * picture it drew those words on (generated_images.background_url), so that
 * is what moves. The words come back as real type: from the page's own <h1>
 * under a moving header, and from the renderer on a teaser.
 *
 * Neither uses a video from the plan. A clip is about five seconds, a few
 * cents; what stops that adding up is that each article can have each one
 * made a handful of times, counted on the article.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { makeCinematicClips } from "@/lib/api/cinematic-clips";
import { generateSilentAudio, renderPhotoSlideshow } from "@/lib/api/ffmpeg-render";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { formatPhone } from "@/lib/utils/format-phone";
import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

export const maxDuration = 300;

/** How many times each can be made for one article. Enough to try again, not enough to matter. */
const MAKES_PER_ARTICLE = 4;
const CLIP_SECONDS = 5;
const TEASER_SECONDS = 8;

/**
 * The clip forwards, then backwards, as one silent file.
 *
 * A camera move that ends somewhere other than it began jumps when it loops.
 * Played out and back it returns to its first frame, which is the header
 * picture itself, so the loop has no seam and the still and the video agree.
 */
async function loopable(clipUrl: string): Promise<Buffer> {
  const dir = join(tmpdir(), `blog-motion-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const src = join(dir, "in.mp4");
    const out = join(dir, "out.mp4");
    const res = await fetch(clipUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`clip download HTTP ${res.status}`);
    await fs.writeFile(src, Buffer.from(await res.arrayBuffer()));
    await new Promise<void>((resolve, reject) => {
      ffmpeg(src)
        .complexFilter("[0:v]scale=1280:-2,fps=24,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]")
        .outputOptions(["-map [v]", "-an", "-c:v libx264", "-preset veryfast", "-crf 27", "-pix_fmt yuv420p", "-movflags +faststart"])
        .on("end", () => resolve())
        .on("error", (e) => reject(e))
        .save(out);
    });
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, kind } = (await req.json().catch(() => ({}))) as { projectId?: string; kind?: string };
  if (!projectId || (kind !== "header" && kind !== "teaser")) {
    return NextResponse.json({ error: "projectId and kind are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("projects")
    .select("id, user_id, title, ai_script, location_city, location_state")
    .eq("id", projectId)
    .maybeSingle();
  const project = row as {
    id: string; user_id: string; title: string | null;
    ai_script: Record<string, unknown> | null;
    location_city: string | null; location_state: string | null;
  } | null;
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const ai = project.ai_script ?? {};
  const headerUrl = typeof ai.blog_header_url === "string" ? ai.blog_header_url : "";
  if (!headerUrl.startsWith("https://")) {
    return NextResponse.json({ error: "Make a header image for this article first. Both of these start from it." }, { status: 400 });
  }

  // The clean picture the header was drawn on. Only pictures this account
  // made are looked for, and a header with no record of one is not animated.
  const { data: made_from } = await admin
    .from("generated_images")
    .select("background_url")
    .eq("user_id", user.id)
    .eq("image_url", headerUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pictureUrl = (made_from as { background_url: string | null } | null)?.background_url ?? "";
  if (!pictureUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "This header image has no clean picture on record to animate. Make a new header image for the article, then try again." },
      { status: 400 },
    );
  }

  const countKey = kind === "header" ? "blog_header_video_makes" : "blog_teaser_makes";
  const made = Number(ai[countKey]) || 0;
  if (made >= MAKES_PER_ARTICLE) {
    return NextResponse.json(
      { error: `This article has had its ${kind === "header" ? "moving header" : "teaser"} made ${MAKES_PER_ARTICLE} times, which is the limit for one article.` },
      { status: 429 },
    );
  }

  // The same gate the other article tools have. Not charged against the plan.
  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  try {
    // One clip, checked against the picture it was made from, with one retry.
    const [clip] = await makeCinematicClips([pictureUrl], CLIP_SECONDS);
    if (!clip) {
      return NextResponse.json(
        { error: "The picture could not be animated without changing it, so nothing was made. Try again, or try a different header image." },
        { status: 502 },
      );
    }

    const stamp = Date.now();
    let file: Buffer;
    let path: string;
    let field: string;

    if (kind === "header") {
      file = await loopable(clip.url);
      path = `camera-recordings/${user.id}/blog-header-${project.id}-${stamp}.mp4`;
      field = "blog_header_video_url";
    } else {
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name, logo_url, avatar_url, phone, company_phone, website")
        .eq("id", user.id)
        .single();
      const p = (prof ?? {}) as Record<string, string | null>;
      const headline = (typeof ai.blog_headline === "string" && ai.blog_headline.trim()) || project.title || "New on the blog";

      let musicUrl: string | null = null;
      try {
        musicUrl = (await searchBackgroundMusic("inspiring uplifting cinematic background music", 1))[0]?.audio_url ?? null;
      } catch (e) {
        console.warn("[blog-motion] music lookup failed:", e);
      }

      const site = (p.website || "").replace(/^https?:\/\//i, "").replace(/\/$/, "").trim();
      file = await renderPhotoSlideshow(
        {
          title: headline.slice(0, 90),
          // Silence sets the length; the music is the soundtrack.
          audioBuffer: await generateSilentAudio(TEASER_SECONDS),
          photoUrls: [pictureUrl],
          wordTimestamps: [],
          clips: [clip],
          photoCaptions: [],
          logoUrl: p.logo_url ?? undefined,
          avatarUrl: p.avatar_url ?? undefined,
          agentName: p.full_name ?? undefined,
          musicUrl,
          musicVolume: 0.55,
          endCard: {
            headline: "Read the full article",
            // Where to read it, when there is somewhere to send them.
            address: site.slice(0, 80),
            market: [project.location_city, project.location_state].filter(Boolean).join(", ").slice(0, 80),
            phone: formatPhone(p.phone || p.company_phone),
          },
        },
        "reel_9x16",
      );
      path = `camera-recordings/${user.id}/blog-teaser-${project.id}-${stamp}.mp4`;
      field = "blog_teaser_url";
    }

    const { error: upErr } = await admin.storage.from("assets").upload(path, file, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Could not save it: ${upErr.message}`);
    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

    // Read again before writing: the article may have been edited in the
    // minute this took, and writing back the copy read at the start would
    // undo that.
    const { data: fresh } = await admin.from("projects").select("ai_script").eq("id", project.id).single();
    const latest = ((fresh as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? ai;
    await admin
      .from("projects")
      .update({
        ai_script: {
          ...latest,
          [field]: publicUrl,
          [countKey]: made + 1,
          // What the moving header opens on, for its poster: the clean
          // picture, so the still and the first frame are the same thing.
          ...(kind === "header" && { blog_header_video_poster: pictureUrl }),
        },
      })
      .eq("id", project.id)
      .eq("user_id", user.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: kind === "header" ? "blog-moving-header" : "blog-teaser",
      credits_used: 0,
      response_status: 200,
    });

    return NextResponse.json({ url: publicUrl, kind, poster: pictureUrl, left: MAKES_PER_ARTICLE - made - 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not make that";
    console.error("[blog-motion]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
