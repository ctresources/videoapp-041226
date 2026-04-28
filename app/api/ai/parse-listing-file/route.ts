import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { ListingData } from "@/app/api/ai/scrape-listing/route";

export const maxDuration = 60;

const EMPTY_LISTING: ListingData = {
  address: "",
  price: "",
  beds: null,
  baths: null,
  sqft: null,
  yearBuilt: null,
  propertyType: "Single Family",
  description: "",
  features: [],
  photoUrls: [],
  agentName: "",
  mlsId: "",
  daysOnMarket: null,
  garage: "",
  lotSize: "",
  neighborhood: "",
};

/**
 * Best-effort text extraction from any file type.
 * For binary files we still attempt utf-8 decode and strip non-printable chars.
 * PDFs get a simple text-stream extraction. Images return empty string.
 */
async function extractText(file: File): Promise<string> {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Pure-text formats — decode directly
  if (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("csv") ||
    /\.(txt|csv|json|md|html|htm|xml|tsv|log|rtf|yaml|yml)$/i.test(name)
  ) {
    return buffer.toString("utf-8");
  }

  // PDF — extract text streams (BT...ET blocks). Crude but dependency-free.
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const raw = buffer.toString("latin1");
    const matches: string[] = [];
    const regex = /BT([\s\S]*?)ET/g;
    let m;
    while ((m = regex.exec(raw)) !== null) {
      const inside = m[1];
      const textRegex = /\((.*?)\)\s*Tj/g;
      let t;
      while ((t = textRegex.exec(inside)) !== null) {
        matches.push(t[1]);
      }
    }
    if (matches.length > 0) return matches.join(" ");
    // Fallback: strip non-printable
    return raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").slice(0, 20000);
  }

  // Images — skip text extraction
  if (type.startsWith("image/")) {
    return "";
  }

  // DOCX/PPTX/XLSX — these are zip files; pull readable strings
  // Best-effort: decode buffer and strip non-printable
  const asText = buffer.toString("utf-8");
  const printable = asText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").trim();
  return printable.slice(0, 20000);
}

async function parseWithPerplexity(text: string): Promise<ListingData> {
  const truncated = text.slice(0, 8000);

  const prompt = `Extract real estate listing details from this content and return ONLY a valid JSON object.

CONTENT:
${truncated}

Return a JSON object with these exact keys (use null or empty string if not found):
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
  "photoUrls": [],
  "agentName": "listing agent name or empty string",
  "mlsId": "MLS# or empty string",
  "daysOnMarket": number or null,
  "garage": "2-car attached or empty string",
  "lotSize": "0.25 acres or empty string",
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

  if (!res.ok) throw new Error(`Perplexity error: ${res.status}`);
  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in AI response");

  return JSON.parse(jsonMatch[0]) as ListingData;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // Reasonable size guardrail (60MB)
  if (file.size > 60 * 1024 * 1024) {
    return NextResponse.json({ error: "File is larger than 60MB" }, { status: 413 });
  }

  try {
    const text = await extractText(file);

    // If we couldn't extract any meaningful text (e.g., pure image), return empty listing
    // so the user falls into manual entry instead of an error.
    if (!text || text.trim().length < 30) {
      return NextResponse.json({
        listing: EMPTY_LISTING,
        warning: "Couldn't read details from this file type. Please fill the form manually.",
        fileName: file.name,
      });
    }

    const listing = await parseWithPerplexity(text);
    return NextResponse.json({ listing, fileName: file.name });
  } catch (err) {
    console.error("Parse listing file error:", err);
    return NextResponse.json(
      {
        listing: EMPTY_LISTING,
        warning: "Couldn't auto-extract details. Please fill the form manually.",
        fileName: file.name,
      },
      { status: 200 }
    );
  }
}
