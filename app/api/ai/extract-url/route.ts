import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s{3,}/g, "  ").trim();
  return text;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only http/https URLs are supported");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL — must start with http:// or https://" }, { status: 400 });
  }

  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; XpressReel/1.0; +https://xpressreel.com)",
        Accept: "text/html,text/plain,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch URL (HTTP ${res.status})` }, { status: 400 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/xhtml")
    ) {
      return NextResponse.json(
        { error: "URL must point to a web page (HTML). For PDFs, use the Upload PDF option." },
        { status: 400 }
      );
    }

    const html = await res.text();
    const text = extractTextFromHtml(html);

    if (!text || text.trim().length < 30) {
      return NextResponse.json({ error: "Could not extract meaningful content from this URL" }, { status: 400 });
    }

    return NextResponse.json({ text: text.slice(0, 5000), url: parsedUrl.toString() });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ error: "URL took too long to load" }, { status: 408 });
    }
    console.error("URL extraction error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch URL" },
      { status: 500 }
    );
  }
}
