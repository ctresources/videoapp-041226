import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareImportedArticle } from "@/lib/api/article-import";
import { ensureSparkFor } from "@/lib/utils/ensure-spark";
import { freeTrialLocked } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";

/**
 * Save an article the agent already has, as it is.
 *
 * The sibling of generate-location-script, and deliberately not part of it: that
 * route researches a subject and writes a piece, which takes about a minute and
 * is the wrong answer for an article that is already finished. Here the text is
 * the output, not the input — nothing is rewritten — and the AI is used only for
 * the headline, description, hashtags and any missing headings.
 *
 * Lands on the same Share Kit, as the same kind of project, so everything
 * downstream — the editor, the Spark card, the calendar, turning it into a video
 * later — treats an imported article exactly like a generated one.
 */

// One short metadata call, no web research. The generating route needs 300.
export const maxDuration = 60;

const MAX_CHARS = 20000;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let text = "";
  let title = "";
  let city = "";
  let state = "";
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text : "";
    title = typeof body.title === "string" ? body.title : "";
    city = typeof body.city === "string" ? body.city : "";
    state = typeof body.state === "string" ? body.state : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const article = text.trim().slice(0, MAX_CHARS);
  if (article.split(/\s+/).filter(Boolean).length < 100) {
    return NextResponse.json(
      { error: "That's too short to publish as an article — bring in the full piece, or have AI write one from it." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from("profiles")
    .select("full_name, subscription_tier, role, first_video_generated_at, location_city, location_state")
    .eq("id", user.id)
    .single();
  if (!profileRow) return NextResponse.json({ error: "Profile not found." }, { status: 400 });

  const profile = profileRow as {
    full_name?: string | null;
    role?: string | null;
    subscription_tier?: string | null;
    first_video_generated_at?: string | null;
    location_city?: string | null;
    location_state?: string | null;
  };

  /**
   * The same article gate the writer route applies. Importing is cheaper than
   * generating, but it produces the same thing — an article in the Share Kit —
   * so a closed trial cannot be a way around it. Refused outright rather than
   * saved with the article stripped out: here the article IS the request.
   */
  const blogAllowed = profile.role === "admin"
    || !freeTrialLocked(profile.first_video_generated_at, profile.subscription_tier);
  if (!blogAllowed) {
    return NextResponse.json(
      { error: "Your free 30 days have ended. Pick a plan to keep publishing articles." },
      { status: 403 },
    );
  }

  const articleCity = city.trim() || profile.location_city || "";
  const articleState = state.trim() || profile.location_state || "";

  let prepared;
  try {
    prepared = await prepareImportedArticle({
      text: article,
      fallbackTitle: title.trim() || "Untitled article",
      city: articleCity || undefined,
      state: articleState || undefined,
    });
  } catch (err) {
    console.error("import-article failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not prepare that article" },
      { status: 500 },
    );
  }

  /**
   * Shaped like a generated project so nothing downstream needs to know the
   * difference. The script is deliberately empty: no video has been asked for,
   * and the editor already offers to write one from the article when it is.
   */
  const aiScript = {
    title: prepared.headline,
    hook: prepared.headline,
    hooks: [],
    script: "",
    cta: "",
    description: prepared.description,
    hashtags: prepared.hashtags,
    keywords: prepared.keywords,
    blog_intro: prepared.intro,
    blog_body: prepared.body,
    blog_conclusion: prepared.conclusion,
    sources: [],
    raw: "",
    video_type: "custom",
    location: [articleCity, articleState].filter(Boolean).join(", "),
    custom_topic: title.trim() || prepared.headline,
    // What this project is, for anything later that wants to know the article
    // was not written here — including the agent, reading it back in a month.
    imported: true,
    video_length: "standard",
    video_platform: "youtube",
  };

  const seoData = {
    meta_title: prepared.headline,
    meta_description: prepared.description,
    keywords: prepared.keywords,
    hashtags: prepared.hashtags,
    blog_intro: prepared.intro,
    sources: [],
    youtube_title: prepared.headline,
    youtube_description: prepared.description,
  };

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title: prepared.headline,
      project_type: "location_script",
      status: "draft",
      location_city: articleCity,
      location_state: articleState,
      ai_script: aiScript,
      seo_data: seoData,
    })
    .select()
    .single();

  if (projectError) {
    console.error("import-article project insert error:", projectError);
    return NextResponse.json({ error: "Failed to save the article" }, { status: 500 });
  }

  await ensureSparkFor(admin, user.id, (project as { id: string }).id);

  await admin.from("api_usage_log").insert({
    user_id: user.id,
    api_provider: "perplexity",
    endpoint: "import-article",
    credits_used: 0,
    response_status: 200,
  });

  return NextResponse.json({ project, headingsAdded: prepared.headingsAdded });
}
