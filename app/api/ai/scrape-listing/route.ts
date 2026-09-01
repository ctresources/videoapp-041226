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

/**
 * How few photos is too few to accept without a second look. Under this, the
 * raw HTML is fetched as well. Twelve is what the video uses, so anything at
 * or above eight is a full-looking gallery and not worth another request.
 */
const PHOTO_SECOND_LOOK = 8;

/**
 * How much raw HTML to scan.
 *
 * Was 400k, which is smaller than a Zillow listing page — and Zillow does not
 * put its gallery in <img> tags at all, it ships them as URLs inside embedded
 * JSON near the end of the document. So the cap was cutting off precisely the
 * part worth reading, and the merge silently added nothing.
 */
const RAW_HTML_SCAN_LIMIT = 3_000_000;

/**
 * The page as the server sends it, no rendering.
 *
 * Jina distils a page down to readable markdown, which is exactly what the
 * fact parser wants and exactly wrong for galleries: on Zillow the distillate
 * kept five images while the untouched HTML held twelve. This app already
 * proved that — /api/ai/extract-url does a plain fetch and pulled twelve from
 * the same listing that the Jina path found five in.
 *
 * Best effort. Scraper-hostile hosts will 403 this, which costs nothing: the
 * markdown's photos are already in hand and this only ever adds.
 */
async function fetchRawHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // The honest-bot UA that extract-url uses, not the Chrome one this
        // file uses for Jina. A datacentre IP claiming to be Chrome is the
        // combination bot detection is tuned for; the same fetch under this
        // agent is what pulled twelve photos out of the listing that Jina's
        // markdown showed five of.
        "User-Agent": "Mozilla/5.0 (compatible; SparkReels/1.0; +https://sparkreels.ai)",
        Accept: "text/html,application/xhtml+xml",
      },
      // 20s, matching extract-url. 10s was optimistic for a listing portal.
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[scrape-listing] raw HTML fetch refused: HTTP ${res.status}`);
      return null;
    }
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) {
      console.warn(`[scrape-listing] raw HTML fetch returned ${type || "no content-type"}`);
      return null;
    }
    return (await res.text()).slice(0, RAW_HTML_SCAN_LIMIT);
  } catch (e) {
    console.warn(
      `[scrape-listing] raw HTML fetch failed: ${e instanceof Error ? e.name : "unknown"}`,
    );
    return null;
  }
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
      // X-With-Images-Summary was tried here and reverted: instead of adding
      // the gallery it halved the page, 11,518 characters down to 5,361, and
      // returned one photo FEWER. Whatever it changes about the extraction is
      // not worth the text it costs — and the text is what the parser needs
      // most. The gallery is recovered from the raw HTML instead, below.
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

  /**
   * Jina answers 200 and describes the failure in the body, so what went wrong
   * has to be read out of the text. Three things live in there and they used to
   * be collapsed into two wrong answers.
   *
   * The header it writes when the SITE refused it, rather than when Jina
   * itself did. Production logs had realtor.com answering 429 and this route
   * reporting "our reading service has hit its limit" — the target was rate
   * limiting us and we blamed our own supplier, which is both wrong and the
   * one explanation that points at a bill instead of a retry.
   */
  const targetStatus = Number(text.match(/Target URL returned error (\d{3})/i)?.[1] ?? 0);
  const title = (text.match(/^Title:\s*(.+)$/mi)?.[1] ?? "").trim();

  /**
   * A sign-in page wearing a listing's URL.
   *
   * The case that started this: a Bright MLS Matrix link came back titled
   * "SSO | Bright MLS". Matrix URLs only resolve inside a logged-in session,
   * so from outside one there is a login form where the listing should be. No
   * reader can get past that, and no amount of retrying is the fix — pasting
   * the public link is.
   *
   * Read off the title rather than the body: "Sign in" appears in the
   * navigation of half the listing pages on the internet, and matching that
   * would reject perfectly good ones.
   */
  if (/\b(sso|single sign[- ]?on|sign ?in|log ?in|login|authenticate)\b/i.test(title)) {
    console.warn(`[scrape-listing] Login wall: ${JSON.stringify(title)} (HTTP ${targetStatus || 200})`);
    throw new Error("LOGIN_REQUIRED");
  }

  // Cloudflare's interstitial, which is a block by another name. "Just a
  // moment..." was in none of the patterns below, so a shortened link landing
  // on a challenged host fell through to the length test and was reported as
  // whatever that happened to decide.
  if (/just a moment|checking your browser|attention required|cf-browser-verification/i.test(title + text.slice(0, 1500))) {
    console.warn(`[scrape-listing] Challenge page: ${JSON.stringify(title)} (HTTP ${targetStatus || 200})`);
    throw new Error("BLOCKED");
  }

  if (blocked) {
    console.warn(
      `[scrape-listing] Page refused the read (${text.trim().length} chars) ` +
      `head=${JSON.stringify(text.trim().slice(0, 300))}`,
    );
    throw new Error("BLOCKED");
  }

  // The listing site is throttling, not us. Worth a retry in a minute; not
  // worth a word about quotas or billing.
  if (targetStatus === 429) {
    console.warn(`[scrape-listing] Target rate-limited us (429): ${JSON.stringify(title)}`);
    throw new Error("TARGET_BUSY");
  }

  /**
   * Now — and only now — Jina complaining about itself.
   *
   * The quota words are generic enough that they match a target's own error
   * notice, which is exactly how a 429 from realtor.com became "usage limit".
   * With no Target-URL header in the body, the complaint is Jina's own.
   */
  const quota = /rate limit|rate-limit|quota|too many requests|insufficient|balance|exceeded|upgrade your plan|billing/i
    .test(text.slice(0, 1000));
  if (quota && !targetStatus && text.trim().length < 2000) {
    console.error(`[scrape-listing] Jina refused the request: ${JSON.stringify(text.trim().slice(0, 300))}`);
    throw new Error("JINA_QUOTA");
  }

  // Any other refusal by the site itself, named so the log says which.
  if (targetStatus >= 400) {
    console.warn(`[scrape-listing] Target returned ${targetStatus}: ${JSON.stringify(title)}`);
    throw new Error(`TARGET_ERROR_${targetStatus}`);
  }

  /**
   * Read, but nothing in it.
   *
   * This used to be folded into BLOCKED by a `length < 500` test, which told
   * people a site had refused the import when it had done no such thing — a
   * lean MLS listing reads out to roughly 450 characters, and was called
   * blocked for being brief. That is the wrong thing to measure and, worse,
   * the wrong fix to suggest: "the page blocked us" sends someone off to check
   * a link that was fine.
   *
   * Kept separate so the fallback can try it and the message can be honest.
   */
  if (!hasListingFacts(text)) {
    console.warn(
      `[scrape-listing] Read but thin (${text.trim().length} chars, no listing facts) ` +
      `head=${JSON.stringify(text.trim().slice(0, 300))}`,
    );
    throw new Error("THIN");
  }
  return text;
}

/**
 * Is there a listing in here, or just page furniture?
 *
 * Length is the wrong measure and measurably so: a lean but complete listing
 * — address, price, four beds, two and a half baths, 2,840 sqft and two
 * paragraphs of description — comes out around 450 characters, while a
 * JavaScript-rendered shell of cookie notices and "please enable JavaScript"
 * runs longer than that and holds no listing at all.
 *
 * A price or a bed/bath/sqft figure is what a listing cannot be without. It
 * matters more than it looks: text with no facts does not fail loudly
 * downstream — the parser invents a listing to fit, which is the one outcome
 * worse than an error message.
 */
function hasListingFacts(text: string): boolean {
  return (
    /\$\s?[\d,]{3,}/.test(text) ||
    /\b\d+(\.\d+)?\s*(bed|bd|bath|ba)\b/i.test(text) ||
    /\bsq\.?\s?(ft|feet)\b/i.test(text)
  );
}

/**
 * Strip a raw HTML page down to the readable text the parser wants.
 *
 * The same treatment /api/ai/extract-url gives a page, kept simple on purpose:
 * this is the fallback, and a fallback that needs its own parser is a second
 * thing to go wrong.
 */
function htmlToText(html: string): string {
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
  return text.replace(/\s{3,}/g, "  ").trim();
}

/**
 * The listing page as text, from whichever reader can get it.
 *
 * Jina first: it renders JavaScript and distils the page to markdown, which is
 * both what the fact parser reads best and the only thing that works on a
 * portal that builds its content in the browser.
 *
 * A plain fetch second. It cannot render JavaScript and scraper-hostile hosts
 * refuse it outright, so it will never rescue a Zillow link — but it costs
 * nothing, needs no key, and this route already proved it works: the gallery
 * second-look below pulls photos out of exactly this fetch, twelve from a
 * listing whose Jina markdown held five. An agent's own site, a brokerage
 * page or a plain MLS page reads fine this way.
 *
 * The point is that Jina running out of quota stops being total. It was the
 * only reader, so its limit took every listing URL down with it regardless of
 * which site the link pointed at.
 */
async function readListingPage(url: string): Promise<string> {
  try {
    return await fetchWithJina(url);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    /**
     * Worth a second reader, or not?
     *
     * The plain fetch is not a weaker version of Jina — it is a different
     * client with different failure modes, which is the whole reason it is
     * worth having. Jina is a known scraping service and hosts block it by
     * name; this route's own gallery second-look is the proof that the plain
     * fetch gets through where the markdown came up short. So a page that
     * refused Jina is absolutely worth offering to the other one.
     *
     * Two exceptions, for the same reason. NOT_A_LISTING means the page was
     * read perfectly well and is not a listing; LOGIN_REQUIRED means the
     * listing is behind a sign-in this server has no credentials for. Neither
     * is a reading problem, so reading it again cannot help — and on a login
     * wall a second fetch is a second chance to look like a scraper for
     * nothing.
     */
    const worthRetrying =
      code === "JINA_QUOTA" ||
      code === "NO_JINA_KEY" ||
      code === "BLOCKED" ||
      code === "THIN" ||
      code === "TARGET_BUSY" ||
      code.startsWith("TARGET_ERROR_") ||
      code.startsWith("Jina fetch failed");
    if (!worthRetrying) throw err;

    console.warn(`[scrape-listing] Jina unavailable (${code}) — falling back to a direct fetch.`);
    const html = await fetchRawHtml(url);
    const text = html ? htmlToText(html) : "";

    // Same bar the first reader is held to — see hasListingFacts. Rethrow the
    // original either way: the fallback also failing does not change what went
    // wrong first, and that is what the user needs told.
    if (text.length < 200 || !hasListingFacts(text)) {
      console.warn(
        `[scrape-listing] fallback unusable (${text.length} chars, ` +
        `facts=${hasListingFacts(text)}) — reporting the original failure.`,
      );
      throw err;
    }

    console.log(`[scrape-listing] fallback fetch succeeded: ${text.length} chars.`);
    return text;
  }
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
    const markdown = await readListingPage(url);
    const listing = await parseListingWithPerplexity(markdown);
    // Photos come from the markdown, not the model — see extractImageUrls.
    // Resolved against the final URL so relative paths work after a redirect.
    listing.photoUrls = extractImageUrls(markdown, url);

    // A short gallery usually means the distillation dropped it rather than
    // that the listing has five photos. Scanning markdown and raw HTML as one
    // string lets extractImageUrls do the de-duplication across both, and
    // keeps the markdown's photos first — those are the ones the page put in
    // its article body, so they lead.
    if (listing.photoUrls.length < PHOTO_SECOND_LOOK) {
      const html = await fetchRawHtml(url);
      if (!html) {
        // Silence here was indistinguishable from "not attempted", "blocked"
        // and "found nothing new" — three different problems, no way to tell
        // them apart from the outside.
        console.warn("[scrape-listing] second look: no raw HTML (blocked, non-HTML, or timed out)");
      } else {
        const merged = extractImageUrls(`${markdown}\n${html}`, url);
        console.log(
          `[scrape-listing] second look: ${html.length} chars of HTML, ` +
          `${listing.photoUrls.length} → ${merged.length} photo(s)`,
        );
        if (merged.length > listing.photoUrls.length) listing.photoUrls = merged;
      }
    }

    // The URLs themselves, not just the count. Twice now a photo problem has
    // turned on WHICH images were picked — an MLS attribution logo among them,
    // a thumbnail chosen where the full size existed — and neither of those is
    // visible in a number.
    console.log(
      `[scrape-listing] photos: ${listing.photoUrls.map((u) => u.slice(0, 120)).join(" | ")}`,
    );

    // A page can be fetched perfectly and still not be a listing.
    //
    // An off-market listing on an IDX site returns 200 with a real page that
    // says "maybe it went off the market" and carries no facts at all. The
    // parser then does the right thing and finds nothing — but returning that
    // as a success handed back an empty form with no explanation, and the few
    // images such a page does have are site furniture rather than the property.
    //
    // Address and price are the two the form itself requires, so a page
    // offering neither is not one this flow can use.
    if (!listing.address.trim() && !listing.price.trim()) {
      console.warn(
        `[scrape-listing] No listing on ${parsedUrl.hostname}${parsedUrl.pathname} ` +
        `(${markdown.length} chars read, ${listing.photoUrls.length} image(s))`,
      );
      throw new Error("NOT_A_LISTING");
    }
    // With the path, not just the host. Every short link logs as "myre.io",
    // so two imports of different listings were indistinguishable in the logs
    // at exactly the moment that difference was the answer.
    console.log(
      `[scrape-listing] ${listing.photoUrls.length} photo(s) found for ` +
      `${parsedUrl.hostname}${parsedUrl.pathname}`,
    );
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
    //
    // And explicitly not THEIR limit. "Listing import has hit its usage limit"
    // was read as "you have used up your allowance", which is alarming, wrong,
    // and points at the billing page instead of the manual form. Whose limit it
    // is turns out to be the only part of this message that matters.
    if (code === "JINA_QUOTA") {
      return NextResponse.json(
        {
          error:
            "The service we use to read listing pages has hit its own limit — " +
            "nothing to do with your account, and no video credits were used. " +
            "Enter the details manually, or try again later.",
        },
        { status: 503 },
      );
    }

    /**
     * The MLS link that only works while you are logged in.
     *
     * The most useful message this route can produce, because the fix is
     * entirely in the user's hands and is not "try again": a Matrix or
     * portal-session URL shows a sign-in page to anyone who isn't the person
     * who copied it. It used to be reported as the site blocking us, which
     * describes neither what happened nor what to do about it.
     */
    if (code === "LOGIN_REQUIRED") {
      return NextResponse.json(
        {
          error:
            "That link opens your MLS sign-in page, not a listing — links from inside " +
            "Matrix or a portal session only work while you're logged in. Paste the " +
            "public listing link (the one you'd send a client), or enter the details manually.",
        },
        { status: 422 },
      );
    }

    // The listing site throttled us, not the other way round. A minute is the
    // fix, so say so instead of talking about limits and plans.
    if (code === "TARGET_BUSY") {
      return NextResponse.json(
        {
          error:
            "The listing site is asking us to slow down. Wait a minute and try again, " +
            "or enter the details manually — nothing is wrong with your account.",
        },
        { status: 503 },
      );
    }

    if (code.startsWith("TARGET_ERROR_")) {
      return NextResponse.json(
        {
          error:
            `The listing site returned an error (${code.replace("TARGET_ERROR_", "")}) instead of the page. ` +
            "Check the link is still live, or enter the details manually.",
        },
        { status: 502 },
      );
    }

    // Read, but nothing usable in it — most often a page that builds itself in
    // the browser, so both readers saw the shell around the listing rather than
    // the listing. Not the same as being blocked, and it used to be reported as
    // if it were, which sent people off to re-check a link that was fine.
    if (code === "THIN") {
      return NextResponse.json(
        {
          error:
            "That page loaded, but no listing details came through — some MLS sites " +
            "build the page in your browser, so there is nothing to read from outside it. " +
            "Enter the details manually, or try the public listing page if you have one.",
        },
        { status: 422 },
      );
    }

    // The page read fine — it just wasn't a listing. Say which, because the
    // fix is a different link (or the manual form), not a retry.
    if (code === "NOT_A_LISTING") {
      return NextResponse.json(
        {
          error:
            "That page doesn't show a listing — it may have sold or come off the market. " +
            "Check the link, or enter the details manually.",
        },
        { status: 422 },
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
