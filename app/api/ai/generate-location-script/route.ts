import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateLocationScript,
  parseLocationScript,
  LocationVideoType,
  LocationParams,
} from "@/lib/api/perplexity-prompts";
import { generateYoutubeMetadata } from "@/lib/api/perplexity";
import { targetWords, maxWords, clampScript, type VideoLength } from "@/lib/utils/video-length";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Parse request body ──────────────────────────────────────────────────────
  const body = await req.json();
  const {
    videoType,
    city,
    state,
    zip,
    month,
    year,
    customTopic,
    audience,
    tone,
    ctaPreference,
    videoLength,
  } = body as {
    videoType: LocationVideoType;
    city: string;
    state: string;
    zip?: string;
    month?: string;
    year?: number;
    customTopic?: string;
    audience?: string;
    tone?: string;
    ctaPreference?: string;
    /** "long" asks for an ~8-minute script; anything else is a standard video. */
    videoLength?: VideoLength;
  };

  // Basic validation
  if (!videoType || !city || !state) {
    return NextResponse.json(
      { error: "videoType, city, and state are required" },
      { status: 400 }
    );
  }

  const needsDate = videoType === "market_update" || videoType === "community_events";
  if (needsDate && (!month || !year)) {
    return NextResponse.json(
      { error: "month and year are required for market_update and community_events" },
      { status: 400 }
    );
  }

  if (videoType === "custom" && !customTopic?.trim()) {
    return NextResponse.json(
      { error: "customTopic is required for custom video type" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, company_name, phone, company_phone, website, subscription_tier")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  }

  // ── Call Perplexity ─────────────────────────────────────────────────────────
  // Script length follows the video the user asked for: a long video needs a
  // ~1,100-word script, a standard one ~400-520 depending on plan. Without this
  // the AI always wrote ~300 words and a "long" video came out ~2 minutes.
  const tier = (profile as { subscription_tier?: string | null }).subscription_tier ?? null;
  const length: VideoLength = videoLength === "long" ? "long" : "standard";
  const words = targetWords(length, tier);
  // The cap is stated in the prompt too. Asking for a target without naming the
  // limit is what produced 676-word scripts against a 522-word target, which
  // were then cut mid-sentence at render time.
  const cap = maxWords(length, tier);

  const params: LocationParams = {
    city, state, zip, month, year, customTopic, audience, tone, ctaPreference,
    targetWords: words,
    maxWords: cap,
  };
  const agentName = (profile as { full_name?: string | null }).full_name || undefined;

  let raw: string;
  try {
    raw = await generateLocationScript(videoType, params, agentName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Script generation failed";
    console.error("Perplexity location script error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Parse into structured ai_script ────────────────────────────────────────
  const parsed = parseLocationScript(raw, videoType, city, state, agentName);

  // The prompt states the cap, but a model overshooting it is not a
  // hypothetical — one real generation came back 594 words against a
  // 500-word cap. Without this, the user sees and edits that longer number
  // in the editor, then the render clamp in create-blog/route.ts quietly
  // trims it down later — a second, invisible edit after the one they just
  // made. Clamping here means the word count shown is the word count spoken.
  //
  // The same reserve-the-CTA-first math as the render clamp, so this cannot
  // agree with the number shown and then disagree with what render enforces.
  const ctaClamped = clampScript(parsed.cta, 200);
  const ctaWordCount = ctaClamped.trim().split(/\s+/).filter(Boolean).length;
  const scriptClamped = clampScript(parsed.script, Math.max(50, cap - ctaWordCount));

  const aiScript = {
    title: parsed.title,
    hook: parsed.hook,
    hooks: parsed.hooks,
    script: scriptClamped,
    cta: ctaClamped,
    description: parsed.description,
    hashtags: parsed.hashtags,
    keywords: parsed.keywords,
    blog_intro: parsed.blog_intro,
    blog_body: parsed.blog_body,
    blog_conclusion: parsed.blog_conclusion,
    sources: parsed.sources,
    raw: parsed.raw,
    video_type: parsed.video_type,
    location: parsed.location,
    custom_topic: customTopic || null,
    audience: audience || null,
    tone: tone || null,
    cta_preference: ctaPreference || null,
    // Lets the editor preselect the matching format instead of defaulting to a
    // standard video and silently trimming a long script.
    video_length: videoLength === "long" ? "long" : "standard",
  };

  // Generate SEO/GEO/AEO-optimized YouTube metadata in parallel — non-blocking
  // failures are tolerated; the script flow shouldn't fail because the YouTube
  // copy step had an upstream hiccup.
  const prof = profile as {
    full_name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    company_phone?: string | null;
    website?: string | null;
  };
  // On a custom topic the script names its own place — "a market update for
  // Blue Bell" must not end up titled, tagged and filed under the saved home
  // market. parsed.location is that resolved place, so everything from here
  // down follows the script rather than the profile.
  const [parsedCity, parsedState] = (parsed.location || "").split(",").map((s) => s.trim());
  const scriptCity = parsedCity || city;
  const scriptState = parsedState || state;

  const ytMeta = await generateYoutubeMetadata({
    title: parsed.title,
    script: parsed.script,
    city: scriptCity,
    state: scriptState,
    agentName: prof.full_name || undefined,
    brokerage: prof.company_name || undefined,
    keywords: parsed.keywords,
    website: prof.website || undefined,
    phone: prof.phone || prof.company_phone || undefined,
  }).catch((err) => {
    console.error("[generate-location-script] YouTube metadata failed:", err);
    return null;
  });

  const thumbnailUrl = `/api/thumbnail?hook=${encodeURIComponent((parsed.hook || parsed.title).slice(0, 180))}&agent=${encodeURIComponent(prof.full_name || "")}`;

  const seoData = {
    meta_title: parsed.title,
    meta_description: parsed.description || parsed.hook,
    keywords: parsed.keywords,
    hashtags: ytMeta?.hashtags?.length ? ytMeta.hashtags : parsed.hashtags,
    blog_intro: parsed.blog_intro,
    sources: parsed.sources,
    youtube_title: ytMeta?.youtube_title || parsed.title,
    youtube_description: ytMeta?.youtube_description || parsed.description || parsed.hook,
    thumbnail_url: thumbnailUrl,
  };

  // ── Create project row ──────────────────────────────────────────────────────
  const projectTitle = customTopic
    ? `${customTopic} — ${[scriptCity, scriptState].filter(Boolean).join(", ")}`
    : parsed.title;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title: projectTitle,
      project_type: "location_script",
      status: "draft",
      // The place the script actually settled on, not the profile's home
      // market — the CTA, the editor's AI Tools and every other per-video
      // regeneration read these, so they must say the city this video is about.
      location_city: scriptCity,
      location_state: scriptState,
      ai_script: aiScript,
      seo_data: seoData,
    })
    .select()
    .single();

  if (projectError) {
    console.error("Project insert error:", projectError);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }

  await admin.from("api_usage_log").insert({
    user_id: user.id,
    api_provider: "perplexity",
    endpoint: "generate-location-script",
    credits_used: 0,
    response_status: 200,
  });

  return NextResponse.json({ project });
}
