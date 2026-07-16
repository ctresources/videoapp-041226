import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";

export interface ListingData {
  address: string;
  price: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string;
  description: string;
  features: string[];
  photoUrls: string[];
  agentName: string;
  mlsId: string;
  daysOnMarket: number | null;
  garage: string;
  lotSize: string;
  neighborhood: string;
}

async function fetchWithJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Jina fetch failed: ${res.status}`);
  const text = await res.text();

  // Zillow and friends aggressively block scrapers. A blocked/CAPTCHA page
  // still returns 200, and feeding that to the parser produces a fully
  // invented listing — so treat it as a hard failure and let the caller tell
  // the user to enter details manually.
  const blocked = /captcha|are you a human|verify you are|access denied|unusual traffic|press & hold|enable javascript/i.test(
    text.slice(0, 4000),
  );
  if (blocked || text.trim().length < 500) {
    console.warn(`[scrape-listing] Blocked or empty page (${text.trim().length} chars, blocked=${blocked})`);
    throw new Error("BLOCKED");
  }
  return text;
}

async function parseListingWithPerplexity(markdown: string): Promise<ListingData> {
  // Listing pages are large and the beds/baths/sqft facts often sit well past
  // the first few thousand characters — truncating at 8k hid them and the
  // model filled the gaps with invented values.
  const truncated = markdown.slice(0, 30000);

  const prompt = `You are extracting facts from ONE specific real estate listing page. Return ONLY a valid JSON object.

CRITICAL ACCURACY RULES — these override everything else:
- Use ONLY the PAGE CONTENT below. Do NOT use web search, prior knowledge, or any other listing.
- Every value must appear VERBATIM in the page content. Do NOT infer, estimate, guess, or "fill in" typical values.
- If a value does not clearly appear in the content, return null (or "" for string fields). null is ALWAYS better than a wrong number.
- Beds, baths, and square footage must be copied exactly as written on this page. Never approximate them.

PAGE CONTENT:
${truncated}

Return a JSON object with these exact keys (use null if not found):
{
  "address": "full street address",
  "price": "$X,XXX,XXX",
  "beds": number or null,
  "baths": number or null,
  "sqft": number or null,
  "yearBuilt": number or null,
  "propertyType": "Single Family" | "Condo" | "Townhouse" | "Multi-Family" | "Land" | "Other",
  "description": "property description (max 300 chars)",
  "features": ["feature 1", "feature 2", ...] (max 8 items),
  "photoUrls": [] ,
  "agentName": "listing agent name or empty string",
  "mlsId": "MLS# or empty string",
  "daysOnMarket": number or null,
  "garage": "2-car attached" or empty string,
  "lotSize": "0.25 acres" or empty string,
  "neighborhood": "neighborhood name or empty string"
}

Return ONLY the JSON object. No markdown, no explanation.`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "You are a strict data-extraction tool. You only copy values that literally appear in the user-provided page content. You never search the web, never use outside knowledge, and never guess. Missing data is returned as null. Output raw JSON only.",
        },
        { role: "user", content: prompt },
      ],
      // Deterministic extraction — no creative gap-filling.
      temperature: 0,
      max_tokens: 800,
      // Keep the model from pulling facts off the live web instead of the page.
      search_domain_filter: [],
      return_related_questions: false,
    }),
  });

  if (!res.ok) throw new Error(`Perplexity parse error: ${res.status}`);
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Perplexity response");

  const parsed = JSON.parse(jsonMatch[0]) as ListingData;

  // ── Anti-hallucination cross-check ──────────────────────────────────────
  // Every numeric fact must actually appear in the source page. If the model
  // produced a number that isn't in the content, it invented it — null it out
  // so the user is prompted to fill it in rather than shipping a wrong figure
  // into a published video.
  const haystack = markdown.replace(/,/g, "");
  const appearsInPage = (n: number | null): boolean => {
    if (n === null || n === undefined) return false;
    // Match the number as a standalone token (handles 2400 / 2,400 / 2400.0)
    return new RegExp(`\\b${String(n).replace(/\./g, "\\.")}\\b`).test(haystack);
  };
  for (const field of ["beds", "baths", "sqft", "yearBuilt"] as const) {
    const value = parsed[field];
    if (value !== null && value !== undefined && !appearsInPage(value)) {
      console.warn(`[scrape-listing] Dropped hallucinated ${field}=${value} — not present in page content`);
      parsed[field] = null;
    }
  }

  console.log(
    `[scrape-listing] parsed: beds=${parsed.beds} baths=${parsed.baths} sqft=${parsed.sqft} year=${parsed.yearBuilt} price=${parsed.price} (source ${markdown.length} chars)`,
  );

  return parsed;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json() as { url: string };
  if (!url?.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate it's a real estate URL
  const allowedDomains = ["zillow.com", "realtor.com", "redfin.com", "homes.com", "trulia.com", "compass.com"];
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const isAllowed = allowedDomains.some((d) => parsedUrl.hostname.includes(d));
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Supported sites: Zillow, Realtor.com, Redfin, Homes.com, Trulia, Compass" },
      { status: 400 }
    );
  }

  try {
    const markdown = await fetchWithJina(url);
    const listing = await parseListingWithPerplexity(markdown);
    return NextResponse.json({ listing });
  } catch (err) {
    console.error("Scrape listing error:", err);
    const blocked = err instanceof Error && err.message === "BLOCKED";
    return NextResponse.json(
      {
        error: blocked
          ? "This site blocked the import (Zillow does this often). Please enter the listing details manually — it only takes a minute."
          : "Could not parse listing. Try entering details manually.",
      },
      { status: 422 }
    );
  }
}
