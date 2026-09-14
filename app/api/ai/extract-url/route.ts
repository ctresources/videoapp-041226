import { createClient } from "@/lib/supabase/server";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { extractImageUrls } from "@/lib/utils/listing-photos";

// 60, not 30. The PDF branch fetches up to 20MB and then parses it with
// unpdf; with the fetch alone allowed 20s, 30 left too little for the parse.
export const maxDuration = 60;

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

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  let url: string;
  let maxChars: number | undefined;
  try {
    ({ url, maxChars } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  /**
   * How much text to return.
   *
   * 5,000 by default because that is what every existing caller was built
   * around: the reference-doc extracts feed straight into script prompts, and
   * quietly handing them four times as much text would inflate every one of
   * those prompts — squeezing the instruction budget that decides how well a
   * render follows its brief.
   *
   * Summarising a whole blog post is the case that needs more. 5,000
   * characters is roughly 800 words, and this app's own blog generator writes
   * about 1,300, so the default truncates its own output before the summariser
   * ever sees the end of it. That path asks for 20,000; nothing else changes.
   */
  const textLimit = Math.min(Math.max(Number(maxChars) || 5000, 500), 20000);

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
    const accept = "text/html,text/plain,application/xhtml+xml,application/pdf";
    /**
     * 20s, up from 12s. This is a plain fetch with no rendering, so it does
     * not need the 45s the listing scraper does — but a shortened link is
     * resolved on this clock too, and 12s left little room for a slow host
     * once the redirect had been followed.
     */
    const attempt = (ua: string) =>
      fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent": ua,
          Accept: accept,
          // Sent on both attempts: a request with no language preference at
          // all is itself a signal some hosts filter on.
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(20000),
      });

    /**
     * The honest agent first, a browser one only if that is refused.
     *
     * Ordered this way deliberately. The listing scraper's note is that a
     * datacentre IP claiming to be Chrome is the combination bot detection is
     * tuned for — leading with the browser agent would make us look worse to
     * the hosts that currently let us in. But plenty of sites, including some
     * agents' own blog platforms, reject anything that does not look like a
     * browser at all, and for those the honest agent is the only thing
     * standing between the user and their own writing.
     */
    let res = await attempt("Mozilla/5.0 (compatible; SparkReels/1.0; +https://sparkreels.ai)");
    if (res.status === 403 || res.status === 401 || res.status === 429) {
      const retry = await attempt(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      ).catch(() => null);
      if (retry?.ok) res = retry;
    }

    if (!res.ok) {
      /**
       * A refusal is not a broken link, and saying "HTTP 403" invites someone
       * to check a URL that is perfectly correct.
       *
       * Some hosts block on IP reputation and TLS fingerprint rather than
       * headers, which no user agent can talk its way past — so this names the
       * one route that always works instead of implying a retry might help.
       */
      const blocked = res.status === 403 || res.status === 401 || res.status === 429;
      return NextResponse.json(
        {
          error: blocked
            ? `${parsedUrl.hostname} blocked us from reading the page. Open it, copy the text, and paste it in instead.`
            : res.status === 404
              ? "That page could not be found. Check the link and try again."
              : `Could not fetch that page (HTTP ${res.status}). Try again, or paste the text in instead.`,
        },
        { status: 400 },
      );
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
      return NextResponse.json({ text: pdfText.slice(0, textLimit), url: parsedUrl.toString() });
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

    // Always attempted, regardless of what kind of page this is — this endpoint
    // takes any URL (reference doc, article, listing), not just real-estate
    // listings, so there is no reliable signal to gate on. Run against the raw
    // HTML, before extractTextFromHtml strips every tag including <img>.
    const photoUrls = extractImageUrls(html, parsedUrl.toString());

    return NextResponse.json({ text: text.slice(0, textLimit), url: parsedUrl.toString(), photoUrls });
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
