import { createAdminClient } from "@/lib/supabase/admin";
import {
  articleFromEmail,
  cleanSubject,
  countWords,
  decodeBodyIfDataUri,
} from "@/lib/utils/email-article";
import { tokensFromRecipients } from "@/lib/utils/import-address";
import { extractImageUrls } from "@/lib/utils/listing-photos";
import { rehostImageUrls, storeDataUriImages, storeImageBuffer } from "@/lib/utils/rehost-images";
import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Receives a forwarded email and saves the article inside it.
 *
 * Called by the email provider, not by the app, so there is no session here —
 * the signature on the request is the whole of the authentication, and the token
 * in the recipient address is the whole of "whose account is this".
 *
 * Everything after the lookup is best-effort by design. A webhook that returns
 * an error is retried, and retrying will not fix an email whose body we could
 * not make sense of — it would just deliver the same email again every few
 * minutes. So anything unusable is answered 200 with a reason in the log.
 */

export const maxDuration = 60;

/** Fetching the body, images and attachments all happen on this one clock. */
const RESEND_API = "https://api.resend.com";

/** How long an import stays in the list before the next delivery sweeps it. */
const RETENTION_DAYS = 30;

/** Per-account ceiling for one day, so a subscription loop cannot fill the list. */
const MAX_PER_DAY = 40;

const MAX_IMAGES = 12;

/** An article has to be long enough to be worth summarising. */
const MIN_WORDS = 40;

interface ReceivedAttachment {
  id: string;
  filename?: string | null;
  content_type?: string | null;
  content_disposition?: string | null;
  content_id?: string | null;
  size?: number | null;
  download_url?: string | null;
}

interface ReceivedEmail {
  id: string;
  from?: string | null;
  to?: string[] | null;
  cc?: string[] | null;
  received_for?: string[] | null;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  attachments?: ReceivedAttachment[] | null;
}

/**
 * Svix signature check, written out rather than pulled in as a dependency —
 * it is an HMAC over three known strings, and the Stripe webhook in this app
 * already verifies its own signatures without a helper library too.
 */
function verify(req: NextRequest, body: string): { ok: true } | { ok: false; why: string } {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // No secret configured means no way to tell a real delivery from a forged
  // one, and this endpoint writes to user accounts. It stays shut.
  if (!secret) return { ok: false, why: "RESEND_WEBHOOK_SECRET is not set" };

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatures = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return { ok: false, why: "missing signature headers" };

  // Five minutes either way, so a captured delivery cannot be replayed later.
  const sent = Number(timestamp) * 1000;
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > 5 * 60 * 1000) {
    return { ok: false, why: "timestamp outside tolerance" };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  // "v1,<base64> v1,<base64>" — more than one while a secret is being rotated.
  const offered = signatures.split(" ").map((part) => part.split(",").pop() ?? "");
  const matched = offered.some((candidate) => {
    try {
      const given = Buffer.from(candidate, "base64");
      return given.length === expected.length && timingSafeEqual(given, expected);
    } catch {
      return false;
    }
  });

  return matched ? { ok: true } : { ok: false, why: "signature mismatch" };
}

async function resendGet<T>(path: string): Promise<T | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const res = await fetch(`${RESEND_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error(`Inbound email: ${path} returned ${res?.status ?? "no response"}`);
    return null;
  }
  return res.json() as Promise<T>;
}

/**
 * Images worth keeping as b-roll.
 *
 * The URL filter is the listing scraper's, which already throws out logos,
 * spacers, tracking pixels and icons — exactly what an email signature and a
 * newsletter header are made of. Inline attachments (the `cid:` images a client
 * embeds when you forward) are downloaded instead, and filtered on size: under
 * 20KB is a logo or a social-media icon, not a photograph.
 */
const MIN_ATTACHMENT_BYTES = 20 * 1024;

async function imagesFromEmail(userId: string, email: ReceivedEmail, html: string): Promise<string[]> {
  const collected: string[] = [];

  const linked = extractImageUrls(html, `https://${process.env.INBOUND_EMAIL_DOMAIN || "in.sparkreels.ai"}/`);
  if (linked.length > 0) {
    const stored = await rehostImageUrls(userId, linked.slice(0, MAX_IMAGES));
    // Only ones we actually hold: an image still on the sender's server is one
    // the renderer may not be allowed to fetch later.
    const own = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    collected.push(...stored.filter((u) => own && u.startsWith(own)));
  }

  // Embedded as data: URIs rather than linked — some clients rewrite inline
  // images this way when forwarding.
  const dataUris = (html.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{2000,}/gi) ?? [])
    .slice(0, MAX_IMAGES);
  if (dataUris.length > 0 && collected.length < MAX_IMAGES) {
    collected.push(...await storeDataUriImages(userId, dataUris));
  }

  const imageAttachments = (email.attachments ?? []).filter(
    (a) => (a.content_type ?? "").startsWith("image/")
      && (a.size ?? 0) >= MIN_ATTACHMENT_BYTES,
  );
  for (const attachment of imageAttachments) {
    if (collected.length >= MAX_IMAGES) break;
    if (!attachment.download_url) continue;
    const res = await fetch(attachment.download_url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res?.ok) continue;
    const stored = await storeImageBuffer(
      userId,
      Buffer.from(await res.arrayBuffer()),
      attachment.content_type ?? res.headers.get("content-type") ?? "",
    );
    if (stored) collected.push(stored);
  }

  return collected.slice(0, MAX_IMAGES);
}

/**
 * A PDF attachment IS the article often enough to be worth reading: an agent
 * forwards a market report as a PDF with an empty covering note. Used to fill
 * the body when the email itself carried nothing, and appended when it did.
 */
/** What a PDF read produced, and which PDF it was — the row stores the name. */
interface PdfRead { text: string; source: string }

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** The shared parse. Too little text means a scanned page, which is nothing. */
async function pdfTextFrom(bytes: ArrayBuffer): Promise<string> {
  const proxy = await getDocumentProxy(new Uint8Array(Buffer.from(bytes)));
  const { text } = await extractText(proxy, { mergePages: true });
  const merged = (Array.isArray(text) ? text.join(" ") : text).replace(/\s{3,}/g, "  ").trim();
  return merged.length > 100 ? merged : "";
}

async function textFromPdfAttachments(email: ReceivedEmail): Promise<PdfRead> {
  const pdfs = (email.attachments ?? []).filter(
    (a) => (a.content_type ?? "").includes("pdf") && (a.size ?? 0) < MAX_PDF_BYTES,
  );
  const parts: string[] = [];
  let source = "";
  for (const pdf of pdfs.slice(0, 2)) {
    if (!pdf.download_url) continue;
    try {
      const res = await fetch(pdf.download_url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const merged = await pdfTextFrom(await res.arrayBuffer());
      if (merged) {
        parts.push(merged);
        source ||= pdf.filename || "PDF attachment";
      }
    } catch {
      // A scanned or broken PDF is not a reason to lose the email.
    }
  }
  return { text: parts.join("\n\n"), source };
}

/**
 * Whether a URL may be fetched at all.
 *
 * This is the one place in the app that follows a link chosen by whoever sent
 * the email rather than by the agent reading it. An import address is private,
 * but privacy is not a permission check: anything that learns the address can
 * post a link, and a server that fetches arbitrary URLs is a server that can
 * be pointed at its own network. Public http(s) hosts only.
 */
function fetchableUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) return null;
  return u;
}

/**
 * A PDF the email LINKED to rather than attached.
 *
 * A market report arrives as a link as often as an attachment — "here are this
 * month's numbers" and a URL — and everything behind that link used to be
 * thrown away, leaving a two-line covering note where a 2,000-word report
 * should be.
 *
 * Candidates come from the markup's hrefs and from bare URLs in the plain-text
 * part, because a forwarded email may carry either. A link counts as a PDF if
 * its path says so, or if the server says so when asked. Anything behind a
 * login, a viewer page or a download interstitial answers with HTML and is
 * left alone: that is this feature's honest edge, not a bug to work around.
 */
async function textFromPdfLinks(html: string, text: string): Promise<PdfRead> {
  // Array.from rather than for..of: this file compiles to a target where a
  // RegExp iterator is not directly iterable.
  const found: string[] = [
    ...Array.from(html.match(/href\s*=\s*["'][^"']+["']/gi) ?? [], (h) => h.replace(/^href\s*=\s*["']|["']$/g, "")),
    ...Array.from((text || "").match(/https?:\/\/[^\s<>"')]+/gi) ?? []),
  ];

  const seen = new Set<string>();
  const urls: URL[] = [];
  for (const candidate of found) {
    const u = fetchableUrl(candidate.replace(/&amp;/g, "&").trim());
    if (!u || seen.has(u.href)) continue;
    seen.add(u.href);
    urls.push(u);
    // Enough for a report and its appendix, without turning one email into a
    // crawl of every link in a newsletter footer.
    if (urls.length >= 8) break;
  }

  const parts: string[] = [];
  let source = "";
  for (const u of urls) {
    if (parts.length >= 2) break;
    const looksPdf = /\.pdf($|[?#])/i.test(u.pathname + u.search);
    try {
      // Unknown links are asked what they are before being downloaded, so a
      // newsletter full of article links costs a few HEADs, not a few bodies.
      if (!looksPdf) {
        const head = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(8000) }).catch(() => null);
        const type = (head?.headers.get("content-type") ?? "").toLowerCase();
        if (!head?.ok || !type.includes("pdf")) continue;
      }
      const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!looksPdf && !type.includes("pdf")) continue;
      if (Number(res.headers.get("content-length") ?? 0) > MAX_PDF_BYTES) continue;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > MAX_PDF_BYTES) continue;
      const merged = await pdfTextFrom(bytes);
      if (merged) {
        parts.push(merged);
        source ||= decodeURIComponent(u.pathname.split("/").pop() || "") || u.hostname;
      }
    } catch {
      // A dead link, a slow host, a scanned report: the email still arrives.
    }
  }
  return { text: parts.join("\n\n"), source };
}

export async function POST(req: NextRequest) {
  // The raw body, before any parsing: the signature covers these exact bytes.
  const raw = await req.text();

  const check = verify(req, raw);
  if (!check.ok) {
    console.error(`Inbound email rejected: ${check.why}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Other event types may be subscribed to the same endpoint later.
  if (event.type !== "email.received") return NextResponse.json({ ok: true, ignored: event.type });

  const emailId = event.data?.email_id;
  if (!emailId) return NextResponse.json({ ok: true, ignored: "no email_id" });

  const email = await resendGet<ReceivedEmail>(`/emails/receiving/${emailId}`);
  if (!email) {
    // The one genuinely retryable case: the body could not be fetched. A 500
    // asks the provider to deliver this event again.
    return NextResponse.json({ error: "Could not retrieve email" }, { status: 500 });
  }

  const candidates = tokensFromRecipients([
    ...(email.received_for ?? []),
    ...(email.to ?? []),
    ...(email.cc ?? []),
  ]);
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, ignored: "no address at the inbound domain" });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .in("import_token", candidates)
    .maybeSingle();
  const userId = (profile as { id: string } | null)?.id;
  if (!userId) return NextResponse.json({ ok: true, ignored: "unknown import address" });

  // Retention sweep, here rather than on a schedule: deliveries are the only
  // thing that grows this table, so they are the right moment to trim it.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  await admin.from("email_imports").delete().lt("received_at", cutoff);

  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin
    .from("email_imports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("received_at", since);
  if ((count ?? 0) >= MAX_PER_DAY) {
    return NextResponse.json({ ok: true, ignored: "daily import limit reached" });
  }

  const html = email.html ? decodeBodyIfDataUri(email.html) : "";
  let body = articleFromEmail({ html: email.html, text: email.text });

  /**
   * Attachments first, then links — a PDF is the article either way.
   *
   * The link pass only runs when nothing was attached: an email carrying both
   * is carrying the report twice, and the attachment is the copy that cannot
   * expire behind someone else's redirect.
   */
  let pdf = await textFromPdfAttachments(email);
  if (!pdf.text) pdf = await textFromPdfLinks(html, email.text ?? "");
  if (pdf.text) {
    // The covering note above a report is not the report. Under the floor it
    // is replaced rather than prepended.
    body = countWords(body) < MIN_WORDS ? pdf.text : `${body}\n\n${pdf.text}`;
  }

  if (countWords(body) < MIN_WORDS) {
    // Saved anyway would mean a row in the list that cannot be used for
    // anything. Logged so a real email that lands here can be diagnosed.
    console.error(`Inbound email ${emailId}: only ${countWords(body)} usable words, skipped`);
    return NextResponse.json({ ok: true, ignored: "not enough text" });
  }

  // Linked and embedded images come from the markup, so a plain-text email
  // contributes none — but its attachments are still read, which is how a
  // photo forwarded with a one-line note gets through.
  const images = await imagesFromEmail(userId, email, html);

  const { error } = await admin.from("email_imports").insert({
    user_id: userId,
    provider_email_id: email.id,
    from_address: (email.from ?? "").slice(0, 320) || null,
    subject: cleanSubject(email.subject).slice(0, 300) || null,
    body_text: body,
    word_count: countWords(body),
    image_urls: images,
    // Which PDF these words came out of, so the list can say the report itself
    // arrived rather than leaving a 2,000-word row looking like a forwarded
    // note that happened to be long.
    pdf_source: pdf.source || null,
  });

  // 23505 is a duplicate key: the same delivery arriving twice, which is a
  // success — the article is already saved.
  if (error && error.code !== "23505") {
    console.error("Inbound email insert failed:", error.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
