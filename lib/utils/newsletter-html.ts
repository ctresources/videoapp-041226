import {
  FONT, INK, MUTED, esc, emailP, emailButton, emailShell, emailSignatureHtml, emailSignatureText,
  type EmailSignature,
} from "@/lib/utils/email-html";

/**
 * The newsletter (from blog posts) and the seller update, as email HTML and
 * plain text (2026-10-15). Built the same way as the single post's email
 * version, from the same parts, so they look alike in an inbox: nested
 * tables, inline styles, a table-cell button.
 */

export interface Newsletter {
  subjects: string[];
  preview: string;
  greeting: string;
  opening: string;
  items: { projectId: string; title: string; teaser: string }[];
  closing: string;
  button: string;
}

const isUrl = (u?: string | null) => !!u && /^https?:\/\/\S+\.\S+/i.test(u.trim());

export function newsletterAsHtml(n: Newsletter, opts: {
  subject: string;
  urls: Record<string, string>;
  signature: EmailSignature;
}): string {
  const items = n.items.map((it) => {
    const url = opts.urls[it.projectId]?.trim();
    return `<h2 style="margin:8px 0 6px;font-family:${FONT};font-size:19px;line-height:1.35;color:${INK};">${esc(it.title)}</h2>
${it.teaser ? emailP(it.teaser) : ""}
${isUrl(url) ? emailButton(url!, n.button, "0 0 22px") : ""}`;
  }).join("\n");

  return emailShell({
    title: opts.subject,
    preview: n.preview,
    inner: `<tr><td style="padding:28px 24px 24px;">
${emailP(n.greeting)}
${emailP(n.opening)}
${items}
${n.closing ? emailP(n.closing) : ""}
${emailSignatureHtml(opts.signature)}
</td></tr>`,
  });
}

export function newsletterAsText(n: Newsletter, opts: { urls: Record<string, string>; signature: EmailSignature }): string {
  return [
    n.greeting, "", n.opening, "",
    ...n.items.flatMap((it) => {
      const url = opts.urls[it.projectId]?.trim();
      return [it.title, ...(it.teaser ? [it.teaser] : []), ...(isUrl(url) ? [`${n.button}: ${url}`] : []), ""];
    }),
    n.closing, "",
    ...emailSignatureText(opts.signature),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Seller update ───────────────────────────────────────────────────────

export interface SellerUpdateEmail {
  subjects: string[];
  greeting: string;
  opening: string;
  paragraphs: string[];
  closing: string;
}

/** This week's numbers, with last week's beside them when there were any. */
export interface SellerStats {
  views?: number | null;
  saves?: number | null;
  showings?: number | null;
  openHouse?: number | null;
  offers?: number | null;
}

const STAT_LABELS: [keyof SellerStats, string][] = [
  ["views", "online views"],
  ["saves", "saves"],
  ["showings", "showings"],
  ["openHouse", "open house visitors"],
  ["offers", "offers"],
];

/** The figures the agent filled in, in order, with the change from last week. */
export function sellerStatRows(now: SellerStats, before?: SellerStats | null) {
  return STAT_LABELS
    .filter(([k]) => typeof now[k] === "number")
    .map(([k, label]) => {
      const v = now[k] as number;
      const prev = before?.[k];
      const change = typeof prev === "number" ? v - prev : null;
      return { key: k, label, value: v, change };
    });
}

/** The agent's video update, recorded on the camera for this update. */
export interface SellerVideo {
  url: string;
  posterUrl?: string | null;
  seconds?: number | null;
}

const clock = (s?: number | null) =>
  typeof s === "number" && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "";

/**
 * The video, as email can show one: a still with a play button drawn on,
 * linked to the video, and a button under it. No email app plays video inside
 * the message, so the reader taps through to watch.
 */
export function videoBlock(v: SellerVideo, words = "Watch my video update"): string {
  if (!isUrl(v.url)) return "";
  const label = `${words}${clock(v.seconds) ? ` (${clock(v.seconds)})` : ""}`;
  const poster = isUrl(v.posterUrl)
    ? `<a href="${esc(v.url)}"><img src="${esc(v.posterUrl!)}" width="552" alt="${esc(label)}" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:10px;margin:0 0 12px;"></a>`
    : "";
  return poster + emailButton(v.url, label, "0 0 20px");
}

export function sellerUpdateAsHtml(e: SellerUpdateEmail, opts: {
  subject: string;
  stats: SellerStats;
  before?: SellerStats | null;
  signature: EmailSignature;
  video?: SellerVideo | null;
}): string {
  const rows = sellerStatRows(opts.stats, opts.before);
  // Up to four across, then a second row: one table row per four figures.
  const cells = rows.map((r) => {
    const change = r.change && r.change > 0
      ? `<div style="font-family:${FONT};font-size:12px;font-weight:bold;color:#15803d;">&#9650; ${r.change}</div>`
      : "";
    return `<td align="center" valign="top" width="25%" style="padding:10px 6px;background:#faf5ec;border-radius:8px;"><div style="font-family:${FONT};font-size:24px;font-weight:bold;color:#a3660f;">${r.value.toLocaleString("en-US")}</div><div style="font-family:${FONT};font-size:12px;color:${MUTED};">${esc(r.label)}</div>${change}</td>`;
  });
  const statRows: string[] = [];
  for (let i = 0; i < cells.length; i += 4) {
    const row = cells.slice(i, i + 4);
    statRows.push(`<tr>${row.join(`<td width="8" style="font-size:0;">&nbsp;</td>`)}</tr>`);
  }
  const stats = statRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;border-spacing:0 8px;">${statRows.join("")}</table>`
    : "";

  return emailShell({
    title: opts.subject,
    preview: e.opening,
    inner: `<tr><td style="padding:28px 24px 24px;">
${emailP(e.greeting)}
${emailP(e.opening)}
${opts.video ? videoBlock(opts.video) : ""}
${stats}
${e.paragraphs.map(emailP).join("\n")}
${e.closing ? emailP(e.closing) : ""}
${emailSignatureHtml(opts.signature)}
</td></tr>`,
  });
}

export function sellerUpdateAsText(e: SellerUpdateEmail, opts: {
  stats: SellerStats;
  before?: SellerStats | null;
  signature: EmailSignature;
  video?: SellerVideo | null;
}): string {
  const rows = sellerStatRows(opts.stats, opts.before).map(
    (r) => `- ${r.value.toLocaleString("en-US")} ${r.label}${r.change && r.change > 0 ? ` (up ${r.change} since my last update)` : ""}`,
  );
  const video = opts.video && isUrl(opts.video.url)
    ? [`Watch my video update${clock(opts.video.seconds) ? ` (${clock(opts.video.seconds)})` : ""}: ${opts.video.url}`, ""]
    : [];
  return [
    e.greeting, "", e.opening, "", ...video,
    ...rows, ...(rows.length ? [""] : []),
    ...e.paragraphs.flatMap((p) => [p, ""]),
    e.closing, "",
    ...emailSignatureText(opts.signature),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── A video from My Sparks, emailed to chosen contacts ─────────────────

/**
 * {first name} in the note becomes the reader's first name, or is dropped
 * (with the greeting's comma kept tidy) when there isn't one.
 */
export function personalNote(note: string, firstName?: string | null): string {
  const name = (firstName ?? "").trim();
  return note
    .replace(/\{\s*first\s*name\s*\}/gi, name)
    .replace(/\b(Hi|Hello|Hey|Dear)\s+,/g, "$1,")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** The note, then the video as a still with a play button and a Watch button, then the sign-off. */
export function videoEmailAsHtml(opts: {
  subject: string; note: string; firstName?: string | null; video: SellerVideo; signature: EmailSignature;
}): string {
  const paras = personalNote(opts.note, opts.firstName).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return emailShell({
    title: opts.subject,
    preview: paras[0] ?? opts.subject,
    inner: `<tr><td style="padding:28px 24px 24px;">
${paras.map(emailP).join("\n")}
${videoBlock(opts.video, "Watch the video")}
${emailSignatureHtml(opts.signature)}
</td></tr>`,
  });
}

export function videoEmailAsText(opts: { note: string; firstName?: string | null; video: SellerVideo; signature: EmailSignature }): string {
  return [
    personalNote(opts.note, opts.firstName), "",
    `Watch the video${clock(opts.video.seconds) ? ` (${clock(opts.video.seconds)})` : ""}: ${opts.video.url}`, "",
    ...emailSignatureText(opts.signature),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Ask for Google Review Video Email (2026-10-27): the note, the video as a
 * still with a play button, then a big gold button to the agent's Google
 * review page, and the sign-off.
 */
export function reviewRequestAsHtml(opts: {
  subject: string; note: string; firstName?: string | null; video: SellerVideo; reviewUrl: string; signature: EmailSignature;
}): string {
  const paras = personalNote(opts.note, opts.firstName).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const star = isUrl(opts.reviewUrl)
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;"><tr><td align="center" bgcolor="#BA7517" style="border-radius:10px;mso-padding-alt:16px 24px;"><a href="${esc(opts.reviewUrl)}" style="display:block;padding:16px 24px;font-family:${FONT};font-size:18px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;"><span style="color:#ffffff;text-decoration:none;">&#9733;&#9733;&#9733;&#9733;&#9733;&nbsp; Leave me a Google review</span></a></td></tr></table>
<p style="margin:0 0 20px;font-family:${FONT};font-size:14px;color:${MUTED};text-align:center;">It takes about a minute. Thank you!</p>`
    : "";
  return emailShell({
    title: opts.subject,
    preview: paras[0] ?? opts.subject,
    inner: `<tr><td style="padding:28px 24px 24px;">
${paras.map(emailP).join("\n")}
${videoBlock(opts.video, "Watch my video")}
${star}
${emailSignatureHtml(opts.signature)}
</td></tr>`,
  });
}

export function reviewRequestAsText(opts: { note: string; firstName?: string | null; video: SellerVideo; reviewUrl: string; signature: EmailSignature }): string {
  return [
    personalNote(opts.note, opts.firstName), "",
    `Watch my video: ${opts.video.url}`, "",
    `Leave me a Google review: ${opts.reviewUrl}`, "",
    ...emailSignatureText(opts.signature),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The name for "Hi …," (2026-10-27, the owner: "what if it's a husband and
 * wife"). One person: their first name. A couple, "Jane and Tom" or
 * "Jane & Tom Smith": both first names, the shared surname dropped.
 */
export function greetingName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  if (/\s(&|and|\+)\s/i.test(n)) {
    const [a, b] = n.split(/\s+(?:&|and|\+)\s+/i);
    const first = (a ?? "").split(/\s+/)[0];
    const second = (b ?? "").split(/\s+/)[0];
    return second ? `${first} and ${second}` : first;
  }
  return n.split(/\s+/)[0];
}
