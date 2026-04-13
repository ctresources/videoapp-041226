import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateLocationScript,
  parseLocationScript,
  LocationVideoType,
  LocationParams,
} from "@/lib/api/perplexity-prompts";
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
  } = body as {
    videoType: LocationVideoType;
    city: string;
    state: string;
    zip?: string;
    month?: string;
    year?: number;
    customTopic?: string;
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

  // ── Check credits ───────────────────────────────────────────────────────────
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("credits_remaining, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || (profile as { credits_remaining: number }).credits_remaining < 1) {
    return NextResponse.json(
      { error: "No credits remaining. Please upgrade your plan." },
      { status: 402 }
    );
  }

  // ── Call Perplexity ─────────────────────────────────────────────────────────
  const params: LocationParams = { city, state, zip, month, year, customTopic };
  const agentName = (profile as { credits_remaining: number; full_name?: string | null }).full_name || undefined;

  let raw: string;
  try {
    raw = await generateLocationScript(videoType, params, agentName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Script generation failed";
    console.error("Perplexity location script error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Parse into structured ai_script ────────────────────────────────────────
  const parsed = parseLocationScript(raw, videoType, city, state);

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
  };

  const seoData = {
    meta_title: parsed.title,
    meta_description: parsed.description || parsed.hook,
    keywords: parsed.keywords,
    hashtags: parsed.hashtags,
    blog_intro: parsed.blog_intro,
    sources: parsed.sources,
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

  // ── Deduct 1 credit ─────────────────────────────────────────────────────────
  await admin
    .from("profiles")
    .update({
      credits_remaining: (profile as { credits_remaining: number }).credits_remaining - 1,
    })
    .eq("id", user.id);

  // ── Log API usage ───────────────────────────────────────────────────────────
  await admin.from("api_usage_log").insert({
    user_id: user.id,
    api_provider: "perplexity",
    endpoint: "generate-location-script",
    credits_used: 1,
    response_status: 200,
  });

  return NextResponse.json({ project });
}
