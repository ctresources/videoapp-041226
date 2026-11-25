import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { greetingName, videoEmailAsHtml, videoEmailAsText } from "@/lib/utils/newsletter-html";
import { emailPosterFor } from "@/lib/video/email-poster";
import { sendAgentEmailViaSparkReels } from "@/lib/email";
import { isHeygenUrl } from "@/lib/utils/video-url";

/**
 * Email it: a My Sparks video to up to ten chosen people (2026-10-15).
 * Moved here from /api/video-email/send on 2026-11-25 so the AI follow-up
 * step sends exactly the same email (the owner's rule: existing app logic,
 * reused, never copied). The route and the agent both call sendVideoEmail.
 *
 * Each person gets their own email, with {first name} filled in. A BoldTrail
 * contact goes through the agent's BoldTrail and is logged on the contact;
 * someone typed in (not saved to BoldTrail) is emailed by SparkReels. The
 * send is recorded, which is also where the quick picks come from next time.
 */

/** Personal emails, not a campaign: a list needs unsubscribe handling the BoldTrail API doesn't give. */
export const VIDEO_EMAIL_MAX = 10;
/** Emails SparkReels sends for one agent in a day, when they have no BoldTrail. */
const SPARKREELS_PER_DAY = 30;

export type VideoEmailContact = { id?: string; name: string; email: string };
export type VideoEmailInput = {
  videoId?: string;
  subject?: string;
  note?: string;
  contacts?: VideoEmailContact[];
  copyMe?: boolean;
  reviewButton?: boolean;
};
export type VideoEmailResult = VideoEmailContact & { sent: boolean; via: "boldtrail" | "sparkreels"; error?: string };

/** Cleans the people list the same way for every caller. */
export function cleanVideoEmailContacts(raw: unknown): VideoEmailContact[] {
  const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  return (Array.isArray(raw) ? raw : [])
    .map((c: { id?: unknown; name?: unknown; email?: unknown }) => ({
      id: c?.id && /^[\w-]+$/.test(String(c.id)) ? String(c.id) : undefined,
      name: String(c?.name ?? "").slice(0, 120),
      email: String(c?.email ?? "").trim().slice(0, 200).toLowerCase(),
    }))
    .filter((c) => c.id || emailOk(c.email));
}

export async function sendVideoEmail(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
  input: VideoEmailInput,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const subject = (input.subject ?? "").trim().slice(0, 150);
  const note = (input.note ?? "").trim().slice(0, 3000);
  const contacts = cleanVideoEmailContacts(input.contacts);
  if (!input.videoId || !subject || !note) return { status: 400, body: { error: "Add a subject and a note first." } };
  if (!contacts.length) return { status: 400, body: { error: "Add at least one person." } };
  if (contacts.length > VIDEO_EMAIL_MAX) return { status: 400, body: { error: `Up to ${VIDEO_EMAIL_MAX} people at a time.` } };

  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, duration_seconds, email_poster_url, projects(thumbnail_url)")
    .eq("id", input.videoId)
    .eq("user_id", user.id)
    .maybeSingle();
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) return { status: 404, body: { error: "That video isn't ready to email." } };
  const proj = (Array.isArray(video.projects) ? video.projects[0] : video.projects) as { thumbnail_url?: string | null } | null;

  const token = await loadBoldTrailToken(admin, user.id);
  const plain = contacts.filter((c) => !c.id || !token).length;
  if (plain > 0) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await admin.from("video_email_sends").select("sent_to").eq("user_id", user.id).gte("sent_at", since);
    const today = ((recent ?? []) as { sent_to: { via?: string; sent?: boolean }[] }[])
      .reduce((n, r) => n + (r.sent_to ?? []).filter((x) => x.via === "sparkreels" && x.sent).length, 0);
    if (today + plain > SPARKREELS_PER_DAY) {
      return { status: 429, body: { error: `Up to ${SPARKREELS_PER_DAY} emails a day without BoldTrail. Try the rest tomorrow.` } };
    }
  }

  const signature = await loadAgentSignature(admin, user.id);
  /**
   * The Google review button (2026-10-29): Abby's review asks went out through
   * Email it, which had no button. The agent's own link from Settings, only
   * when asked for and only a real https address.
   */
  let reviewUrl: string | null = null;
  if (input.reviewButton) {
    const { data: prof } = await admin.from("profiles").select("google_review_url").eq("id", user.id).single();
    const r = ((prof as { google_review_url: string | null } | null)?.google_review_url ?? "").trim();
    if (r.startsWith("https://")) reviewUrl = r;
  }
  const posterUrl = await emailPosterFor(admin, user.id,
    { id: video.id as string, video_url: url, duration_seconds: (video.duration_seconds as number | null) ?? null, email_poster_url: (video.email_poster_url as string | null) ?? null },
    proj?.thumbnail_url ?? null);
  const v = { url, posterUrl, seconds: video.duration_seconds as number | null };
  const replyTo = user.email ?? null;
  const results: VideoEmailResult[] = [];
  for (const c of contacts) {
    const first = greetingName(c.name);
    const html = videoEmailAsHtml({ subject, note, firstName: first, video: v, signature, reviewUrl });
    // A BoldTrail contact goes through BoldTrail; someone typed in (not saved
    // to BoldTrail) is emailed by SparkReels (2026-10-27, the owner's ask).
    if (token && c.id) {
      const id = c.id;
      const r = await sendBoldTrailEmail(token, id, subject, html);
      results.push({ ...c, id, sent: r.ok, via: "boldtrail", ...(r.ok ? {} : { error: `BoldTrail said ${r.status}` }) });
      if (!r.ok) console.error("[video-email] send failed", id, r.status, r.text);
    } else {
      const text = videoEmailAsText({ note, firstName: first, video: v, signature, reviewUrl });
      const ok = await sendAgentEmailViaSparkReels({ to: c.email, agentName: signature.name ?? null, replyTo, subject, html, text });
      results.push({ ...c, sent: ok, via: "sparkreels", ...(ok ? {} : { error: "Couldn't send it." }) });
    }
  }

  const sent = results.filter((r) => r.sent);
  // Send me a copy (2026-10-27, the owner's ask): one copy to the agent, so
  // they can see it went out and to whom.
  if (input.copyMe && sent.length && replyTo) {
    const who = sent.map((r) => r.name || r.email).join(", ");
    await sendAgentEmailViaSparkReels({
      to: replyTo, agentName: signature.name ?? null, replyTo,
      subject: `[Copy] ${subject}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555;margin:0 0 12px">Your copy. Sent to ${who.replace(/[<>&]/g, "")}.</p>` + videoEmailAsHtml({ subject, note, firstName: greetingName(sent[0]?.name), video: v, signature, reviewUrl }),
      text: `Your copy. Sent to ${who}.\n\n` + videoEmailAsText({ note, firstName: greetingName(sent[0]?.name), video: v, signature, reviewUrl }),
    }).catch(() => false);
  }
  if (sent.length) {
    await admin.from("video_email_sends").insert({
      user_id: user.id, video_id: input.videoId, subject, note, sent_to: results,
    });
  }
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: token ? "boldtrail" : "resend", endpoint: "video_email_send", credits_used: 0,
    response_status: sent.length === results.length ? 200 : sent.length ? 207 : 502,
  });
  if (!sent.length) return { status: 502, body: { error: results[0]?.error ?? "It didn't send. Try again.", results } };
  return { status: 200, body: { sentAt: new Date().toISOString(), results } };
}
