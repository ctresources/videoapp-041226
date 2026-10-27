import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { greetingName, videoEmailAsHtml, videoEmailAsText } from "@/lib/utils/newsletter-html";
import { emailPosterFor } from "@/lib/video/email-poster";
import { sendAgentEmailViaSparkReels } from "@/lib/email";
import { isHeygenUrl } from "@/lib/utils/video-url";

export const maxDuration = 60;

/** Personal emails, not a campaign: a list needs unsubscribe handling the BoldTrail API doesn't give. */
const MAX_PER_SEND = 10;

/**
 * Sends a My Sparks video to up to ten chosen BoldTrail contacts (2026-10-15).
 * Only from the agent's own press of "Send now" after a confirmation.
 *
 * POST { videoId, subject, note, contacts: [{ id, name, email }] }
 *
 * Each person gets their own email, with {first name} filled in, from the
 * agent's BoldTrail address, logged on their contact. The send is recorded,
 * which is also where the quick picks come from next time.
 */
type Contact = { id?: string; name: string; email: string };
/** Emails SparkReels sends for one agent in a day, when they have no BoldTrail. */
const SPARKREELS_PER_DAY = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { videoId?: string; subject?: string; note?: string; contacts?: Contact[]; copyMe?: boolean };
  const subject = (body.subject ?? "").trim().slice(0, 150);
  const note = (body.note ?? "").trim().slice(0, 3000);
  const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const contacts = (Array.isArray(body.contacts) ? body.contacts : [])
    .map((c) => ({
      id: c?.id && /^[\w-]+$/.test(String(c.id)) ? String(c.id) : undefined,
      name: String(c?.name ?? "").slice(0, 120),
      email: String(c?.email ?? "").trim().slice(0, 200).toLowerCase(),
    }))
    .filter((c) => c.id || emailOk(c.email));
  if (!body.videoId || !subject || !note) return NextResponse.json({ error: "Add a subject and a note first." }, { status: 400 });
  if (!contacts.length) return NextResponse.json({ error: "Add at least one person." }, { status: 400 });
  if (contacts.length > MAX_PER_SEND) return NextResponse.json({ error: `Up to ${MAX_PER_SEND} people at a time.` }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, duration_seconds, email_poster_url, projects(thumbnail_url)")
    .eq("id", body.videoId)
    .eq("user_id", user.id)
    .maybeSingle();
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) return NextResponse.json({ error: "That video isn't ready to email." }, { status: 404 });
  const proj = (Array.isArray(video.projects) ? video.projects[0] : video.projects) as { thumbnail_url?: string | null } | null;

  const token = await loadBoldTrailToken(admin, user.id);
  const plain = contacts.filter((c) => !c.id || !token).length;
  if (plain > 0) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await admin.from("video_email_sends").select("sent_to").eq("user_id", user.id).gte("sent_at", since);
    const today = ((recent ?? []) as { sent_to: { via?: string; sent?: boolean }[] }[])
      .reduce((n, r) => n + (r.sent_to ?? []).filter((x) => x.via === "sparkreels" && x.sent).length, 0);
    if (today + plain > SPARKREELS_PER_DAY) {
      return NextResponse.json({ error: `Up to ${SPARKREELS_PER_DAY} emails a day without BoldTrail. Try the rest tomorrow.` }, { status: 429 });
    }
  }

  const signature = await loadAgentSignature(admin, user.id);
  const posterUrl = await emailPosterFor(admin, user.id,
    { id: video.id as string, video_url: url, duration_seconds: (video.duration_seconds as number | null) ?? null, email_poster_url: (video.email_poster_url as string | null) ?? null },
    proj?.thumbnail_url ?? null);
  const v = { url, posterUrl, seconds: video.duration_seconds as number | null };
  const replyTo = user.email ?? null;
  const results: (Contact & { sent: boolean; via: "boldtrail" | "sparkreels"; error?: string })[] = [];
  for (const c of contacts) {
    const first = greetingName(c.name);
    const html = videoEmailAsHtml({ subject, note, firstName: first, video: v, signature });
    // A BoldTrail contact goes through BoldTrail; someone typed in (not saved
    // to BoldTrail) is emailed by SparkReels (2026-10-27, the owner's ask).
    if (token && c.id) {
      const id = c.id;
      const r = await sendBoldTrailEmail(token, id, subject, html);
      results.push({ ...c, id, sent: r.ok, via: "boldtrail", ...(r.ok ? {} : { error: `BoldTrail said ${r.status}` }) });
      if (!r.ok) console.error("[video-email] send failed", id, r.status, r.text);
    } else {
      const text = videoEmailAsText({ note, firstName: first, video: v, signature });
      const ok = await sendAgentEmailViaSparkReels({ to: c.email, agentName: signature.name ?? null, replyTo, subject, html, text });
      results.push({ ...c, sent: ok, via: "sparkreels", ...(ok ? {} : { error: "Couldn't send it." }) });
    }
  }

  const sent = results.filter((r) => r.sent);
  // Send me a copy (2026-10-27, the owner's ask): one copy to the agent, so
  // they can see it went out and to whom.
  if (body.copyMe && sent.length && replyTo) {
    const who = sent.map((r) => r.name || r.email).join(", ");
    await sendAgentEmailViaSparkReels({
      to: replyTo, agentName: signature.name ?? null, replyTo,
      subject: `[Copy] ${subject}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555;margin:0 0 12px">Your copy. Sent to ${who.replace(/[<>&]/g, "")}.</p>` + videoEmailAsHtml({ subject, note, firstName: greetingName(sent[0]?.name), video: v, signature }),
      text: `Your copy. Sent to ${who}.\n\n` + videoEmailAsText({ note, firstName: greetingName(sent[0]?.name), video: v, signature }),
    }).catch(() => false);
  }
  if (sent.length) {
    await admin.from("video_email_sends").insert({
      user_id: user.id, video_id: body.videoId, subject, note, sent_to: results,
    });
  }
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: token ? "boldtrail" : "resend", endpoint: "video_email_send", credits_used: 0,
    response_status: sent.length === results.length ? 200 : sent.length ? 207 : 502,
  });
  if (!sent.length) return NextResponse.json({ error: results[0]?.error ?? "It didn't send. Try again.", results }, { status: 502 });
  return NextResponse.json({ sentAt: new Date().toISOString(), results });
}
