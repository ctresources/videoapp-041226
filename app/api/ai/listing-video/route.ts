import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import type { ListingData } from "../scrape-listing/route";

async function generateListingScript(listing: ListingData): Promise<{
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

  const prompt = `${FAIR_HOUSING_GUARDRAIL}

---

You are a real estate video script writer. Write an engaging 60–90 second property tour script for this listing.

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
- End with a clear call to action to schedule a showing
- Keep it under 200 words — this is a voiceover script, not text
- Do NOT mention schools, churches, demographics, neighborhood composition, or anything that could violate Fair Housing laws
- Naturally include Fair Housing Equal Opportunity language at the very end

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
      max_tokens: 1000,
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

  const { listing } = await req.json() as { listing: ListingData };
  if (!listing?.address) {
    return NextResponse.json({ error: "Listing data is required" }, { status: 400 });
  }

  // Check credits
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", user.id)
    .single();

  if (!profile || (profile as { credits_remaining: number }).credits_remaining < 1) {
    return NextResponse.json({ error: "No credits remaining. Please upgrade." }, { status: 402 });
  }

  // Generate script
  let scriptData: Awaited<ReturnType<typeof generateListingScript>>;
  try {
    scriptData = await generateListingScript(listing);
  } catch (err) {
    console.error("Listing script error:", err);
    return NextResponse.json({ error: "Failed to generate script. Please try again." }, { status: 500 });
  }

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
  };

  const seoData = {
    meta_title: scriptData.title,
    meta_description: scriptData.description,
    keywords: scriptData.keywords,
    hashtags: scriptData.hashtags,
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
      location_city: listing.address.split(",")[1]?.trim() ?? "",
      location_state: listing.address.split(",")[2]?.trim().split(" ")[0] ?? "",
    })
    .select()
    .single();

  if (projectError) {
    console.error("Project insert error:", projectError);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }

  // Deduct credit
  await admin
    .from("profiles")
    .update({ credits_remaining: (profile as { credits_remaining: number }).credits_remaining - 1 })
    .eq("id", user.id);

  await admin.from("api_usage_log").insert({
    user_id: user.id,
    api_provider: "perplexity",
    endpoint: "listing-video",
    credits_used: 1,
    response_status: 200,
  });

  return NextResponse.json({ project });
}
