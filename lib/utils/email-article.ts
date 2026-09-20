/**
 * Turn a forwarded email into the article that was inside it.
 *
 * An email carrying an article is mostly not the article: there is a forwarding
 * header block above it, a signature below it, an unsubscribe footer below that,
 * and — if it was forwarded twice — the whole lot again, quoted. None of it is
 * worth summarising into a script, and a signature block in particular reads as
 * content to the summariser, which will happily write a video about the sender's
 * phone number.
 *
 * Everything here is pattern work on what the major clients actually emit. It is
 * deliberately conservative: when a rule is unsure it keeps the text, because a
 * stray signature line costs the user one edit and an over-trimmed article costs
 * them the article. What comes back lands in a box they read and edit before
 * anything is generated, which is what makes that trade the right way round.
 */

/** Length cap, matching what the URL import hands the summariser. */
export const EMAIL_TEXT_LIMIT = 20000;

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  mdash: "—", ndash: "–", hellip: "…", middot: "·",
  bull: "•", trade: "™", copy: "©", reg: "®",
  deg: "°", frac12: "½", zwnj: "", shy: "",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number(dec)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name: string) => {
      const hit = ENTITIES[name.toLowerCase()];
      return hit === undefined ? whole : hit;
    });
}

/**
 * Some providers hand back the body as a `data:` URI rather than as markup.
 * Resend's received-email payload carries an `html_format` field whose values
 * are undocumented, so both shapes are handled rather than guessed at: a string
 * that does not start with `data:` is already the markup.
 */
export function decodeBodyIfDataUri(body: string): string {
  if (!/^data:/i.test(body)) return body;
  const comma = body.indexOf(",");
  if (comma < 0) return body;
  const meta = body.slice(5, comma);
  const payload = body.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) return Buffer.from(payload, "base64").toString("utf8");
    return decodeURIComponent(payload);
  } catch {
    return body;
  }
}

/**
 * Markup to readable text, keeping the shape of the piece.
 *
 * Paragraph and heading breaks are kept as blank lines because they are what
 * makes the box readable when the agent checks it, and because the summariser
 * reads a wall of text as one thought. Tables become lines rather than being
 * dropped: newsletters lay their whole body out in tables.
 */
export function htmlToText(html: string): string {
  // Twice, because an email can carry markup that is itself escaped —
  // &lt;h1&gt; rather than <h1> — which is exactly what arrives when someone
  // pastes an article out of this app's own "Copy as HTML" button. Stripping
  // tags and THEN decoding entities turned that escaped markup back into
  // visible tags in the finished text. The second pass runs only when the
  // decoded result still looks like markup, so ordinary prose about HTML is
  // left alone.
  const once = stripMarkupOnce(html);
  return /<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/i.test(once) ? stripMarkupOnce(once) : once;
}

function stripMarkupOnce(html: string): string {
  let out = html;

  // Nothing inside these is ever prose.
  out = out
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // Quoted chains that clients mark up rather than prefix with ">".
  out = out.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, " ");

  // A link becomes its text. The href is dropped deliberately — a script read
  // aloud cannot use a URL, and newsletter links are tracking redirects.
  out = out.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  out = out
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|section|article|table)\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  out = decodeEntities(out);

  return out
    // Zero-width and layout characters newsletters pad cells with.
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]{2,}/g, " ")
    // Per line, because stripping tags leaves a space where each one was —
    // which on its own would indent every paragraph in the box by one space.
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The header block a client inserts above a forward, in the common clients. */
const FORWARD_MARKER =
  /^\s*(?:-{2,}\s*)?(?:Forwarded message|Original Message|Begin forwarded message)\b[:\s-]*$/im;

/** A single header line from that block, wherever it ends up. */
const HEADER_LINE =
  /^\s*(?:From|To|Cc|Bcc|Sent|Date|Subject|Reply-To)\s*:\s?.*$/i;

/**
 * Where a quoted reply starts. Anchored to a line of its own and required to
 * end in "wrote:" or "sent:", so a sentence that merely begins with "On" is not
 * mistaken for one.
 */
const QUOTE_ATTRIBUTION =
  /^\s*(?:On\b.{0,200}\b(?:wrote|sent)\s*:|.{0,80}\bwrote\s*:)\s*$/im;

/**
 * Footer boilerplate. Matching the LINE, not the text anywhere in it — "you can
 * unsubscribe from this at any time" inside an article about email marketing is
 * prose, and the footer version is always its own short line.
 */
const FOOTER_LINE =
  /^\s*(?:unsubscribe|manage (?:your )?(?:email )?preferences|view (?:this|it) in (?:your )?browser|update your profile|you(?:'re| are) receiving this|sent to \S+@\S+|©\s*\d{4}|copyright\s*©|privacy policy|terms of (?:use|service)|all rights reserved|confidentiality notice|this (?:e-?mail|message) (?:and any attachments )?(?:is|are|may be) (?:confidential|intended)|sent from my \w+)\b.{0,120}$/i;

/**
 * The compliance block an agent's mail and blog platform append.
 *
 * Distinct from FOOTER_LINE because these wrap across several lines, so no
 * single line matches and the bottom-up trim walks straight past them. Left in,
 * this becomes the article's closing paragraph — a piece about downsizing that
 * ends on wire-fraud warnings and "may be deemed an advertisement".
 *
 * Matched only near the end, and only when what follows is short. An article
 * ABOUT wire fraud will mention these words in its body, where this must not
 * touch them.
 */
const LEGAL_BOILERPLATE =
  /(?:this (?:may be deemed|is) an advertisement|not intended to solicit|never trust wiring instructions|information (?:is )?deemed reliable but (?:is )?not guaranteed|equal housing opportunity|each office is independently owned)/i;

/** Where the tail can begin, as a fraction of the whole. */
const BOILERPLATE_ZONE = 0.65;
/** How much text may follow the marker and still count as a tail. */
const BOILERPLATE_MAX_WORDS = 180;

export function stripLegalBoilerplate(text: string): string {
  const match = LEGAL_BOILERPLATE.exec(text);
  if (!match) return text;
  if (match.index < text.length * BOILERPLATE_ZONE) return text;

  // From the start of the sentence it sits in, so half a sentence is not left
  // hanging off the end of the article.
  const before = text.slice(0, match.index);
  const sentenceStart = Math.max(
    before.lastIndexOf("\n"),
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
  );
  const cutAt = sentenceStart > 0 ? sentenceStart + 1 : match.index;

  const tailWords = text.slice(cutAt).trim().split(/\s+/).filter(Boolean).length;
  if (tailWords > BOILERPLATE_MAX_WORDS) return text;

  return text.slice(0, cutAt).trim();
}

/**
 * Contact details that only ever appear in a sign-off.
 *
 * Deliberately narrow — an email address, a link, a phone number, a street
 * address with a ZIP. These are the anchors; the lines around them are found by
 * shape, below.
 */
const STRONG_CONTACT = [
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,
  /(?:https?:\/\/|www\.)\S+/i,
  /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/,
];

/** Longer than this and a line is prose, not a signature line. */
const SIGNATURE_LINE_MAX = 80;

/**
 * The sign-off block at the end, with or without a delimiter above it.
 *
 * SIG_DELIMITER handles the polite case. This handles the common one: a name,
 * a job title, a brokerage, two phone numbers, three calls to action, a
 * website, an email and an office address, each on its own short line, with
 * nothing marking where they begin. The bottom-up trim above walks straight
 * past all of it, because it stops at the first line it does not recognise —
 * and it recognises none of these.
 *
 * Found by anchoring on the last real contact detail and walking UP through
 * short lines until prose starts. Two anchors are required so that an article
 * ending in a short list with one link in it is left alone, and the tail is
 * capped so this can never eat the piece.
 */
const SIGNATURE_MAX_WORDS = 200;

export function stripTrailingSignature(text: string): string {
  const lines = text.split(/\r?\n/);
  const isShort = (l: string) => l.trim().length <= SIGNATURE_LINE_MAX;
  const hasContact = (l: string) => STRONG_CONTACT.some((re) => re.test(l));

  let anchor = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() && hasContact(lines[i]) && isShort(lines[i])) { anchor = i; break; }
    // Keep looking past blank lines only — a line of prose below the contact
    // details means this is not a sign-off.
    if (lines[i].trim()) break;
  }
  if (anchor < 0) return text;

  let start = anchor;
  while (start - 1 >= 0 && (!lines[start - 1].trim() || isShort(lines[start - 1]))) start--;

  const tail = lines.slice(start);
  const tailText = tail.join("\n").trim();
  const anchors = tail.filter((l) => l.trim() && hasContact(l)).length;
  const words = tailText.split(/\s+/).filter(Boolean).length;

  if (anchors < 2 || words > SIGNATURE_MAX_WORDS) return text;
  // Never everything: an email that IS a signature keeps whatever it has, and
  // the word floor upstream decides it was not an article.
  if (start === 0) return text;

  return lines.slice(0, start).join("\n").trim();
}

/** A signature delimiter line: the RFC one, or a row of dashes/underscores. */
const SIG_DELIMITER = /^\s*(?:--\s*|[-_=*]{3,}|—{2,})\s*$/;

/**
 * Contact-detail lines that make up a signature. Used only below a delimiter or
 * in the last few lines, never to cut into the body.
 */
const CONTACT_LINE =
  /^\s*(?:(?:mobile|cell|direct|office|tel|phone|fax|e-?mail|web|www|licen[cs]e|dre|brokerage?)\s*[:#]?\s*\S|\+?\d[\d\s().-]{8,}$|\S+@\S+\.\S+$|(?:https?:\/\/|www\.)\S+$)/i;

/**
 * Strip the wrapper an email puts around an article.
 *
 * Order matters: the forward header block is removed first so that the header
 * lines it contains cannot be confused with a signature further down.
 */
export function stripEmailChrome(text: string): string {
  let body = text;

  /**
   * Everything above the LAST forward marker goes.
   *
   * The last one, not the first: an article forwarded twice has two blocks, and
   * the article itself sits under the innermost. Anything the agent typed above
   * the marker ("thought this was useful") is wrapper too, not the piece.
   */
  const lines = body.split(/\r?\n/);
  let lastMarker = -1;
  lines.forEach((line, i) => {
    if (FORWARD_MARKER.test(line)) lastMarker = i;
  });
  if (lastMarker >= 0) {
    let start = lastMarker + 1;
    // The header lines under the marker, plus the blank lines between them.
    while (start < lines.length && (HEADER_LINE.test(lines[start]) || !lines[start].trim())) {
      start++;
    }
    body = lines.slice(start).join("\n");
  }

  /**
   * A header block with no marker above it.
   *
   * Not every client announces a forward. Verizon's webmail simply drops
   * "From: … Sent: … To: … Subject: …" at the top, and that block was being
   * read as the first paragraph of the article. Two or more header lines
   * together are the signal — one "From:" on its own could be a sentence in a
   * quoted letter — and only near the top, so a header line mentioned halfway
   * through a piece cannot truncate it.
   */
  const head = body.split(/\r?\n/);
  const SCAN = Math.min(head.length, 15);
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i < SCAN; i++) {
    if (!HEADER_LINE.test(head[i])) continue;
    if (runStart < 0) runStart = i;
    runEnd = i;
    // Blank lines inside the block are part of it; anything else ends the run.
    let j = i + 1;
    while (j < SCAN && !head[j].trim()) j++;
    if (j < SCAN && HEADER_LINE.test(head[j])) i = j - 1;
  }
  if (runStart >= 0 && runEnd > runStart) {
    // Everything above the block goes too — it is the covering note, not the
    // article, the same reasoning as the marker case above.
    let after = runEnd + 1;
    while (after < head.length && !head[after].trim()) after++;
    body = head.slice(after).join("\n");
  }

  // A quoted reply below the article, and the ">"-prefixed text under it.
  const quoteAt = body.search(QUOTE_ATTRIBUTION);
  if (quoteAt > 200) body = body.slice(0, quoteAt);
  body = body
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");

  // Below a signature delimiter, if what follows is short enough to be one.
  // Long text under a row of dashes is a section break in the article.
  const sigLines = body.split(/\r?\n/);
  for (let i = sigLines.length - 1; i >= 0; i--) {
    if (!SIG_DELIMITER.test(sigLines[i])) continue;
    const below = sigLines.slice(i + 1);
    const words = below.join(" ").trim().split(/\s+/).filter(Boolean).length;
    if (below.length <= 12 && words < 60) {
      sigLines.length = i;
      break;
    }
  }
  body = sigLines.join("\n");

  // Footer and contact lines, from the bottom up, stopping at the first line
  // that reads as prose — so this can only ever trim the tail.
  const tail = body.split(/\r?\n/);
  while (tail.length > 0) {
    const line = tail[tail.length - 1];
    if (!line.trim() || FOOTER_LINE.test(line) || CONTACT_LINE.test(line) || SIG_DELIMITER.test(line)) {
      tail.pop();
      continue;
    }
    break;
  }
  body = tail.join("\n");

  // Footer lines that sit in the middle, which is where a newsletter's
  // unsubscribe row lands when the article continues below it.
  body = body
    .split(/\r?\n/)
    .filter((line) => !FOOTER_LINE.test(line))
    .join("\n");

  // Last, because both measure where they sit in the text and that has to be
  // the text as it will be kept. Signature first: the compliance block usually
  // sits under it, and removing the sign-off brings the boilerplate into the
  // zone where the other one looks.
  body = stripTrailingSignature(body);
  body = stripLegalBoilerplate(body);
  body = stripTrailingSignature(body);

  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Subject lines carry the client's forward prefixes; the headline underneath
 * them is what the agent recognises in a list.
 */
export function cleanSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/^(?:\s*(?:re|fw|fwd|forward|aw|wg|tr|rv)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * The whole job: pick the best body an email offers, clean it, cap it.
 *
 * HTML is preferred when both are present because it keeps the paragraph and
 * heading structure — the plain-text alternative newsletters generate is often
 * a link dump. A plain-text-only email is used as it stands.
 */
export function articleFromEmail({
  html,
  text,
}: {
  html?: string | null;
  text?: string | null;
}): string {
  const plain = (text ?? "").trim();
  const markup = (html ?? "").trim();

  let body = "";
  if (markup) body = stripEmailChrome(htmlToText(decodeBodyIfDataUri(markup)));
  // Falls back when the markup yielded almost nothing — an email whose body is
  // one big image, or markup this stripped too hard.
  if (countWords(body) < 40 && plain) {
    const fromPlain = stripEmailChrome(decodeBodyIfDataUri(plain));
    if (countWords(fromPlain) > countWords(body)) body = fromPlain;
  }

  return body.slice(0, EMAIL_TEXT_LIMIT).trim();
}
