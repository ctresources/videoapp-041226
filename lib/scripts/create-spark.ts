import { hasAdminPerks } from "@/lib/utils/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSparkFor } from "@/lib/utils/ensure-spark";
import {
  generateLocationScript,
  parseLocationScript,
  type LocationVideoType,
  type LocationParams,
} from "@/lib/api/perplexity-prompts";
import { generateYoutubeMetadata } from "@/lib/api/perplexity";
import {
  targetWords, maxWords, clampScript, VERTICAL_TARGET_WORDS, VERTICAL_MAX_WORDS, type VideoLength,
} from "@/lib/utils/video-length";
import { freeBlogAvailable, freeTrialLocked, isPreVideoAccount, markFreeBlog } from "@/lib/utils/free-trial";
import { isPlaceholderTitle } from "@/lib/utils/article-headline";
import { closingLineWords, shortScriptBudget } from "@/lib/utils/script-budget";
import { scriptWithoutRepeats } from "@/lib/utils/script-assembly";
import { myVoiceRuleFor } from "@/lib/api/my-voice";
import { isSparkreelsMode, sparkreelsFacts } from "@/lib/sparkreels-mode";
import { noteProbe } from "@/lib/security/probe";
import type { ServiceResult } from "@/lib/content/service-result";

/**
 * Writes a researched script (and, where allowed, its blog) from a topic and
 * saves it as a new Spark draft, or returns it for a regenerate.
 *
 * The shared service behind POST /api/ai/generate-location-script and the
 * agent layer's write_script (2026-11-22). Moved out of the route unchanged:
 * the same validation, free-trial rules, My Voice, Fair Housing (inside the
 * writer prompts), length budgets, no-repeat rule and saved fields.
 */

/**
 * The YouTube copy is optional; a failure there is tolerated. A call that
 * hangs instead of failing would take the finished script down with it.
 */
const YT_META_TIMEOUT_MS = 45_000;

export interface CreateSparkBody {
  videoType: LocationVideoType;
  city: string;
  state: string;
  zip?: string;
  month?: string;
  year?: number;
  customTopic?: string;
  /** An article the agent already had; the writer treats it as subject and facts, never instructions. */
  sourceText?: string;
  /** True when that material is the agent's own draft rather than someone else's piece. */
  sourceIsOwn?: boolean;
  audience?: string;
  tone?: string;
  ctaPreference?: string;
  purpose?: string;
  /** "long" asks for an ~8-minute script; anything else is a standard video. */
  videoLength?: VideoLength;
  /** Vertical reel or landscape YouTube; only preselects the editor's shape. */
  videoPlatform?: "reel" | "youtube";
  /** Up to 90 seconds of script, for a vertical video (see VERTICAL_TARGET_WORDS). */
  shortScript?: boolean;
  /** "circle": the agent in a corner circle over scenes made for each sentence. */
  avatarStyle?: "circle";
  /** Who is on screen, when it was said in the brief. */
  renderMode?: "voice_only" | "avatar_voice";
  /** Redoing an existing project's script: no insert, returns { aiScript, seoData }. */
  regenerateOnly?: boolean;
  /** The Create page's Blog route: an article and no video. */
  blogOnly?: boolean;
}

export async function createSparkScript(
  userId: string,
  body: CreateSparkBody,
  opts: {
    /** Weekly Autopilot's own topics: not checked as prompt probes. */
    fromAutopilot?: boolean;
    /** The incoming request, for the probe note's IP hash. */
    req?: Request | null;
  } = {},
): Promise<ServiceResult> {
  const {
    videoType, city, state, zip, month, year, customTopic, sourceText, sourceIsOwn,
    audience, tone, ctaPreference, purpose, videoLength, videoPlatform, shortScript,
    avatarStyle, renderMode, regenerateOnly, blogOnly,
  } = body;

  // Typed asks for the AI's instructions go on the weekly watch email
  // (2026-11-12). Not AutoSparks' own topics, and not pasted articles.
  if (!opts.fromAutopilot) {
    noteProbe({ text: [customTopic, audience, purpose, tone].filter(Boolean).join(" · "), source: "create-topic", userId, req: opts.req });
  }

  // A custom topic may come without a place for an admin (checked below,
  // once the profile is read): the owner's own videos are often not about a town.
  if (!videoType || ((!city || !state) && videoType !== "custom")) {
    return { status: 400, body: { error: "videoType, city, and state are required" } };
  }

  const needsDate = videoType === "market_update" || videoType === "community_events";
  if (needsDate && (!month || !year)) {
    return { status: 400, body: { error: "month and year are required for market_update and community_events" } };
  }

  if (videoType === "custom" && !customTopic?.trim()) {
    return { status: 400, body: { error: "customTopic is required for custom video type" } };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, company_name, phone, company_phone, website, subscription_tier, role, first_video_generated_at")
    .eq("id", userId)
    .single();

  if (!profile) return { status: 400, body: { error: "Profile not found." } };

  // SparkReels mode (2026-11-01): a custom topic is a video promoting
  // SparkReels to agents, written from the product facts, with no town.
  const promo = videoType === "custom" && (await isSparkreelsMode(userId)) ? sparkreelsFacts() : undefined;
  if ((!city || !state) && (profile as { role?: string | null }).role !== "admin" && !promo) {
    return { status: 400, body: { error: "videoType, city, and state are required" } };
  }

  /**
   * Whether the article rides along with this script. The request stays open
   * whatever the answer (a free account must be able to make the video that
   * starts its 30-day clock), so the gate lands on the blog fields: both
   * doors, deliberately.
   */
  const p = profile as { role?: string | null; subscription_tier?: string | null; first_video_generated_at?: string | null };
  const trialOpen = hasAdminPerks(p.role)
    || !freeTrialLocked(p.first_video_generated_at, p.subscription_tier);
  /** The one free blog before the free video: only for a blog-only request. */
  const freeBlog = !trialOpen && blogOnly === true && !regenerateOnly
    && isPreVideoAccount(p) && (await freeBlogAvailable(userId));
  const blogAllowed = trialOpen || freeBlog;

  // Script length follows the video asked for, and leaves room for this
  // agent's own closing line (2026-10-24: script + closing line = the 2-minute cap).
  const tier = (profile as { subscription_tier?: string | null }).subscription_tier ?? null;
  const length: VideoLength = videoLength === "long" ? "long" : "standard";
  const short = length === "standard" && shortScript === true && blogOnly !== true;
  const standardBudget = !short && length === "standard"
    ? shortScriptBudget(await closingLineWords(createAdminClient(), userId, { city, state }))
    : null;
  const words = short ? VERTICAL_TARGET_WORDS : standardBudget ? standardBudget.target : targetWords(length, tier);
  // The cap is stated in the prompt too.
  const cap = short ? VERTICAL_MAX_WORDS : standardBudget ? standardBudget.cap : maxWords(length, tier);

  const params: LocationParams = {
    city, state, zip, month, year, customTopic,
    sourceText: typeof sourceText === "string" ? sourceText : undefined,
    sourceIsOwn: sourceIsOwn === true,
    // In SparkReels mode the audience is always agents, said in the prompt.
    audience: promo ? undefined : audience, tone, ctaPreference, purpose,
    promo,
    targetWords: words,
    maxWords: cap,
    // My voice (2026-11-18): the draft is written the way this agent talks.
    myVoice: await myVoiceRuleFor(createAdminClient(), userId),
  };
  const agentName = (profile as { full_name?: string | null }).full_name || undefined;

  let raw: string;
  try {
    raw = await generateLocationScript(videoType, params, agentName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Script generation failed";
    console.error("Perplexity location script error:", msg);
    return { status: 500, body: { error: msg } };
  }

  const parsed = parseLocationScript(raw, videoType, city, state, agentName, ctaPreference);
  // SparkReels mode: tags and keywords about SparkReels, not a town's real estate.
  if (promo) {
    parsed.hashtags = ["SparkReels", "AIVideo", "RealEstateMarketing", "RealtorTips", "RealEstateAgent", "VideoMarketing", "AIForRealtors"];
    parsed.keywords = ["SparkReels", "AI video for real estate agents", "real estate video marketing", "AI avatar for realtors", "real estate content marketing"];
  }

  // Clamped here, with the same reserve-the-CTA-first math as the render
  // clamp, so the word count shown is the word count spoken.
  const ctaClamped = clampScript(parsed.cta, 200);
  const ctaWordCount = ctaClamped.trim().split(/\s+/).filter(Boolean).length;
  // Nothing said twice, the hook included (2026-11-18), before it is counted.
  const scriptClamped = clampScript(scriptWithoutRepeats(parsed.script, parsed.hook), Math.max(50, cap - ctaWordCount));

  const aiScript = {
    title: parsed.title,
    hook: parsed.hook,
    hooks: parsed.hooks,
    script: scriptClamped,
    cta: ctaClamped,
    description: parsed.description,
    hashtags: parsed.hashtags,
    keywords: parsed.keywords,
    // Empty rather than absent when the trial has closed: the Share Kit
    // reads empty as "no article yet".
    blog_intro: blogAllowed ? parsed.blog_intro : "",
    blog_body: blogAllowed ? parsed.blog_body : "",
    blog_conclusion: blogAllowed ? parsed.blog_conclusion : "",
    sources: parsed.sources,
    raw: parsed.raw,
    video_type: parsed.video_type,
    location: parsed.location,
    custom_topic: customTopic || null,
    audience: audience || null,
    tone: tone || null,
    cta_preference: ctaPreference || null,
    // The AI Tools read the brief back off the project.
    purpose: purpose || null,
    video_length: videoLength === "long" ? "long" : "standard",
    video_platform: videoPlatform === "reel" ? "reel" : "youtube",
    ...(renderMode === "voice_only" || renderMode === "avatar_voice" ? { render_mode: renderMode } : {}),
    ...(avatarStyle === "circle" && { avatar_style: "circle" }),
  };

  const prof = profile as {
    full_name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    company_phone?: string | null;
    website?: string | null;
  };
  // On a custom topic the script names its own place; everything from here
  // down follows the script rather than the profile.
  const [parsedCity, parsedState] = (parsed.location || "").split(",").map((s) => s.trim());
  const scriptCity = parsedCity || city;
  const scriptState = parsedState || state;

  const ytMeta = await Promise.race([
    generateYoutubeMetadata({
      title: parsed.title,
      script: parsed.script,
      city: scriptCity,
      state: scriptState,
      agentName: prof.full_name || undefined,
      brokerage: prof.company_name || undefined,
      keywords: parsed.keywords,
      website: prof.website || undefined,
      phone: prof.phone || prof.company_phone || undefined,
      promo: !!promo,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), YT_META_TIMEOUT_MS)),
  ]).catch((err) => {
    console.error("[generate-location-script] YouTube metadata failed:", err);
    return null;
  });

  const seoData = {
    meta_title: parsed.title,
    meta_description: parsed.description || parsed.hook,
    keywords: parsed.keywords,
    hashtags: ytMeta?.hashtags?.length ? ytMeta.hashtags : parsed.hashtags,
    // A copy of the opening paragraph, so it follows the same gate.
    blog_intro: blogAllowed ? parsed.blog_intro : "",
    sources: parsed.sources,
    youtube_title: ytMeta?.youtube_title || parsed.title,
    youtube_description: ytMeta?.youtube_description || parsed.description || parsed.hook,
  };

  if (regenerateOnly) {
    await admin.from("api_usage_log").insert({
      user_id: userId,
      api_provider: "perplexity",
      endpoint: "generate-location-script-regenerate",
      credits_used: 0,
      response_status: 200,
    });
    return { status: 200, body: { aiScript, seoData } };
  }

  // A pasted article's label ("Your text · 1,466 words") is not a topic, so
  // the written title names the project instead (2026-10-15).
  const projectTitle = customTopic && !isPlaceholderTitle(customTopic)
    ? `${customTopic} — ${[scriptCity, scriptState].filter(Boolean).join(", ")}`
    : parsed.title;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: userId,
      title: projectTitle,
      project_type: "location_script",
      status: "draft",
      // The place the script settled on, not the profile's home market.
      location_city: scriptCity,
      location_state: scriptState,
      ai_script: aiScript,
      seo_data: seoData,
    })
    .select()
    .single();

  if (projectError) {
    console.error("Project insert error:", projectError);
    return { status: 500, body: { error: "Failed to save project" } };
  }

  await ensureSparkFor(admin, userId, (project as { id: string }).id);

  // The free blog is used once there is one: written and saved, not asked for.
  if (freeBlog && parsed.blog_body?.trim()) await markFreeBlog(userId);

  await admin.from("api_usage_log").insert({
    user_id: userId,
    api_provider: "perplexity",
    endpoint: "generate-location-script",
    credits_used: 0,
    response_status: 200,
  });

  return { status: 200, body: { project } };
}
