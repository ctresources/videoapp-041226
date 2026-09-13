import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { topTerms } from "@/lib/utils/script-keywords";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const body = await req.json() as {
    title?: string;
    script: string;
    hook?: string;
    city?: string;
    state?: string;
    length?: string;
  };

  const { script, city = "", state = "" } = body;

  // Untitled projects are named for their market, not "My Script". The old
  // fallback put the same string on every untitled video, so a library of them
  // was unscannable — and it leaked into the Publish window as the video's
  // name. Each part is stripped of stray punctuation first: a city typed as
  // "Blue Bell," previously produced "Blue Bell,, PA".
  const cleanPart = (s: string) => s.trim().replace(/[,\s]+$/, "");
  const market = [cleanPart(city), cleanPart(state)].filter(Boolean).join(", ");
  const title = body.title?.trim() || market || "Untitled Video";

  if (!script?.trim()) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Use provided hook, or fall back to first sentence of script
  const firstSentence = script.trim().split(/(?<=[.!?])\s+/)[0] ?? script.trim().slice(0, 120);
  const hookText = body.hook?.trim() || firstSentence;

  /**
   * What this script is about, for the b-roll to follow.
   *
   * Stock footage is searched on the market plus these, and the render prompt
   * lists them as its emphasis. A pasted script used to save an empty array,
   * so both fell back to the town alone: every pasted video got the same few
   * generic neighbourhood clips on a loop, however specific the script was.
   *
   * Counted rather than modelled. This runs on every paste and the answer only
   * has to be good enough to search stock footage with, which does not justify
   * a model call or the wait that comes with it.
   */
  const keywords = topTerms(script);

  const aiScript = {
    title,
    hook: hookText,
    hooks: [hookText],
    script: script.trim(),
    cta: "",
    description: "",
    hashtags: [],
    keywords,
    blog_intro: "",
    blog_body: "",
    blog_conclusion: "",
    video_type: "custom",
    location: city && state ? `${city}, ${state}` : "",
    custom_topic: title,
    /**
     * The length picked on the paste screen.
     *
     * The editor presets its format from exactly this key, and nothing was
     * writing it — so every pasted script arrived on the setup step as a
     * standard video regardless of how long it was. An 8-minute script then
     * sat on a 400-word format, to be trimmed at render with the choice the
     * user had already made nowhere in sight.
     */
    video_length: body.length === "rendered_long" ? "long" : "standard",
    /**
     * This script is spoken as written, and the project has to remember that.
     *
     * The renderer chose its engine from `engine: "direct"`, which the editor
     * read out of the URL — so it survived exactly one visit. Save a draft,
     * reopen it from Drafts or My Content (neither links with a query), and
     * the same script rendered on the summarising agent instead: a
     * 2,900-character story came back as an eight-second teaser, with
     * nothing on screen saying the promise had been dropped.
     */
    verbatim: true,
  };

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      project_type: "location_script",
      status: "draft",
      location_city: city || null,
      location_state: state || null,
      ai_script: aiScript,
      seo_data: {
        meta_title: title,
        meta_description: firstSentence,
        youtube_title: title,
        youtube_description: firstSentence,
        instagram_caption: "",
        hashtags: [],
        keywords,
        thumbnail_url: "",
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      },
    })
    .select()
    .single();

  if (projectError) {
    console.error("paste-script project insert error:", projectError);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }

  return NextResponse.json({ project });
}
