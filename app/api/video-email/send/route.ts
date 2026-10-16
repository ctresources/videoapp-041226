import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { videoEmailAsHtml } from "@/lib/utils/newsletter-html";
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
type Contact = { id: string; name: string; email: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { videoId?: string; subject?: string; note?: string; contacts?: Contact[] };
  const subject = (body.subject ?? "").trim().slice(0, 150);
  const note = (body.note ?? "").trim().slice(0, 3000);
  const contacts = (Array.isArray(body.contacts) ? body.contacts : [])
    .filter((c) => c && c.id && /^[\w-]+$/.test(String(c.id)))
    .map((c) => ({ id: String(c.id), name: String(c.name ?? "").slice(0, 120), email: String(c.email ?? "").slice(0, 200) }));
  if (!body.videoId || !subject || !note) return NextResponse.json({ error: "Add a subject and a note first." }, { status: 400 });
  if (!contacts.length) return NextResponse.json({ error: "Add at least one person." }, { status: 400 });
  if (contacts.length > MAX_PER_SEND) return NextResponse.json({ error: `Up to ${MAX_PER_SEND} people at a time.` }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, duration_seconds, email_poster_url")
    .eq("id", body.videoId)
    .eq("user_id", user.id)
    .maybeSingle();
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) return NextResponse.json({ error: "That video isn't ready to email." }, { status: 404 });

  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  const signature = await loadAgentSignature(admin, user.id);
  const v = { url, posterUrl: video.email_poster_url as string | null, seconds: video.duration_seconds as number | null };
  const results: (Contact & { sent: boolean; error?: string })[] = [];
  for (const c of contacts) {
    const first = c.name.includes("@") ? "" : c.name.split(/\s+/)[0];
    const html = videoEmailAsHtml({ subject, note, firstName: first, video: v, signature });
    const r = await sendBoldTrailEmail(token, c.id, subject, html);
    results.push({ ...c, sent: r.ok, ...(r.ok ? {} : { error: `BoldTrail said ${r.status}` }) });
    if (!r.ok) console.error("[video-email] send failed", c.id, r.status, r.text);
  }

  const sent = results.filter((r) => r.sent);
  if (sent.length) {
    await admin.from("video_email_sends").insert({
      user_id: user.id, video_id: body.videoId, subject, note, sent_to: results,
    });
  }
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "boldtrail", endpoint: "video_email_send", credits_used: 0,
    response_status: sent.length === results.length ? 200 : sent.length ? 207 : 502,
  });
  if (!sent.length) return NextResponse.json({ error: "BoldTrail didn't send it. Check BoldTrail is still connected in Settings.", results }, { status: 502 });
  return NextResponse.json({ sentAt: new Date().toISOString(), results });
}
