import { createAdminClient } from "@/lib/supabase/admin";
import { generateBlogFromScript } from "@/lib/api/blog-writer";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { spokenWords } from "@/lib/content/spoken";
import { fromResponse, type ServiceResult } from "@/lib/content/service-result";

/**
 * Writes the blog article for a project from whatever script it has, whoever
 * wrote it and however the video was made.
 *
 * The shared service behind POST /api/ai/blog and the agent layer's
 * make_blog (2026-11-22). Moved out of the route unchanged: same free-trial
 * gate, same reuse of an existing article, same refusals, same saved fields.
 *
 * `auto` is the Share Kit writing on arrival with nobody having pressed
 * anything. It must never spend a new account's free try, so it's refused
 * outright there ("block"). Everyone else is gated as before.
 */
export async function writeBlog(
  userId: string,
  { projectId, force, auto }: { projectId?: string; force?: boolean; auto?: boolean },
): Promise<ServiceResult> {
  const gate = await freeTrialGateResponse(userId, auto ? { preVideo: "block" } : undefined);
  if (gate) return fromResponse(gate);

  if (!projectId) return { status: 400, body: { error: "projectId is required" } };

  const admin = createAdminClient();
  const { data: projectRow } = await admin
    .from("projects")
    .select("id, user_id, title, ai_script, location_city, location_state")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  const project = projectRow as {
    id: string;
    title: string | null;
    ai_script: Record<string, unknown> | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!project) return { status: 404, body: { error: "Project not found" } };

  const script = (project.ai_script ?? {}) as Record<string, unknown>;

  // Already written, and not asked to redo it: returned rather than
  // regenerated, so opening the Share Kit twice doesn't cost two calls.
  const existingBody = String(script.blog_body ?? "");
  if (existingBody && !force) {
    return {
      status: 200,
      body: {
        blog: {
          // Undefined rather than "" for articles written before headlines
          // existed, so the caller falls back to the video's title.
          headline: String(script.blog_headline ?? "") || undefined,
          intro: String(script.blog_intro ?? ""),
          body: existingBody,
          conclusion: String(script.blog_conclusion ?? ""),
        },
        reused: true,
      },
    };
  }

  const spoken = await spokenWords(admin, userId, projectId, script);
  if (spoken.length < 200) {
    // Said plainly rather than returning an empty blog: an article invented
    // from three sentences is worse than none.
    return { status: 422, body: { error: "There aren't enough words in this video yet to write an article from." } };
  }

  const { data: profileRow } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();

  const article = await generateBlogFromScript({
    title: String(script.title ?? project.title ?? "").trim(),
    script: spoken,
    city: project.location_city,
    state: project.location_state,
    agentName: (profileRow as { full_name: string | null } | null)?.full_name ?? null,
    // The unbranded cut's own rule follows the script it was written for.
    unbranded: script.cta === "",
    // Saved by generate-location-script; absent on routes that never asked.
    audience: typeof script.audience === "string" ? script.audience : null,
    tone: typeof script.tone === "string" ? script.tone : null,
    purpose: typeof script.purpose === "string" ? script.purpose : null,
  });

  if (!article) {
    return { status: 502, body: { error: "Couldn't write the article just now. Try again in a moment." } };
  }

  // Merged into ai_script rather than replacing it: this service owns four
  // fields of it. Headline written even when empty, so a regenerate clears
  // the previous one.
  const { error: updateErr } = await admin
    .from("projects")
    .update({
      ai_script: {
        ...script,
        blog_headline: article.headline ?? "",
        blog_intro: article.intro,
        blog_body: article.body,
        blog_conclusion: article.conclusion,
      },
    })
    .eq("id", projectId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[ai/blog] save failed:", updateErr.message);
    // The article exists and the caller can still use it.
    return { status: 200, body: { blog: article, saved: false } };
  }

  return { status: 200, body: { blog: article, saved: true } };
}
