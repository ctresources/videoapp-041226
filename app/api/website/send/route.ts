import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { blogAsHtml } from "@/lib/utils/blog-html";
import { fetchText } from "@/lib/halo/site-reader";
import { HALO_SIGNUP_PHONE } from "@/lib/halo/get-halo";
import { articlePlainText, cleanPostUrl, videoEmbedHtml, videoMarks, withVideo, youtubeLink } from "@/lib/website/send";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Send to Website (2026-10-31, the owner's spec).
 *
 * GET  ?projectId=…  what this Spark can send: the article as HTML (video under
 *                    the headline) and as text, the video's links, and for a
 *                    Halo agent their posts and the one the video came from.
 * POST { projectId, action: "halo", postUrl }  Halo was texted about this
 *                    post: remembered, so SparkReels can look for the video
 *                    on that page and say "✓ On your Halo post" once it's there.
 * POST { projectId, action: "posted", url }  the post's address on another
 *                    site, saved where the email version keeps it.
 *
 * Nothing here publishes. Halo is texted from the agent's own phone, and any
 * other site is pasted into by the agent.
 */

type Seo = Record<string, unknown> & {
  email_blog_url?: string;
  halo_sent?: { postUrl: string; at: string; marks: string[] };
  halo_on_post_at?: string;
};

async function owned(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from("projects")
    .select("id, title, created_at, seo_data, ai_script")
    .eq("id", projectId).eq("user_id", user.id).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "Spark not found." }, { status: 404 }) };
  return { user, admin, project: data as { id: string; title: string | null; created_at: string; seo_data: Seo | null; ai_script: Record<string, string | undefined> | null } };
}

/** The Spark's newest finished video and its YouTube id, if it went to YouTube. */
async function videoOf(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const { data: v } = await admin.from("generated_videos")
    .select("id, video_url").eq("project_id", projectId).eq("render_status", "completed").not("video_url", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const video = v as { id: string; video_url: string } | null;
  if (!video) return { videoUrl: null, youtubeId: null };
  const { data: p } = await admin.from("social_posts")
    .select("platform_post_id").eq("video_id", video.id).eq("platform", "youtube").not("platform_post_id", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { videoUrl: video.video_url, youtubeId: (p as { platform_post_id: string } | null)?.platform_post_id ?? null };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const o = await owned(projectId);
  if ("error" in o) return o.error;
  const { user, admin, project } = o;
  const ai = project.ai_script ?? {};
  const seo = project.seo_data ?? {};

  const [{ videoUrl, youtubeId }, sitesRes, draftRes, profRes] = await Promise.all([
    videoOf(admin, project.id),
    admin.from("halo_sites").select("id").eq("user_id", user.id).eq("is_affiliate", false),
    admin.from("autopilot_drafts").select("source_url, halo_page_id").eq("project_id", project.id).eq("source", "halo").not("source_url", "is", null).limit(1).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const title = (ai.blog_headline || ai.title || project.title || "").trim();
  const hasArticle = !!(ai.blog_intro?.trim() || ai.blog_body?.trim());
  const video = videoEmbedHtml({ youtubeId, videoUrl, title });
  // The same HTML as Copy as HTML, with the video under the headline.
  const articleHtml = hasArticle
    ? blogAsHtml({
        headline: ai.blog_headline || "", headerUrl: ai.blog_header_url || "",
        headerVideoUrl: ai.blog_header_video_url || "", headerVideoPosterUrl: ai.blog_header_video_poster || "",
        intro: ai.blog_intro || "", body: ai.blog_body || "", conclusion: ai.blog_conclusion || "",
      }, { author: (profRes.data as { full_name: string | null } | null)?.full_name ?? undefined, place: ai.location, date: project.created_at })
    : "";

  // Halo: their own sites' posts, newest first, and the post this Spark came from.
  const siteIds = ((sitesRes.data ?? []) as { id: string }[]).map((s) => s.id);
  let posts: { title: string; url: string }[] = [];
  if (siteIds.length) {
    const { data } = await admin.from("halo_pages").select("title, url").eq("user_id", user.id).in("site_id", siteIds)
      .order("first_seen_at", { ascending: false }).limit(60);
    posts = ((data ?? []) as { title: string | null; url: string }[]).map((p) => ({ title: (p.title || p.url).trim(), url: p.url }));
  }
  const fromDraft = draftRes.data as { source_url: string; halo_page_id: string | null } | null;
  const source = fromDraft ? posts.find((p) => p.url === fromDraft.source_url) ?? { title, url: fromDraft.source_url } : null;
  if (source && !posts.some((p) => p.url === source.url)) posts.unshift(source);

  // Sent to a Halo post before: is the video on that page yet? Only looked at
  // until it's found, and never more than one page per open.
  let onHaloAt = seo.halo_on_post_at ?? null;
  if (seo.halo_sent && !onHaloAt && seo.halo_sent.marks?.length) {
    const page = await fetchText(seo.halo_sent.postUrl, 8000).catch(() => null);
    if (page?.ok && seo.halo_sent.marks.some((m) => page.text.includes(m))) {
      onHaloAt = new Date().toISOString();
      await admin.from("projects").update({ seo_data: { ...seo, halo_on_post_at: onHaloAt } }).eq("id", project.id);
    }
  }

  return NextResponse.json({
    title,
    hasArticle,
    hasVideo: !!videoUrl,
    html: withVideo(articleHtml, video),
    videoHtml: video,
    text: hasArticle ? articlePlainText([ai.blog_headline, ai.blog_intro, ai.blog_body, ai.blog_conclusion]) : "",
    youtubeUrl: youtubeLink(youtubeId),
    videoUrl,
    halo: siteIds.length ? { phone: HALO_SIGNUP_PHONE, posts, source } : null,
    haloSent: seo.halo_sent ? { postUrl: seo.halo_sent.postUrl, at: seo.halo_sent.at, onPostAt: onHaloAt } : null,
    postedUrl: typeof seo.email_blog_url === "string" ? seo.email_blog_url : "",
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; action?: string; postUrl?: string; url?: string };
  const o = await owned(String(body.projectId ?? ""));
  if ("error" in o) return o.error;
  const { admin, project } = o;
  const seo = project.seo_data ?? {};

  if (body.action === "halo") {
    const postUrl = cleanPostUrl(String(body.postUrl ?? ""));
    if (!postUrl) return NextResponse.json({ error: "Pick the post first." }, { status: 400 });
    const { videoUrl, youtubeId } = await videoOf(admin, project.id);
    const next: Seo = { ...seo, halo_sent: { postUrl, at: new Date().toISOString(), marks: videoMarks(youtubeId, videoUrl) } };
    delete next.halo_on_post_at;
    await admin.from("projects").update({ seo_data: next }).eq("id", project.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "posted") {
    const raw = String(body.url ?? "").trim();
    const url = raw ? cleanPostUrl(raw) : "";
    if (url === null) return NextResponse.json({ error: "That isn't a web address." }, { status: 400 });
    await admin.from("projects").update({ seo_data: { ...seo, email_blog_url: url } }).eq("id", project.id);
    return NextResponse.json({ ok: true, url });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
