import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateLocationScript,
  parseLocationScript,
  LocationVideoType,
  LocationParams,
} from "@/lib/api/perplexity-prompts";
import { generateYoutubeMetadata } from "@/lib/api/perplexity";
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
    .select("full_name, company_name, phone, company_phone, website")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  }

  // ── Call Perplexity ─────────────────────────────────────────────────────────
  const params: LocationParams = { city, state, zip, month, year, customTopic, audience, tone, ctaPreference };
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

  const aiScript = {
    title: parsed.title,
    hook: parsed.hook,
    hooks: parsed.hooks,
    script: parsed.script,
    cta: parsed.cta,
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
  const ytMeta = await generateYoutubeMetadata({
    title: parsed.title,
    script: parsed.script,
    city,
    state,
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
    ? `${customTopic} — ${city}, ${state}`
    : parsed.title;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title: projectTitle,
      project_type: "location_script",
      status: "draft",
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
