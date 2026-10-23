import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { articleFaqs, blogAsHtml } from "@/lib/utils/blog-html";
import { slugify } from "@/lib/blog/posts";

export const dynamic = "force-dynamic";

/**
 * Publish an article to sparkreels.ai/blog (2026-10-22, the owner's ask).
 * Admins only: the Share Kit's "Publish to SparkReels blog" button.
 *
 *   GET    ?projectId=…                         → { post } or { post: null }
 *   POST   { projectId, slug?, title?, topic?, author? } → publish or update
 *   DELETE { projectId }                        → unpublish (the row stays)
 */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, full_name").eq("id", user.id).single();
  const p = profile as { role: string | null; full_name: string | null } | null;
  if (p?.role !== "admin") return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin, user, fullName: p.full_name };
}

function refresh(slug?: string) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/sitemap.xml");
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const { data } = await auth.admin
    .from("blog_posts")
    .select("slug, title, topic, author_name, published, published_at, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  return NextResponse.json({ post: data ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user, fullName } = auth;

  const body = (await req.json().catch(() => ({}))) as { projectId?: string; slug?: string; title?: string; topic?: string; author?: string };
  if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, title, ai_script")
    .eq("id", body.projectId)
    .single();
  const proj = project as { id: string; user_id: string; title: string | null; ai_script: Record<string, string | undefined> | null } | null;
  if (!proj || proj.user_id !== user.id) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const s = proj.ai_script ?? {};
  const intro = s.blog_intro ?? "";
  const articleBody = s.blog_body ?? "";
  const conclusion = s.blog_conclusion ?? "";
  if (!intro.trim() && !articleBody.trim()) {
    return NextResponse.json({ error: "There's no article to publish yet." }, { status: 400 });
  }

  const title = (body.title?.trim() || s.blog_headline?.trim() || proj.title?.trim() || "").slice(0, 200);
  if (!title) return NextResponse.json({ error: "Give the post a title." }, { status: 400 });
  const slug = slugify(body.slug?.trim() || title);

  // The page draws the title and cover itself, so the HTML is the article only.
  const bodyHtml = blogAsHtml({ intro, body: articleBody, conclusion });
  const firstPara = intro.split(/\n\s*\n/)[0]?.replace(/^H[23]:.*$/gm, "").replace(/\s+/g, " ").trim() ?? "";
  const description = firstPara.length > 160 ? `${firstPara.slice(0, 157).replace(/\s+\S*$/, "")}…` : firstPara;
  const words = `${intro} ${articleBody} ${conclusion}`.replace(/^H[23]:\s*/gm, "").split(/\s+/).filter(Boolean).length;

  // Another post already using this address?
  const { data: clash } = await admin.from("blog_posts").select("project_id").eq("slug", slug).maybeSingle();
  if (clash && (clash as { project_id: string | null }).project_id !== proj.id) {
    return NextResponse.json({ error: "Another post already uses that web address. Change it and try again." }, { status: 409 });
  }

  // Its latest finished video, if it has one, plays at the top of the post.
  const { data: video } = await admin
    .from("generated_videos")
    .select("video_url, duration_seconds")
    .eq("project_id", proj.id)
    .eq("render_status", "completed")
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const vid = video as { video_url: string | null; duration_seconds: number | null } | null;

  const { data: existing } = await admin.from("blog_posts").select("slug").eq("project_id", proj.id).maybeSingle();
  const row = {
    slug,
    title,
    description: description || null,
    topic: body.topic?.trim().slice(0, 40) || null,
    cover_url: s.blog_header_url?.startsWith("https://") ? s.blog_header_url : null,
    video_url: vid?.video_url?.startsWith("https://") ? vid.video_url : null,
    video_duration_seconds: vid?.duration_seconds ? Math.round(vid.duration_seconds) : null,
    header_video_url: s.blog_header_video_url?.startsWith("https://") ? s.blog_header_video_url : null,
    body_html: bodyHtml,
    faqs: articleFaqs(articleBody),
    author_name: body.author?.trim().slice(0, 80) || fullName?.trim() || null,
    word_count: words,
    published: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await admin.from("blog_posts").update(row).eq("project_id", proj.id)
    : await admin.from("blog_posts").insert({ ...row, project_id: proj.id, created_by: user.id });
  if (error) {
    console.error("[blog publish]", error.message);
    return NextResponse.json({ error: "Couldn't publish it. Try again." }, { status: 500 });
  }

  const oldSlug = (existing as { slug: string } | null)?.slug;
  refresh(slug);
  if (oldSlug && oldSlug !== slug) revalidatePath(`/blog/${oldSlug}`);
  return NextResponse.json({ ok: true, slug, url: `/blog/${slug}` });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const { data, error } = await auth.admin
    .from("blog_posts")
    .update({ published: false, updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .select("slug")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't unpublish it. Try again." }, { status: 500 });
  refresh((data as { slug: string } | null)?.slug);
  return NextResponse.json({ ok: true });
}
