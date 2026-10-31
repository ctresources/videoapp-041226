import { NextRequest, NextResponse } from "next/server";
import { staffLimits, STAFF_NO_EMAIL } from "@/lib/staff/staff";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { greetingName, reviewRequestAsHtml, reviewRequestAsText } from "@/lib/utils/newsletter-html";
import { isHeygenUrl } from "@/lib/utils/video-url";
import { emailPosterFor } from "@/lib/video/email-poster";
import { sendAgentEmailViaSparkReels } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_PER_SEND = 10;
/** Emails SparkReels sends for one agent in a day, when they have no BoldTrail. */
const SPARKREELS_PER_DAY = 30;

type Person = { id?: string; name: string; email: string };

/**
 * POST /api/review-request/send — Ask for Google Review Video Email (2026-10-27).
 *
 * { videoId, subject, note, people: [{ id?, name, email }], test? }
 *
 * test: one copy to the agent's own email, through SparkReels, to see it.
 * Otherwise each person gets their own email, first name filled in:
 *   - BoldTrail connected: from the agent's BoldTrail address; someone typed by
 *     email is added to their BoldTrail first (found by email if already there).
 *   - No BoldTrail: from "<Agent> via SparkReels", replies to the agent.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Staff without email access (Admin → Staff activity, 2026-10-30).
  if ((await staffLimits(user.id))?.emails === false) return NextResponse.json({ error: STAFF_NO_EMAIL, code: "staff_access" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { videoId?: string; subject?: string; note?: string; people?: Person[]; test?: boolean; copyMe?: boolean };
  const subject = (body.subject ?? "").trim().slice(0, 150);
  const note = (body.note ?? "").trim().slice(0, 3000);
  const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const people = (Array.isArray(body.people) ? body.people : [])
    .map((p) => ({
      id: p?.id && /^[\w-]+$/.test(String(p.id)) ? String(p.id) : undefined,
      name: String(p?.name ?? "").trim().slice(0, 120),
      email: String(p?.email ?? "").trim().slice(0, 200).toLowerCase(),
    }))
    .filter((p) => p.id || emailOk(p.email));
  if (!body.videoId) return NextResponse.json({ error: "Pick or make the video first." }, { status: 400 });
  if (!subject || !note) return NextResponse.json({ error: "Add a subject and a note first." }, { status: 400 });
  if (!body.test && !people.length) return NextResponse.json({ error: "Add at least one person." }, { status: 400 });
  if (people.length > MAX_PER_SEND) return NextResponse.json({ error: `Up to ${MAX_PER_SEND} people at a time.` }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: prof }, { data: video }] = await Promise.all([
    admin.from("profiles").select("google_review_url, email, full_name").eq("id", user.id).single(),
    admin.from("generated_videos").select("id, video_url, duration_seconds, email_poster_url, projects(thumbnail_url)").eq("id", body.videoId).eq("user_id", user.id).maybeSingle(),
  ]);
  const p = prof as { google_review_url: string | null; email: string | null; full_name: string | null } | null;
  const reviewUrl = p?.google_review_url?.trim() ?? "";
  if (!/^https:\/\//.test(reviewUrl)) return NextResponse.json({ error: "Add your Google review link in Settings first.", code: "no_review_url" }, { status: 400 });
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) return NextResponse.json({ error: "That video isn't ready to email yet." }, { status: 404 });

  // The thumbnail they made, with a play button; a still only without one.
  const seconds = (video.duration_seconds as number | null) ?? null;
  const proj = (Array.isArray(video.projects) ? video.projects[0] : video.projects) as { thumbnail_url?: string | null } | null;
  const posterUrl = await emailPosterFor(admin, user.id,
    { id: video.id as string, video_url: url, duration_seconds: seconds, email_poster_url: (video.email_poster_url as string | null) ?? null },
    proj?.thumbnail_url ?? null);
  const v = { url, posterUrl, seconds };
  const signature = await loadAgentSignature(admin, user.id);
  const agentName = signature.name || p?.full_name || null;
  const replyTo = user.email ?? p?.email ?? null;
  const build = (first: string) => ({
    html: reviewRequestAsHtml({ subject, note, firstName: first, video: v, reviewUrl, signature }),
    text: reviewRequestAsText({ note, firstName: first, video: v, reviewUrl, signature }),
  });

  if (body.test) {
    if (!replyTo) return NextResponse.json({ error: "Your account has no email to send the test to." }, { status: 400 });
    const first = (agentName ?? "").split(/\s+/)[0] ?? "";
    const m = build(first);
    const ok = await sendAgentEmailViaSparkReels({ to: replyTo, agentName, replyTo, subject: `[Test] ${subject}`, html: m.html, text: m.text });
    if (!ok) return NextResponse.json({ error: "Couldn't send the test. Try again." }, { status: 502 });
    return NextResponse.json({ test: true, to: replyTo });
  }

  const token = await loadBoldTrailToken(admin, user.id);
  const plain = people.filter((x) => !x.id || !token).length;
  if (plain > 0) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await admin.from("video_email_sends").select("sent_to").eq("user_id", user.id).eq("kind", "review").gte("sent_at", since);
    const today = ((recent ?? []) as { sent_to: { via?: string; sent?: boolean }[] }[])
      .reduce((n, r) => n + (r.sent_to ?? []).filter((x) => x.via === "sparkreels" && x.sent).length, 0);
    if (today + plain > SPARKREELS_PER_DAY) {
      return NextResponse.json({ error: `Up to ${SPARKREELS_PER_DAY} review emails a day without BoldTrail. Try the rest tomorrow.` }, { status: 429 });
    }
  }

  const results: (Person & { sent: boolean; via: "boldtrail" | "sparkreels"; error?: string })[] = [];
  for (const person of people) {
    const first = greetingName(person.name);
    const m = build(first);
    // A BoldTrail contact goes through BoldTrail; someone typed in (not saved
    // to BoldTrail) is emailed by SparkReels (2026-10-27, the owner's ask).
    if (token && person.id) {
      const id = person.id;
      const r = await sendBoldTrailEmail(token, id, subject, m.html);
      results.push({ ...person, id, sent: r.ok, via: "boldtrail", ...(r.ok ? {} : { error: `BoldTrail said ${r.status}` }) });
    } else {
      const ok = await sendAgentEmailViaSparkReels({ to: person.email, agentName, replyTo, subject, html: m.html, text: m.text });
      results.push({ ...person, sent: ok, via: "sparkreels", ...(ok ? {} : { error: "Couldn't send it." }) });
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
      html: `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555;margin:0 0 12px">Your copy. Sent to ${who.replace(/[<>&]/g, "")}.</p>` + build(greetingName(sent[0]?.name)).html,
      text: `Your copy. Sent to ${who}.\n\n` + build(greetingName(sent[0]?.name)).text,
    }).catch(() => false);
  }
  if (sent.length) {
    await admin.from("video_email_sends").insert({
      user_id: user.id, video_id: body.videoId, subject, note, sent_to: results, kind: "review",
    });
  }
  if (!sent.length) return NextResponse.json({ error: results[0]?.error ?? "It didn't send. Try again.", results }, { status: 502 });
  return NextResponse.json({ sentAt: new Date().toISOString(), results });
}
