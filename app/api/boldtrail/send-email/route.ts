import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { firstNameOf, personalGreeting } from "@/lib/api/boldtrail-picks";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { emailAsHtml, type EmailVersion } from "@/lib/utils/email-html";
import { newsletterAsHtml, type Newsletter } from "@/lib/utils/newsletter-html";
import { articleHeadline } from "@/lib/utils/article-headline";

export const maxDuration = 60;

/** Personal emails, not a campaign: a list needs unsubscribe handling the BoldTrail API doesn't give. */
const MAX_PER_SEND = 10;

/**
 * A blog post's email, or a newsletter, sent to up to ten chosen BoldTrail
 * contacts (2026-10-15, the owner's pick: the short version with Read more).
 * Only from the agent's own press of "Send now" after a confirmation.
 *
 *   { kind: "blog", projectId, subjectIdx, contacts }
 *       the post's saved email version, built here as the Share Kit shows it
 *   { kind: "newsletter", projectIds, newsletter, urls, subjectIdx, contacts }
 *       the newsletter on screen (it isn't saved), checked and built here
 *
 * Every Read more must have somewhere to go: a blog email needs the post's
 * link, a newsletter needs every post's. "Hi there," becomes each person's
 * first name. Each send is recorded with the video emails.
 */

type Contact = { id: string; name: string; email: string };
const isUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+\.\S+/i.test(u.trim());
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const contacts: Contact[] = (Array.isArray(body.contacts) ? body.contacts : [])
    .filter((c): c is Contact => !!c && typeof c === "object" && /^[\w-]+$/.test(String((c as Contact).id)))
    .map((c) => ({ id: String(c.id), name: str(c.name, 120), email: str(c.email, 200) }));
  if (!contacts.length) return NextResponse.json({ error: "Add at least one person." }, { status: 400 });
  if (contacts.length > MAX_PER_SEND) return NextResponse.json({ error: `Up to ${MAX_PER_SEND} people at a time.` }, { status: 400 });

  const admin = createAdminClient();
  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });
  const signature = await loadAgentSignature(admin, user.id);

  let subject = "";
  let projectIds: string[] = [];
  let build: (firstName: string) => string;

  if (body.kind === "blog") {
    const projectId = str(body.projectId, 64);
    const { data: project } = await admin
      .from("projects")
      .select("id, title, ai_script, seo_data")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const seo = (project.seo_data ?? {}) as { email?: EmailVersion; email_blog_url?: string; youtube_title?: string; meta_title?: string };
    const ai = (project.ai_script ?? {}) as { blog_headline?: string; title?: string; blog_header_url?: string };
    const email = seo.email;
    if (!email?.subjects?.length) return NextResponse.json({ error: "Write the email first." }, { status: 400 });
    if (!isUrl(seo.email_blog_url)) return NextResponse.json({ error: "Paste the post's web address first, so Read more has somewhere to go." }, { status: 400 });
    subject = email.subjects[Math.max(0, Math.min(Number(body.subjectIdx) || 0, email.subjects.length - 1))];
    projectIds = [project.id as string];
    const opts = { headline: articleHeadline(ai, seo, project.title as string), blogUrl: seo.email_blog_url!, headerUrl: ai.blog_header_url || "", signature };
    build = (first) => emailAsHtml({ ...email, greeting: personalGreeting(email.greeting, first) }, opts);
  } else if (body.kind === "newsletter") {
    const n = body.newsletter as Partial<Newsletter> | undefined;
    const ids = (Array.isArray(body.projectIds) ? body.projectIds : []).map((x) => String(x)).slice(0, 5);
    const urls = (body.urls && typeof body.urls === "object" ? body.urls : {}) as Record<string, unknown>;
    if (!n || !Array.isArray(n.subjects) || !Array.isArray(n.items) || !n.items.length) {
      return NextResponse.json({ error: "Write the newsletter first." }, { status: 400 });
    }
    const { data: owned } = await admin.from("projects").select("id").in("id", ids).eq("user_id", user.id);
    const ownedIds = new Set((owned ?? []).map((r) => r.id as string));
    const newsletter: Newsletter = {
      subjects: n.subjects.map((s) => str(s, 150)).filter(Boolean).slice(0, 3),
      preview: str(n.preview, 200),
      greeting: str(n.greeting, 80) || "Hi there,",
      opening: str(n.opening, 1200),
      items: n.items.slice(0, 5).map((it) => ({ projectId: str(it?.projectId, 64), title: str(it?.title, 200), teaser: str(it?.teaser, 600) })),
      closing: str(n.closing, 400),
      button: str(n.button, 40) || "Read more",
    };
    if (!newsletter.subjects.length || newsletter.items.some((it) => !ownedIds.has(it.projectId))) {
      return NextResponse.json({ error: "Write the newsletter again, then send." }, { status: 400 });
    }
    const cleanUrls: Record<string, string> = {};
    for (const it of newsletter.items) {
      const u = urls[it.projectId];
      if (!isUrl(u)) return NextResponse.json({ error: `Paste the web address for "${it.title}" first, so its Read more has somewhere to go.` }, { status: 400 });
      cleanUrls[it.projectId] = u.trim();
    }
    subject = newsletter.subjects[Math.max(0, Math.min(Number(body.subjectIdx) || 0, newsletter.subjects.length - 1))];
    projectIds = newsletter.items.map((it) => it.projectId);
    build = (first) => newsletterAsHtml({ ...newsletter, greeting: personalGreeting(newsletter.greeting, first) }, { subject, urls: cleanUrls, signature });
  } else {
    return NextResponse.json({ error: "Unknown email" }, { status: 400 });
  }

  const results: (Contact & { sent: boolean; error?: string })[] = [];
  for (const c of contacts) {
    const r = await sendBoldTrailEmail(token, c.id, subject, build(firstNameOf(c.name)));
    results.push({ ...c, sent: r.ok, ...(r.ok ? {} : { error: `BoldTrail said ${r.status}` }) });
    if (!r.ok) console.error(`[${String(body.kind)}-send] failed`, c.id, r.status, r.text);
  }

  const sent = results.filter((r) => r.sent);
  if (sent.length) {
    await admin.from("video_email_sends").insert({
      user_id: user.id, kind: body.kind, project_ids: projectIds, subject, sent_to: results,
    });
  }
  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "boldtrail", endpoint: `${String(body.kind)}_email_send`, credits_used: 0,
    response_status: sent.length === results.length ? 200 : sent.length ? 207 : 502,
  });
  if (!sent.length) return NextResponse.json({ error: "BoldTrail didn't send it. Check BoldTrail is still connected in Settings.", results }, { status: 502 });
  return NextResponse.json({ sentAt: new Date().toISOString(), results });
}
