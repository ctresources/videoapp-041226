import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { generateYoutubeMetadata } from "@/lib/api/perplexity";
import type { ListingData } from "../scrape-listing/route";
import {
  targetWords, maxWords, minutesFor, clampScript, type VideoLength,
} from "@/lib/utils/video-length";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { parseCityState } from "@/lib/utils/parse-address";

/**
 * The SEO/AEO/GEO blog article that goes with a listing video.
 *
 * A separate call rather than more fields on the script's JSON, deliberately:
 * that response already has to hold a 1,160-word script plus a title, hook,
 * CTA, description, ten hashtags and six keywords, and a JSON object cut off
 * mid-string reads as a total failure. A blog on the end of it would push a
 * long listing past its token budget and lose the script as well.
 *
 * Same plain-text shape the market videos use — headings marked "H2: ",
 * paragraphs separated by blank lines — because the editor's "Copy as HTML"
 * parses exactly that (see blogAsHtml in the create page). Anything else
 * arrives as one undifferentiated paragraph.
 *
 * Returns nulls on any failure. The blog is a bonus attached to a video that
 * has already been written; it is never worth failing the request over.
 */
async function generateListingBlog(
  listing: ListingData,
  city: string | undefined,
  state: string | undefined,
  agentName: string | undefined,
  unbranded: boolean,
): Promise<{ intro: string; body: string; conclusion: string } | null> {
  const where = [city, state].filter(Boolean).join(", ") || "the local area";
  const details = [
    listing.beds ? `${listing.beds} bed` : "",
    listing.baths ? `${listing.baths} bath` : "",
    listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : "",
    listing.yearBuilt ? `built ${listing.yearBuilt}` : "",
  ].filter(Boolean).join(" · ");

  const prompt = `${FAIR_HOUSING_GUARDRAIL}

---

Write a property blog post for this listing — around 1,000 words total, for the agent's own website. It accompanies a video tour, so it must stand on its own rather than describe the video.

LISTING:
Address: ${listing.address}
Location: ${where}
Price: ${listing.price}
Details: ${details}
Property Type: ${listing.propertyType}
Neighborhood: ${listing.neighborhood || "N/A"}
Description: ${listing.description}
Key Features: ${listing.features.slice(0, 8).join(", ")}

SEARCH + ANSWER-ENGINE OPTIMISATION (this is the point of the article):
- Lead the intro with the property's specifics — city, price, beds, baths, square footage — in the first two sentences, in plain declarative language an AI assistant can quote back as an answer.
- Give the body 4–6 sections, each headed with a line beginning exactly "H2: ". Write each heading as the question a buyer would actually type or ask aloud (e.g. "H2: What does the kitchen offer?", "H2: How much is ${listing.price} getting you here?").
- Answer each heading in its first sentence, then support it. Never open a section with a rhetorical question or a scene-setter.
- Name ${where} naturally through the article — this is a local search page.
- Use real numbers from the listing wherever one exists. Round nothing, invent nothing, and never state a fact the listing above does not contain.

FAIR HOUSING (overrides everything else here):
- Never mention schools, churches, demographics, neighborhood composition, safety, or who the home would "suit".
- Describe the property and its features. Never describe the people who might live there.
${unbranded
  ? "- UNBRANDED: do not name an agent, brokerage, team, phone number, email or website anywhere, and do not invite the reader to make contact. Close on the property."
  : `- Close with an invitation to arrange a showing${agentName ? `, naming ${agentName}` : ""}.`}

FORMAT — plain text, no markdown, no asterisks, no numbered lists:
- Headings are their own line, starting with "H2: ".
- Paragraphs are separated by a blank line.

Return ONLY a JSON object:
{
  "intro": "opening ~150 words, no heading",
  "body": "the H2 sections, ~700 words",
  "conclusion": "closing ~150 words, no heading"
}`;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        // ~1,000 words of prose across three JSON strings, with the escaped
        // newlines between paragraphs counting too.
        max_tokens: 2600,
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as { intro?: string; body?: string; conclusion?: string };
    return {
      intro: parsed.intro ?? "",
      body: parsed.body ?? "",
      conclusion: parsed.conclusion ?? "",
    };
  } catch (err) {
    console.error("[listing-video] Blog generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function generateListingScript(
  listing: ListingData,
  agentName?: string,
  /**
   * The same two lengths every other script in the app is written to, rather
   * than a "60–90 second, under 200 words" rule of its own. 200 words is
   * about 1:20 — barely half of the shortest video the app renders, so a
   * listing tour arrived far shorter than the format it was going into.
   */
  length: VideoLength = "standard",
  tier?: string | null,
  /**
   * Unbranded cut — no agent identification anywhere in the spoken script, as
   * most MLS boards require of listing media. The property itself is not the
   * problem: the address, price and features are exactly what the board wants
   * described. Only the agent has to disappear, which here means the closing
   * ask and the name that was stapled to it.
   */
  unbranded = false,
): Promise<{
  title: string;
  script: string;
  hook: string;
  cta: string;
  description: string;
  hashtags: string[];
  keywords: string[];
}> {
  const featureList = listing.features.slice(0, 6).join(", ");
  const details = [
    listing.beds ? `${listing.beds} bed` : "",
    listing.baths ? `${listing.baths} bath` : "",
    listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : "",
    listing.yearBuilt ? `built ${listing.yearBuilt}` : "",
    listing.garage || "",
    listing.lotSize || "",
  ].filter(Boolean).join(" · ");

  // Both from video-length.ts, so a listing script is measured by the same
  // ruler as every other script and by the clamp that trims it at render.
  const target = targetWords(length, tier);
  const cap = maxWords(length, tier);

  const prompt = `${FAIR_HOUSING_GUARDRAIL}

---

You are a real estate video script writer. Write an engaging property tour script for this listing, about ${target} words — roughly ${minutesFor(target)} minutes spoken aloud. Never exceed ${cap} words.

LISTING:
Address: ${listing.address}
Price: ${listing.price}
Details: ${details}
Property Type: ${listing.propertyType}
Neighborhood: ${listing.neighborhood || "N/A"}
Description: ${listing.description}
Key Features: ${featureList}

INSTRUCTIONS:
- Open with a compelling hook about the property (NOT "Welcome to...")
- Highlight the top 3–4 features conversationally
- Mention the price and key specs naturally
${unbranded
  ? `- UNBRANDED VIDEO — this is a compliance requirement, not a style preference, and it outranks every other instruction here about how to close. Do not name the agent, a brokerage, a team, a licence number, a phone number, an email address or a website, and do not invite the viewer to make contact or to schedule a showing. Close on the property itself.`
  : `- End with a clear call to action to schedule a showing${agentName ? ` — must include the agent's name: "${agentName}"` : ""}`}
- Aim for ${target} words and never pass ${cap} — this is a voiceover script, not text. Do not pad or repeat to reach the length; if the listing genuinely has less to say, say less.
${length === "long" ? "- This is a long tour: walk the property room by room, and give each space a specific detail from the listing rather than an adjective.\n" : ""}
- Do NOT mention schools, churches, demographics, neighborhood composition, or anything that could violate Fair Housing laws
- Naturally include Fair Housing Equal Opportunity language at the very end

PRONUNCIATION RULES (CRITICAL — this is a voiceover, every word will be SPOKEN):
- ALWAYS spell out street-suffix abbreviations as full words: "Ln" → "Lane", "St" → "Street", "Rd" → "Road", "Ave" → "Avenue", "Blvd" → "Boulevard", "Dr" → "Drive", "Ct" → "Court", "Cir" → "Circle", "Pl" → "Place", "Pkwy" → "Parkway", "Hwy" → "Highway", "Ter" → "Terrace", "Trl" → "Trail", "Pt" → "Point", "Sq" → "Square"
- ALWAYS spell out directional abbreviations: "N" → "North", "S" → "South", "E" → "East", "W" → "West", "NE" → "Northeast", "NW" → "Northwest", "SE" → "Southeast", "SW" → "Southwest"
- ALWAYS spell out unit abbreviations: "Apt" → "Apartment", "Ste" → "Suite", "Bldg" → "Building"
- Do NOT include any phone numbers in the script. Do NOT prepend "1" to any number. Phone numbers appear on-screen via overlays — never spoken in the narration.
- If you mention an address, write it the way a human would say it out loud (e.g. "123 Oak Lane" not "123 Oak Ln")
- Name the CITY only — never follow it with the state. Say "in Willow Grove", not "in Willow Grove, Pennsylvania" or "in Willow Grove, PA". Nobody says the state aloud about a home in their own area, and it makes the narration sound like an address label being read out. The state belongs in the title and the hook, not in the body of the script.

Return ONLY a JSON object:
{
  "title": "short listing video title (max 60 chars)",
  "hook": "the opening sentence/hook only",
  "script": "the full voiceover script",
  "cta": ${unbranded ? `""` : `"the closing call to action sentence"`},
  "description": "2-sentence social media description",
  "hashtags": ["hashtag1", "hashtag2", ...] (10 tags, no # symbol),
  "keywords": ["keyword1", ...] (6 SEO keywords)
}`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      // Has to hold the script itself plus title, hook, CTA, description,
      // 10 hashtags and 6 keywords. 1000 was sized for a 200-word script; a
      // 1,160-word one needs roughly 1,600 tokens before the rest of the
      // object, and a JSON response cut off mid-string reads as a failure.
      max_tokens: length === "long" ? 2600 : 1400,
    }),
  });

  if (!res.ok) throw new Error(`Script generation error: ${res.status}`);
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in script response");
  return JSON.parse(jsonMatch[0]);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listing, videoLength, renderMode, scriptOnly, unbranded } = await req.json() as {
    listing: ListingData;
    videoLength?: VideoLength;
    renderMode?: "voice_only" | "avatar_voice";
    /**
     * Write the script with no agent identification and no closing ask, for
     * the unbranded cut most MLS boards require of listing media.
     */
    unbranded?: boolean;
    /**
     * Write the script and stop — no project row, no SEO pass.
     *
     * For "read it myself on camera", where the teleprompter needs the words
     * and nothing else. Creating a draft project for a video that is about to
     * be recorded rather than rendered would leave an orphan in My Videos that
     * nobody asked for. Mirrors regenerateOnly in generate-location-script.
     */
    scriptOnly?: boolean;
  };
  if (!listing?.address) {
    return NextResponse.json({ error: "Listing data is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(`full_name, company_name, phone, company_phone, website, location_city, location_state, subscription_tier, role, ${ALLOWANCE_SELECT}`)
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  }

  // Asking for a long script with no long videos to spend would write one the
  // render then refuses — a wasted wait ending in a 402. Fall back to standard
  // instead of failing: the script is still the one they can actually make.
  const isUnbranded = unbranded === true;
  const isAdmin = (profile as { role?: string | null }).role === "admin";
  const canGoLong = isAdmin || availableFor(profile as never, "long") > 0;
  const length: VideoLength = videoLength === "long" && canGoLong ? "long" : "standard";
  const tier = (profile as { subscription_tier?: string | null }).subscription_tier ?? null;

  // Generate script
  let scriptData: Awaited<ReturnType<typeof generateListingScript>>;
  try {
    const agentName = (profile as { full_name?: string | null }).full_name || undefined;
    scriptData = await generateListingScript(listing, agentName, length, tier, isUnbranded);
  } catch (err) {
    console.error("Listing script error:", err);
    return NextResponse.json({ error: "Failed to generate script. Please try again." }, { status: 500 });
  }

  // The prompt states the cap, but a model overshooting it is not
  // hypothetical — the same clamp runs after every other script in the app for
  // that reason. Doing it here means the word count the editor shows is the
  // word count that gets spoken, rather than one the render silently trims.
  // Emptied here rather than trusted to the prompt: the CTA is joined onto the
  // spoken script downstream, so a model that writes one anyway would put an
  // invitation to call the agent into the very video that may not carry one.
  const ctaClamped = isUnbranded ? "" : clampScript(scriptData.cta ?? "", 200);
  const ctaWords = ctaClamped.trim().split(/\s+/).filter(Boolean).length;
  scriptData.cta = ctaClamped;
  scriptData.script = clampScript(
    scriptData.script ?? "",
    Math.max(50, maxWords(length, tier) - ctaWords),
  );

  const aiScript = {
    title: scriptData.title,
    hook: scriptData.hook,
    hooks: [scriptData.hook],
    script: scriptData.script,
    cta: scriptData.cta,
    description: scriptData.description,
    hashtags: scriptData.hashtags,
    keywords: scriptData.keywords,
    blog_intro: "",
    blog_body: "",
    blog_conclusion: "",
    video_type: "listing_video",
    location: listing.address,
    // Without these the editor opened every listing on the default format.
    // A long script landing on Shorts is clamped straight back to the short
    // cap — the render quietly undoing the length that was just asked for.
    video_length: length,
    video_platform: length === "long" ? "youtube" : "reel",
    // Read back by the editor, which otherwise opens on its avatar default —
    // so a tour asked for as voice-only arrived with a face on screen anyway.
    render_mode: renderMode === "voice_only" ? "voice_only" : "avatar_voice",
  };

  // Everything below this point exists to make a renderable project. A camera
  // recording needs none of it — the teleprompter wants the words, and the
  // recorder writes its own video row when the take is saved.
  if (scriptOnly) {
    return NextResponse.json({
      aiScript,
      script: [scriptData.hook, scriptData.script, scriptData.cta]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join("\n\n"),
    });
  }

  // Generate SEO/GEO/AEO-optimized YouTube metadata — non-blocking
  const prof = profile as {
    full_name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    company_phone?: string | null;
    website?: string | null;
    location_city?: string | null;
    location_state?: string | null;
  };
  // The property's own city, not the agent's market. Profile is a last resort
  // for addresses with no parseable city — it is where the agent works, which
  // for any listing outside their home town is simply the wrong place.
  const parsedLocation = parseCityState(listing.address);
  const listingCity = parsedLocation.city || prof.location_city || undefined;
  const listingState = parsedLocation.state || prof.location_state || undefined;
  // Both are independent of each other and each takes several seconds, so they
  // run together. Neither can reject — the metadata call catches, the blog
  // returns null — so one failing never costs the other or the script.
  const [ytMeta, blog] = await Promise.all([
    generateYoutubeMetadata({
      title: scriptData.title,
      script: scriptData.script,
      city: listingCity,
      state: listingState,
      agentName: prof.full_name || undefined,
      brokerage: prof.company_name || undefined,
      keywords: scriptData.keywords,
      website: prof.website || undefined,
      phone: prof.phone || prof.company_phone || undefined,
    }).catch((err) => {
      console.error("[listing-video] YouTube metadata failed:", err);
      return null;
    }),
    generateListingBlog(listing, listingCity, listingState, prof.full_name || undefined, isUnbranded),
  ]);

  const thumbnailUrl = `/api/thumbnail?hook=${encodeURIComponent((scriptData.hook || scriptData.title).slice(0, 180))}&agent=${encodeURIComponent(prof.full_name || "")}`;

  // Attached after the fact because aiScript is built before this point — the
  // scriptOnly path returns from up there and wants no blog at all.
  if (blog) {
    aiScript.blog_intro = blog.intro;
    aiScript.blog_body = blog.body;
    aiScript.blog_conclusion = blog.conclusion;
  }

  const seoData = {
    meta_title: scriptData.title,
    meta_description: scriptData.description,
    keywords: scriptData.keywords,
    hashtags: ytMeta?.hashtags?.length ? ytMeta.hashtags : scriptData.hashtags,
    youtube_title: ytMeta?.youtube_title || scriptData.title,
    youtube_description: ytMeta?.youtube_description || scriptData.description,
    thumbnail_url: thumbnailUrl,
  };

  // Create project
  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title: scriptData.title,
      project_type: "listing_video",
      status: "draft",
      ai_script: aiScript,
      seo_data: seoData,
      listing_data: listing,
      // Same parse as the metadata above, so the project row and the video's
      // title can never disagree about where the property is.
      location_city: parsedLocation.city ?? "",
      location_state: parsedLocation.state ?? "",
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
    endpoint: "listing-video",
    credits_used: 0,
    response_status: 200,
  });

  return NextResponse.json({ project });
}
