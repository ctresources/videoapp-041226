/**
 * Send to Website (2026-10-31, the owner's spec): the words that go to a
 * website. Pure functions, shared by the sheet, its API and the check script
 * (scripts/check-send-to-website.mjs).
 *
 * Nothing here publishes anything. Halo gets a text the agent sends from their
 * own phone; any other website gets HTML the agent pastes in themselves.
 */

/** "https://youtu.be/<id>" for a YouTube video id, or null. */
export function youtubeLink(id: string | null | undefined): string | null {
  const v = (id ?? "").trim();
  return /^[\w-]{6,20}$/.test(v) ? `https://youtu.be/${v}` : null;
}

/**
 * Add the video to a post Halo already has. The video wording is exactly
 * AutoSparks' Put on my Halo post message, which Halo already understands.
 */
export function haloUpdateMessage(o: { title: string; postUrl: string; link?: string | null }): string {
  const link = o.link?.trim();
  return link
    ? `Halo, add this video to the top of my post "${o.title}" (${o.postUrl}): ${link}`
    : `Halo, update my post "${o.title}" (${o.postUrl}) with this new version of the article. Here it is:`;
}

/** A new post on the agent's Halo site; the article is pasted in after it. */
export function haloNewMessage(o: { title: string; link?: string | null; hasArticle: boolean }): string {
  const link = o.link?.trim();
  const video = link ? ` with this video at the top: ${link}.` : ".";
  return o.hasArticle
    ? `Halo, create a new blog post titled "${o.title}"${video} Here's the article:`
    : `Halo, create a new blog post titled "${o.title}"${video}`;
}

/** An sms: link to Halo with the message filled in. */
export function haloSmsHref(phone: string, message: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(message)}`;
}

/** The article as plain text: the H2:/H3: heading markers taken off. */
export function articlePlainText(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p?.trim()).map((p) => p.replace(/^H[23]:\s*/gm, "")).join("\n\n");
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The video as HTML for a website: YouTube's player, else the file itself. */
export function videoEmbedHtml(o: { youtubeId?: string | null; videoUrl?: string | null; title?: string }): string {
  const id = (o.youtubeId ?? "").trim();
  if (/^[\w-]{6,20}$/.test(id)) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0"><iframe src="https://www.youtube.com/embed/${id}" title="${attr(o.title ?? "Video")}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  const url = (o.videoUrl ?? "").trim();
  if (url.startsWith("https://")) return `<video controls playsinline preload="metadata" style="width:100%;height:auto" src="${attr(url)}"></video>`;
  return "";
}

/** The article's HTML with the video right under its headline (or first, with no headline). */
export function withVideo(articleHtml: string, video: string): string {
  if (!video) return articleHtml;
  if (!articleHtml.trim()) return video;
  const at = articleHtml.indexOf("</h1>");
  return at < 0 ? `${video}\n${articleHtml}` : `${articleHtml.slice(0, at + 5)}\n${video}${articleHtml.slice(at + 5)}`;
}

/** What to look for on a page to know the video is on it: the YouTube id, or the file's name. */
export function videoMarks(youtubeId?: string | null, videoUrl?: string | null): string[] {
  return [youtubeId ?? "", (videoUrl ?? "").split("?")[0].split("/").pop() ?? ""].filter((m) => m.length >= 8);
}

/** A web address the agent pasted, or null if it isn't one. */
export function cleanPostUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch { return null; }
}
