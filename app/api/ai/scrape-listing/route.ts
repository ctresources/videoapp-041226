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
  return res.text();
}

async function parseListingWithPerplexity(markdown: string): Promise<ListingData> {
  // Truncate to avoid token limits
  const truncated = markdown.slice(0, 8000);

  const prompt = `Extract real estate listing details from this page content and return ONLY a valid JSON object.

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
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 800,
    }),
  });

  if (!res.ok) throw new Error(`Perplexity parse error: ${res.status}`);
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Perplexity response");

  return JSON.parse(jsonMatch[0]) as ListingData;
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
    return NextResponse.json(
      { error: "Could not parse listing. Try entering details manually." },
      { status: 422 }
    );
  }
}
