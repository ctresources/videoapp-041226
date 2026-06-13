import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

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

// Extract text from a PDF buffer using unpdf (pdf.js under the hood). Handles
// compressed content streams and modern PDF layouts that a regex scan misses.
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join(" ") : text).replace(/\s{3,}/g, "  ").trim();
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
        "User-Agent": "Mozilla/5.0 (compatible; SparkReels/1.0; +https://sparkreels.ai)",
        Accept: "text/html,text/plain,application/xhtml+xml,application/pdf",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch URL (HTTP ${res.status})` }, { status: 400 });
    }

    const contentType = res.headers.get("content-type") || "";
    const isPdf =
      contentType.includes("application/pdf") ||
      parsedUrl.pathname.toLowerCase().endsWith(".pdf");

    // PDF links: extract text the same way the Upload PDF flow does. The original
    // URL is public, so we return it directly for use as a video reference file.
    if (isPdf) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "PDF is too large (max 20MB)" }, { status: 413 });
      }
      let pdfText: string;
      try {
        pdfText = await extractPdfText(buffer);
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        return NextResponse.json({ error: "Could not read this PDF — it may be scanned/image-only or corrupted." }, { status: 400 });
      }
      if (!pdfText || pdfText.trim().length < 30) {
        return NextResponse.json({ error: "This PDF has no readable text (it may be scanned/image-only). Try a text-based PDF." }, { status: 400 });
      }
      return NextResponse.json({ text: pdfText.slice(0, 5000), url: parsedUrl.toString() });
    }

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/xhtml")
    ) {
      return NextResponse.json(
        { error: "URL must point to a web page (HTML) or a PDF." },
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
