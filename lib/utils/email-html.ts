import { formatPhone } from "@/lib/utils/format-phone";

/**
 * A blog post's email version, as HTML an email program will actually show.
 *
 * Email is not the web: Outlook ignores most CSS, Gmail strips <style>
 * blocks, and lists and divs render differently in every client. So this is
 * the old, dependable shape: nested tables, every style inline, a button
 * built from a table cell rather than a styled link alone, and a hidden
 * preview line at the top for the inbox snippet.
 *
 * The one copy, shared by Copy as HTML in the Share Kit and the test send, so
 * what an agent sees in their own inbox is exactly what they paste.
 */

export interface EmailVersion {
  subjects: string[];
  preview: string;
  greeting: string;
  opening: string;
  points: string[];
  closing: string;
  button: string;
}

export interface EmailSignature {
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  website?: string | null;
  headshotUrl?: string | null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#1e293b";
const MUTED = "#64748b";

function websiteHref(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export function emailAsHtml(e: EmailVersion, opts: {
  headline: string;
  blogUrl: string;
  headerUrl?: string;
  signature: EmailSignature;
}): string {
  const url = opts.blogUrl.trim();
  const hasUrl = /^https?:\/\//i.test(url);
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${esc(text)}</p>`;

  const header = opts.headerUrl?.startsWith("https://")
    ? `<tr><td style="padding:0;">${hasUrl ? `<a href="${esc(url)}">` : ""}<img src="${esc(opts.headerUrl)}" width="600" alt="${esc(opts.headline)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">${hasUrl ? "</a>" : ""}</td></tr>`
    : "";

  // Bullets as table rows: <ul> indents differently in every client.
  const points = e.points.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${e.points
        .map((pt) => `<tr><td valign="top" style="padding:0 10px 10px 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">&#8226;</td><td style="padding:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${esc(pt)}</td></tr>`)
        .join("")}</table>`
    : "";

  const button = hasUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td bgcolor="${INK}" style="border-radius:8px;"><a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(e.button)}</a></td></tr></table>`
    : "";

  const s = opts.signature;
  const sigLines = [
    s.name ? `<strong style="color:${INK};">${esc(s.name)}</strong>` : "",
    s.company ? esc(s.company) : "",
    s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}" style="color:${MUTED};text-decoration:none;">${esc(formatPhone(s.phone) || s.phone)}</a>` : "",
    s.website ? `<a href="${esc(websiteHref(s.website))}" style="color:${MUTED};">${esc(s.website.replace(/^https?:\/\//i, "").replace(/\/+$/, ""))}</a>` : "",
  ].filter(Boolean).join("<br>");
  const headshot = s.headshotUrl?.startsWith("https://")
    ? `<td valign="top" style="padding:16px 14px 0 0;"><img src="${esc(s.headshotUrl)}" width="64" height="64" alt="${esc(s.name || "")}" style="display:block;width:64px;height:64px;border-radius:32px;border:0;"></td>`
    : "";
  const signature = sigLines
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;border-top:1px solid #e2e8f0;padding-top:16px;width:100%;"><tr>${headshot}<td valign="top" style="padding-top:16px;font-family:${FONT};font-size:14px;line-height:1.5;color:${MUTED};">${sigLines}</td></tr></table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(e.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
${header}
<tr><td style="padding:28px 24px 24px;">
${header ? "" : `<h1 style="margin:0 0 20px;font-family:${FONT};font-size:24px;line-height:1.3;color:${INK};">${esc(opts.headline)}</h1>`}
${p(e.greeting)}
${p(e.opening)}
${points}
${p(e.closing)}
${button}
${signature}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The same email as plain text, for tools and inboxes that take no HTML. */
export function emailAsText(e: EmailVersion, opts: { headline: string; blogUrl: string; signature: EmailSignature }): string {
  const s = { ...opts.signature, phone: opts.signature.phone ? formatPhone(opts.signature.phone) || opts.signature.phone : null };
  return [
    opts.headline,
    "",
    e.greeting,
    "",
    e.opening,
    "",
    ...e.points.map((pt) => `- ${pt}`),
    "",
    e.closing,
    ...(opts.blogUrl.trim() ? ["", `${e.button}: ${opts.blogUrl.trim()}`] : []),
    "",
    ...[s.name, s.company, s.phone, s.website].filter((x): x is string => !!x?.trim()),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
