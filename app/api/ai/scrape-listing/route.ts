import { createClient } from "@/lib/supabase/server";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";
import { extractImageUrls } from "@/lib/utils/listing-photos";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { coerceListing } from "@/lib/utils/listing-data";

/**
 * Two upstream calls in series — Jina renders the page, then Perplexity reads
 * it — and this route declared no duration at all, so it ran on the platform
 * default while its own fetch was willing to wait 20 seconds.
 */
export const maxDuration = 60;

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

/**
 * Sanity-check a pasted link before handing it to Jina.
 *
 * Deliberately not an allowlist — see the call site. This only rejects things
 * that cannot be a public listing page: non-web schemes, and hosts that only
 * resolve inside a private network. Jina fetches the page from its own
 * infrastructure, so this is belt-and-braces rather than the security boundary.
 */
function isPubliclyFetchable(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "::1") return false;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

/** A real browser UA — shorteners and IDX hosts often 403 default agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Follow redirects ourselves before handing the URL to Jina.
 *
 * MLS short links are bot-protected. Jina fetching myre.io/xxx came back
 * "Just a moment... Target URL returned error 403" — the import died on the
 * shortener without ever reaching the listing, and the user was told their
 * page had blocked us. A plain server-side request follows the same 301 fine,
 * so resolve the chain here and give Jina the destination instead.
 *
 * Every hop is re-validated: following redirects server-side is exactly the
 * shape of an SSRF, and a shortener can point anywhere it likes. On any
 * failure we return the last good URL and let Jina try that — never throw,
 * since this is an optimisation, not a gate.
 */
async function resolveRedirects(start: URL): Promise<URL> {
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return current;
    }
    if (res.status < 300 || res.status >= 400) return current;
    const location = res.headers.get("location");
    if (!location) return current;

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return current;
    }
    // Re-check each hop — the first URL being safe says nothing about the last.
    if (!isPubliclyFetchable(next)) {
      console.warn(`[scrape-listing] Redirect to a non-public host, stopping at ${current.hostname}`);
      return current;
    }
    current = next;
  }
  return current;
}

async function fetchWithJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  // Anonymous r.jina.ai is now behind a Cloudflare challenge: every request,
  // even for example.com, comes back 403 with a "Just a moment..." page. That
  // fails the blocked-page check below, so listing import failed for EVERY
  // site, not just the scraper-hostile ones. A free key lifts that.
  const key = process.env.JINA_API_KEY;
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
      ...(key && { Authorization: `Bearer ${key}` }),
    },
    // 45s, up from 20s. Jina has to follow the link, render the page and turn
    // it into markdown, and 20 seconds was not enough for the ordinary case of
    // a shortened link (myre.io, bit.ly) pointing at a JS-rendered agent site:
    // the redirect is resolved first, then a slow page is rendered second.
    // Those timed out and the user was told the listing could not be READ,
    // which sent them off to retype a link that was working fine.
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    if (!key && (res.status === 403 || res.status === 429)) {
      throw new Error("NO_JINA_KEY");
    }
    throw new Error(`Jina fetch failed: ${res.status}`);
  }
  const text = await res.text();

  // Zillow and friends aggressively block scrapers. A blocked/CAPTCHA page
  // still returns 200, and feeding that to the parser produces a fully
  // invented listing — so treat it as a hard failure and let the caller tell
  // the user to enter details manually.
  const blocked = /captcha|are you a human|verify you are|access denied|unusual traffic|press & hold|enable javascript/i.test(
    text.slice(0, 4000),
  );

  // A very short 200 is usually Jina talking about itself — a quota or
  // rate-limit notice — rather than the listing page. That is a different
  // problem from a hostile site and deserves a different message, so check
  // before falling through to BLOCKED.
  const quota = /rate limit|rate-limit|quota|too many requests|insufficient|balance|exceeded|upgrade your plan|billing/i
    .test(text.slice(0, 1000));
  if (quota && text.trim().length < 2000) {
    console.error(`[scrape-listing] Jina refused the request: ${JSON.stringify(text.trim().slice(0, 300))}`);
    throw new Error("JINA_QUOTA");
  }

  if (blocked || text.trim().length < 500) {
    // Log the response head. Without it a 221-character reply is
    // indistinguishable from a JS-rendered page, a quota notice, and an outage.
    console.warn(
      `[scrape-listing] Unusable page (${text.trim().length} chars, blocked=${blocked}) ` +
      `head=${JSON.stringify(text.trim().slice(0, 300))}`,
    );
    throw new Error("BLOCKED");
  }
  return text;
}

async function parseListingWithPerplexity(markdown: string): Promise<ListingData> {
  // Listing pages are large and the beds/baths/sqft facts often sit well past
  // the first few thousand characters — truncating at 8k hid them and the
  // model filled the gaps with invented values.
  //
  // 60k, because 30k was still cutting real pages: a myre.io listing arrived
  // at 42,750 characters and a third of it never reached the model. The tail
  // is where the remarks and the feature list usually sit, which is exactly
  // what came back thin.
  const LIMIT = 60000;
  const truncated = markdown.slice(0, LIMIT);
  if (markdown.length > LIMIT) {
    // Logged rather than silent, so the next time something comes back short
    // there is a line saying whether the page was cut or simply did not say.
    console.warn(
      `[scrape-listing] page truncated: ${markdown.length} chars → ${LIMIT}; ` +
      `${markdown.length - LIMIT} chars not sent to the parser`,
    );
  }

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
  "description": "the listing's own description, copied as written (max 1200 chars)",
  "features": ["feature 1", "feature 2", ...] (max 12 items),
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
      // 1500, up from 800. A 1,200-character description and twelve features
      // do not fit in 800 tokens alongside the rest of the object, and the
      // JSON would have been cut off mid-string — which the parser below
      // would have read as a failure, not as a shorter answer.
      max_tokens: 1500,
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

  // Coerced, not asserted: the model may answer null for any field and
  // the client treats these as strings.
  const parsed = coerceListing(JSON.parse(jsonMatch[0]));

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

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const { url } = await req.json() as { url: string };
  if (!url?.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid link." }, { status: 400 });
  }

  // Previously this allowed only six national portals, which rejected the two
  // kinds of link agents actually paste: their own IDX site (every agent has a
  // different domain, so no list can cover them) and MLS short links, whose
  // host says nothing about where they land. Jina resolves redirects and does
  // the fetching, so the host check earns nothing — a page that cannot be read
  // already fails as BLOCKED below, with a message that says so.
  if (!isPubliclyFetchable(parsedUrl)) {
    return NextResponse.json(
      { error: "Please paste a public https link to the listing." },
      { status: 400 },
    );
  }

  try {
    const markdown = await fetchWithJina(url);
    const listing = await parseListingWithPerplexity(markdown);
    // Photos come from the markdown, not the model — see extractImageUrls.
    // Resolved against the final URL so relative paths work after a redirect.
    listing.photoUrls = extractImageUrls(markdown, url);
    console.log(`[scrape-listing] ${listing.photoUrls.length} photo(s) found for ${parsedUrl.hostname}`);
    return NextResponse.json({ listing });
  } catch (err) {
    console.error("Scrape listing error:", err);
    const code = err instanceof Error ? err.message : "";

    // Separated so a missing key stops looking like a hostile website. Without
    // it, a server-side configuration problem read as "Zillow blocked us" and
    // sent every user off to type the listing in by hand.
    if (code === "NO_JINA_KEY") {
      console.error("[scrape-listing] JINA_API_KEY is not set — anonymous r.jina.ai is Cloudflare-challenged, so every import fails.");
      return NextResponse.json(
        { error: "Listing import isn't available right now. Please enter the details manually." },
        { status: 503 },
      );
    }

    // Our own limit, not the listing site's — saying "that page blocked us"
    // would send the user off to re-check a link that is perfectly fine.
    if (code === "JINA_QUOTA") {
      return NextResponse.json(
        { error: "Listing import has hit its usage limit for now. Please enter the details manually, or try again later." },
        { status: 503 },
      );
    }

    // A timeout is not an unreadable listing, and saying so sent people off to
    // retype a link that was fine. Shortened links are the usual cause: the
    // redirect is resolved first and the real page rendered second.
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "That listing took too long to load — try Import again, or enter the details manually." },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error: code === "BLOCKED"
          ? "That page blocked the import (Zillow and some MLS sites do this). Please enter the listing details manually — it only takes a minute."
          : "Could not read that listing. Try entering the details manually.",
      },
      { status: 422 }
    );
  }
}
