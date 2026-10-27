import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact, loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { greetingName, reviewRequestAsHtml, reviewRequestAsText } from "@/lib/utils/newsletter-html";
import { isHeygenUrl } from "@/lib/utils/video-url";
import { saveEmailPoster } from "@/lib/video/email-poster";
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

  const body = (await req.json().catch(() => ({}))) as { videoId?: string; subject?: string; note?: string; people?: Person[]; test?: boolean };
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
    admin.from("generated_videos").select("id, video_url, duration_seconds, email_poster_url").eq("id", body.videoId).eq("user_id", user.id).maybeSingle(),
  ]);
  const p = prof as { google_review_url: string | null; email: string | null; full_name: string | null } | null;
  const reviewUrl = p?.google_review_url?.trim() ?? "";
  if (!/^https:\/\//.test(reviewUrl)) return NextResponse.json({ error: "Add your Google review link in Settings first.", code: "no_review_url" }, { status: 400 });
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) return NextResponse.json({ error: "That video isn't ready to email yet." }, { status: 404 });

  // The still with a play button, made once and kept on the video.
  let posterUrl = (video.email_poster_url as string | null) ?? null;
  const seconds = (video.duration_seconds as number | null) ?? null;
  if (!posterUrl) {
    posterUrl = await saveEmailPoster(admin, user.id, video.id as string, url, seconds, "video_email");
    if (posterUrl) await admin.from("generated_videos").update({ email_poster_url: posterUrl }).eq("id", video.id);
  }
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
  if (!token) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await admin.from("video_email_sends").select("sent_to").eq("user_id", user.id).eq("kind", "review").gte("sent_at", since);
    const today = ((recent ?? []) as { sent_to: { via?: string; sent?: boolean }[] }[])
      .reduce((n, r) => n + (r.sent_to ?? []).filter((x) => x.via === "sparkreels" && x.sent).length, 0);
    if (today + people.length > SPARKREELS_PER_DAY) {
      return NextResponse.json({ error: `Up to ${SPARKREELS_PER_DAY} review emails a day without BoldTrail. Try the rest tomorrow.` }, { status: 429 });
    }
  }

  const results: (Person & { sent: boolean; via: "boldtrail" | "sparkreels"; error?: string })[] = [];
  for (const person of people) {
    const first = greetingName(person.name);
    const m = build(first);
    if (token) {
      let id = person.id;
      if (!id) {
        const [fn, ...rest] = (person.name || "").split(/\s+/);
        const made = await findOrCreateContact(token, { email: person.email, firstName: fn || "", lastName: rest.join(" ") });
        id = made.contact?.id;
        if (!id) { results.push({ ...person, sent: false, via: "boldtrail", error: made.error || "Couldn't add them to BoldTrail." }); continue; }
      }
      const r = await sendBoldTrailEmail(token, id, subject, m.html);
      results.push({ ...person, id, sent: r.ok, via: "boldtrail", ...(r.ok ? {} : { error: `BoldTrail said ${r.status}` }) });
    } else {
      const ok = await sendAgentEmailViaSparkReels({ to: person.email, agentName, replyTo, subject, html: m.html, text: m.text });
      results.push({ ...person, sent: ok, via: "sparkreels", ...(ok ? {} : { error: "Couldn't send it." }) });
    }
  }

  const sent = results.filter((r) => r.sent);
  if (sent.length) {
    await admin.from("video_email_sends").insert({
      user_id: user.id, video_id: body.videoId, subject, note, sent_to: results, kind: "review",
    });
  }
  if (!sent.length) return NextResponse.json({ error: results[0]?.error ?? "It didn't send. Try again.", results }, { status: 502 });
  return NextResponse.json({ sentAt: new Date().toISOString(), results, via: token ? "boldtrail" : "sparkreels" });
}
