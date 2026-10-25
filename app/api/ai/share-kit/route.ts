import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSeoData } from "@/lib/api/perplexity";
import { generateBlogFromScript } from "@/lib/api/blog-writer";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { ensureVideoSrt } from "@/lib/utils/video-srt";
import { parseSrt, srtToPlainText } from "@/lib/utils/srt";

/**
 * POST /api/ai/share-kit — { projectId, force? }
 *
 * Writes what the Share Kit shows for a video from the words spoken in it
 * (2026-10-25, the owner's ask): the LinkedIn and Facebook posts, Instagram
 * caption, YouTube title and description, and the blog. Works for a scripted
 * video and for an uploaded clip, whose words come from its transcript. Fills
 * gaps only; anything already written is kept unless `force` is set.
 *
 * Refuses with 422 when there are too few words to write from, rather than
 * inventing copy from nothing.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, force, auto } = (await req.json().catch(() => ({}))) as { projectId?: string; force?: boolean; auto?: boolean };

  // `auto` is the Share Kit writing on arrival with nobody asking, so it must
  // never spend a new account's free try (same rule as /api/ai/blog).
  const gate = await freeTrialGateResponse(user.id, auto ? { preVideo: "block" } : undefined);
  if (gate) return gate;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("projects")
    .select("id, title, ai_script, seo_data, location_city, location_state")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  const project = row as {
    id: string;
    title: string | null;
    ai_script: Record<string, unknown> | null;
    seo_data: Record<string, unknown> | null;
    location_city: string | null;
    location_state: string | null;
  } | null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const script = (project.ai_script ?? {}) as Record<string, unknown>;
  const seoExisting = (project.seo_data ?? {}) as Record<string, unknown>;

  // The words: the script if there is one, otherwise what the video says.
  let spoken = String(script.script ?? "").trim();
  if (spoken.length < 200) {
    const { data: vid } = await admin
      .from("generated_videos")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("render_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const videoId = (vid as { id: string } | null)?.id;
    if (videoId) {
      const srt = await ensureVideoSrt(admin, user.id, videoId);
      if (srt.ok) spoken = srtToPlainText(parseSrt(srt.srt)).trim();
    }
  }
  if (spoken.length < 200) {
    return NextResponse.json(
      { error: "There aren't enough spoken words in this video yet to write the posts from." },
      { status: 422 },
    );
  }

  const socialMissing = force
    || !seoExisting.linkedin_post || !seoExisting.facebook_post || !seoExisting.instagram_caption;
  const blogMissing = force || !String(script.blog_body ?? "").trim();

  const title = String(script.title ?? project.title ?? "").trim();
  const keywords = Array.isArray(script.keywords) ? (script.keywords as string[]) : [];

  const { data: profileRow } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const agentName = (profileRow as { full_name: string | null } | null)?.full_name ?? null;

  const [seoNew, blogNew] = await Promise.all([
    socialMissing
      ? generateSeoData(title, spoken, keywords).catch((e) => { console.warn("[share-kit] social copy failed:", e); return null; })
      : Promise.resolve(null),
    blogMissing
      ? generateBlogFromScript({
          title,
          script: spoken,
          city: project.location_city,
          state: project.location_state,
          agentName,
          unbranded: script.cta === "",
          audience: typeof script.audience === "string" ? script.audience : null,
          tone: typeof script.tone === "string" ? script.tone : null,
          purpose: typeof script.purpose === "string" ? script.purpose : null,
        }).catch((e) => { console.warn("[share-kit] blog failed:", e); return null; })
      : Promise.resolve(null),
  ]);

  // Existing wording wins over the new, unless force: a line someone edited
  // is not overwritten by a regenerate they did not ask for.
  let seo: Record<string, unknown> = seoExisting;
  if (seoNew) {
    const fresh = seoNew as unknown as Record<string, unknown>;
    seo = { ...seoExisting, ...fresh };
    if (!force) {
      for (const [k, v] of Object.entries(seoExisting)) {
        if (v !== null && v !== undefined && String(v).trim() !== "") seo[k] = v;
      }
    }
  }

  if (seoNew || blogNew) {
    const update: Record<string, unknown> = {};
    if (seoNew) update.seo_data = seo;
    if (blogNew) {
      update.ai_script = {
        ...script,
        blog_headline: blogNew.headline ?? "",
        blog_intro: blogNew.intro,
        blog_body: blogNew.body,
        blog_conclusion: blogNew.conclusion,
      };
    }
    const { error } = await admin.from("projects").update(update).eq("id", projectId).eq("user_id", user.id);
    if (error) console.error("[share-kit] save failed:", error.message);
  }

  const blog = blogNew
    ? { headline: blogNew.headline ?? undefined, intro: blogNew.intro, body: blogNew.body, conclusion: blogNew.conclusion }
    : String(script.blog_body ?? "").trim()
      ? { headline: String(script.blog_headline ?? "") || undefined, intro: String(script.blog_intro ?? ""), body: String(script.blog_body ?? ""), conclusion: String(script.blog_conclusion ?? "") }
      : null;

  return NextResponse.json({ seo, blog, wrote: { social: !!seoNew, blog: !!blogNew } });
}
