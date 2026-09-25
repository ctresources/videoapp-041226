import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_IMAGES_BEFORE_VIDEO, freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";
import {
  IMAGE_SHAPES, IMAGE_TEMPLATES, makeBackground, renderImage,
  type ImageShape, type ImageTemplate, type ImageText,
} from "@/lib/utils/image-render";
import { IMAGE_MONTHLY_LIMIT, aiImagesUsedThisMonth } from "@/lib/utils/image-allowance";
import { articlePhotoBrief } from "@/lib/api/photo-brief";

// Two AI backgrounds in parallel, each up to a minute, then two renders.
export const maxDuration = 180;

interface Body {
  action?: "generate" | "rerender" | "attach";
  template?: string;
  shape?: string;
  scene?: string;
  city?: string;
  state?: string;
  kicker?: string;
  headline?: string;
  subline?: string;
  accent?: string;
  showLogo?: boolean;
  showHeadshot?: boolean;
  projectId?: string;
  /** The agent's own photo as the background. Free, and never counted. */
  photoUrl?: string;
  /** rerender: the background to draw over again. */
  backgroundUrl?: string;
  /** rerender: make a fresh AI background instead (counted). */
  newBackground?: boolean;
  /** attach */
  imageUrl?: string;
  target?: "blog_header" | "share_kit";
}

interface ProjectRow {
  id: string;
  user_id: string;
  ai_script: Record<string, unknown> | null;
  seo_data: Record<string, unknown> | null;
}

const isHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u);

/**
 * POST /api/tools/image
 *
 * generate: one image, over an AI background or the agent's own photo.
 * rerender: the same background with the current text, or one new background.
 * attach:   save an image as a project's blog header or into its Share Kit.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id, { preVideo: "allow" });
  if (gate) return gate;

  const body = (await req.json()) as Body;
  const admin = createAdminClient();

  const { data: profileRow } = await admin
    .from("profiles")
    .select("role, first_video_generated_at")
    .eq("id", user.id)
    .single();
  const profile = profileRow as { role?: string; first_video_generated_at?: string | null } | null;
  const unlimited = profile?.role === "admin";
  /**
   * Two before the free video, a hundred after it.
   *
   * The gate above lets an account this new through — this is the ceiling it
   * is let through to. Counted the same way as the monthly hundred, from rows
   * in generated_images, so there is one definition of "an AI image used".
   */
  const imageLimit = profile?.first_video_generated_at
    ? IMAGE_MONTHLY_LIMIT
    : FREE_IMAGES_BEFORE_VIDEO;

  let project: ProjectRow | null = null;
  if (body.projectId) {
    const { data } = await admin
      .from("projects")
      .select("id, user_id, ai_script, seo_data")
      .eq("id", body.projectId)
      .single();
    project = data as ProjectRow | null;
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // ── attach ────────────────────────────────────────────────────────────────
  if (body.action === "attach") {
    if (!project) return NextResponse.json({ error: "Pick a project first." }, { status: 400 });
    // Only images this account made. The URL ends up inside HTML the agent
    // pastes into their own site, so it must not be anything a request can name.
    if (!isHttp(body.imageUrl) || !body.imageUrl.includes(`/assets/images/${user.id}/img_`)) {
      return NextResponse.json({ error: "That image can't be saved here." }, { status: 400 });
    }
    if (body.target === "blog_header") {
      await admin
        .from("projects")
        .update({ ai_script: { ...(project.ai_script || {}), blog_header_url: body.imageUrl } })
        .eq("id", project.id)
        .eq("user_id", user.id);
    } else {
      const existing = Array.isArray(project.seo_data?.share_images)
        ? (project.seo_data!.share_images as unknown[]).filter((u): u is string => typeof u === "string")
        : [];
      const share_images = [body.imageUrl, ...existing.filter((u) => u !== body.imageUrl)].slice(0, 12);
      await admin
        .from("projects")
        .update({ seo_data: { ...(project.seo_data || {}), share_images } })
        .eq("id", project.id)
        .eq("user_id", user.id);
    }
    await admin
      .from("generated_images")
      .update({ project_id: project.id })
      .eq("user_id", user.id)
      .eq("image_url", body.imageUrl);
    return NextResponse.json({ ok: true });
  }

  // ── generate / rerender ───────────────────────────────────────────────────
  const template: ImageTemplate = (IMAGE_TEMPLATES as readonly string[]).includes(body.template ?? "")
    ? (body.template as ImageTemplate)
    : "blank";
  const shape: ImageShape = body.shape && body.shape in IMAGE_SHAPES ? (body.shape as ImageShape) : "post_4x5";
  const text: ImageText = {
    kicker: (body.kicker || "").slice(0, 30),
    headline: (body.headline || "").slice(0, 120),
    subline: (body.subline || "").slice(0, 160),
    accent: body.accent,
    showLogo: body.showLogo !== false,
    showHeadshot: !!body.showHeadshot,
  };
  /**
   * What the picture is of.
   *
   * Typed always wins. When nothing is typed and this is an article header,
   * the article decides: the generator only ever knew the template, so every
   * blog header came out a house whatever the piece was about. The brief is a
   * text call, not an image one — it costs a fraction of a cent and is skipped
   * for every other template.
   */
  let scene = (body.scene || "").slice(0, 300);
  let suggestedScene: string | null = null;
  if (!scene.trim() && template === "blog_header" && project) {
    const ai = (project.ai_script ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const headline = str(ai.blog_headline) || str(ai.title) || (body.headline || "");
    const brief = headline
      ? await articlePhotoBrief({
          headline,
          body: [str(ai.blog_intro), str(ai.blog_body)].filter(Boolean).join(" "),
          city: body.city,
          state: body.state,
        })
      : null;
    // The headline itself beats the template's fallback even when the brief
    // fails: it is at least what the article is about.
    suggestedScene = brief || headline || null;
    if (suggestedScene) scene = suggestedScene.slice(0, 300);
  }
  const common = { userId: user.id, template, shape, scene, city: body.city, state: body.state };

  async function limitResponse(needed: number) {
    if (unlimited) return null;
    const used = await aiImagesUsedThisMonth(admin, user!.id);
    if (used + needed > imageLimit) {
      const beforeVideo = imageLimit === FREE_IMAGES_BEFORE_VIDEO;
      return NextResponse.json(
        {
          // Two different facts, and the second is not a smaller version of
          // the first: one is "come back on the 1st", the other is "the thing
          // that lifts this is free and takes a minute".
          error: beforeVideo
            ? `You've used your ${FREE_IMAGES_BEFORE_VIDEO} free AI images. Make your free video — it costs nothing and unlocks ${IMAGE_MONTHLY_LIMIT} a month for 30 days.`
            : `You've used ${used} of your ${IMAGE_MONTHLY_LIMIT} AI images this month. They reset on the 1st. Images over your own photos are still free.`,
          used,
          limit: imageLimit,
        },
        { status: 402 },
      );
    }
    return null;
  }

  async function record(url: string, bg: { url: string; ai: boolean }) {
    const { data } = await admin
      .from("generated_images")
      .insert({
        user_id: user!.id,
        project_id: project?.id ?? null,
        template,
        shape,
        image_url: url,
        background_url: bg.url,
        ai_background: bg.ai,
      })
      .select("id")
      .single();
    return { id: (data as { id: string } | null)?.id ?? url, url, backgroundUrl: bg.url };
  }

  const usedNow = async () => (unlimited ? null : await aiImagesUsedThisMonth(admin, user.id));

  try {
    if (body.action === "rerender") {
      let bg: { url: string; ai: boolean };
      if (body.newBackground) {
        const refused = await limitResponse(1);
        if (refused) return refused;
        bg = await makeBackground({ ...common, variant: 1 + Math.floor(Math.random() * 3) });
      } else {
        if (!isHttp(body.backgroundUrl)) {
          return NextResponse.json({ error: "Make the image first, then edit its text." }, { status: 400 });
        }
        // An existing background: redrawing text over it costs nothing.
        bg = { url: body.backgroundUrl, ai: false };
      }
      const url = await renderImage({ userId: user.id, shape, backgroundUrl: bg.url, text });
      const image = await record(url, bg);
      return NextResponse.json({ image, used: await usedNow(), limit: imageLimit, aiBackground: bg.ai });
    }

    const photoUrl = isHttp(body.photoUrl) ? body.photoUrl : undefined;
    if (!photoUrl && !scene.trim() && !text.headline && !text.kicker && !text.subline) {
      return NextResponse.json({ error: "Describe the image or type a headline first." }, { status: 400 });
    }

    /**
     * One image, not two.
     *
     * Two takes to choose between sounds generous and is not: each one is a
     * separate AI image, so every press cost two of the monthly hundred and
     * twice the money — including the half of them nobody looked at twice.
     * New background makes another for the price of one, which is the same
     * choice paid for only when it is wanted.
     */
    const variants = [0];
    if (!photoUrl) {
      const refused = await limitResponse(variants.length);
      if (refused) return refused;
    }

    const backgrounds = await Promise.all(
      variants.map((variant) => makeBackground({ ...common, variant, photoUrl })),
    );
    const images = await Promise.all(
      backgrounds.map(async (bg) => record(await renderImage({ userId: user.id, shape, backgroundUrl: bg.url, text }), bg)),
    );

    return NextResponse.json({
      images,
      used: await usedNow(),
      limit: imageLimit,
      aiBackground: backgrounds.some((b) => b.ai),
      // Handed back so the Describe box can show what was asked for. A brief
      // the agent cannot see is one they cannot correct, and the next press of
      // New background would quietly ask for something else.
      scene: suggestedScene,
    });
  } catch (err) {
    console.error("[tools/image] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The image could not be made. Try again." },
      { status: 500 },
    );
  }
}
