import { createAdminClient } from "@/lib/supabase/admin";
import { generateSeoData } from "@/lib/api/perplexity";
import { generateBlogFromScript } from "@/lib/api/blog-writer";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { spokenWords } from "@/lib/content/spoken";
import { fromResponse, type ServiceResult } from "@/lib/content/service-result";

/**
 * Writes what the Share Kit shows for a video from the words spoken in it:
 * the LinkedIn and Facebook posts, Instagram caption, YouTube title and
 * description, and the blog. Works for a scripted video and for an uploaded
 * clip. Fills gaps only; anything already written is kept unless `force`.
 *
 * The shared service behind POST /api/ai/share-kit and the agent layer's
 * make_social_copy (2026-11-22). Moved out of the route unchanged.
 */
export async function writeShareKit(
  userId: string,
  { projectId, force, auto }: { projectId?: string; force?: boolean; auto?: boolean },
): Promise<ServiceResult> {
  // `auto` must never spend a new account's free try (same rule as the blog).
  const gate = await freeTrialGateResponse(userId, auto ? { preVideo: "block" } : undefined);
  if (gate) return fromResponse(gate);
  if (!projectId) return { status: 400, body: { error: "projectId is required" } };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("projects")
    .select("id, title, ai_script, seo_data, location_city, location_state")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  const project = row as {
    id: string;
    title: string | null;
    ai_script: Record<string, unknown> | null;
    seo_data: Record<string, unknown> | null;
    location_city: string | null;
    location_state: string | null;
  } | null;
  if (!project) return { status: 404, body: { error: "Project not found" } };

  const script = (project.ai_script ?? {}) as Record<string, unknown>;
  const seoExisting = (project.seo_data ?? {}) as Record<string, unknown>;

  // The words: the script if there is one, otherwise what the video says.
  const spoken = await spokenWords(admin, userId, projectId, script);
  // Posts need a little text; the blog needs a real article's worth (below).
  if (spoken.length < 40) {
    return { status: 422, body: { error: "There aren't enough words in this video yet to write the posts from." } };
  }

  const socialMissing = force
    || !seoExisting.linkedin_post || !seoExisting.facebook_post || !seoExisting.instagram_caption;
  const blogMissing = (force || !String(script.blog_body ?? "").trim()) && spoken.length >= 200;

  const title = String(script.title ?? project.title ?? "").trim();
  const keywords = Array.isArray(script.keywords) ? (script.keywords as string[]) : [];

  const { data: profileRow } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
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
  // isn't overwritten by a regenerate they didn't ask for.
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
    const { error } = await admin.from("projects").update(update).eq("id", projectId).eq("user_id", userId);
    if (error) console.error("[share-kit] save failed:", error.message);
  }

  const blog = blogNew
    ? { headline: blogNew.headline ?? undefined, intro: blogNew.intro, body: blogNew.body, conclusion: blogNew.conclusion }
    : String(script.blog_body ?? "").trim()
      ? { headline: String(script.blog_headline ?? "") || undefined, intro: String(script.blog_intro ?? ""), body: String(script.blog_body ?? ""), conclusion: String(script.blog_conclusion ?? "") }
      : null;

  return { status: 200, body: { seo, blog, wrote: { social: !!seoNew, blog: !!blogNew } } };
}
