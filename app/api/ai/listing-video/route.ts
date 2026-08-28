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

/**
 * Pull the city and state out of a listing address.
 *
 * The listing's own city is the only correct one for a listing video. It used
 * to be read as `listing.city`, a field ListingData does not have — so it was
 * always undefined and every listing fell back to the agent's profile city.
 * A Willow Grove property came out titled "Blue Bell, PA" because Blue Bell is
 * where the agent works.
 *
 * Handles "123 Oak Road, Willow Grove, PA 19090", "…, Willow Grove, PA" and
 * "Willow Grove, PA". Returns nothing rather than guessing when the address has
 * no recognisable trailing state, so the caller can fall back deliberately.
 */
function parseCityState(address: string): { city?: string; state?: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  const tail = parts[parts.length - 1];
  const stateMatch = tail.match(/^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (stateMatch) {
    return { city: parts[parts.length - 2], state: stateMatch[1].toUpperCase() };
  }
  // No trailing state — the last segment is the best city candidate.
  return { city: tail };
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
- End with a clear call to action to schedule a showing${agentName ? ` — must include the agent's name: "${agentName}"` : ""}
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
  "cta": "the closing call to action sentence",
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

  const { listing, videoLength } = await req.json() as {
    listing: ListingData;
    videoLength?: VideoLength;
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
  const isAdmin = (profile as { role?: string | null }).role === "admin";
  const canGoLong = isAdmin || availableFor(profile as never, "long") > 0;
  const length: VideoLength = videoLength === "long" && canGoLong ? "long" : "standard";
  const tier = (profile as { subscription_tier?: string | null }).subscription_tier ?? null;

  // Generate script
  let scriptData: Awaited<ReturnType<typeof generateListingScript>>;
  try {
    const agentName = (profile as { full_name?: string | null }).full_name || undefined;
    scriptData = await generateListingScript(listing, agentName, length, tier);
  } catch (err) {
    console.error("Listing script error:", err);
    return NextResponse.json({ error: "Failed to generate script. Please try again." }, { status: 500 });
  }

  // The prompt states the cap, but a model overshooting it is not
  // hypothetical — the same clamp runs after every other script in the app for
  // that reason. Doing it here means the word count the editor shows is the
  // word count that gets spoken, rather than one the render silently trims.
  const ctaClamped = clampScript(scriptData.cta ?? "", 200);
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
  };

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
  const ytMeta = await generateYoutubeMetadata({
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
  });

  const thumbnailUrl = `/api/thumbnail?hook=${encodeURIComponent((scriptData.hook || scriptData.title).slice(0, 180))}&agent=${encodeURIComponent(prof.full_name || "")}`;

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
