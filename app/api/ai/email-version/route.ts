import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { writeEmailVersion } from "@/lib/api/email-version";

// One model call, well under a minute.
export const maxDuration = 60;

/**
 * POST /api/ai/email-version
 *   { projectId, action: "write" }            writes the email from the blog article
 *   { projectId, action: "save_url", blogUrl } saves where the post lives, for the button
 *
 * Both land in the project's seo_data (email, email_blog_url), merged into
 * what is there, so the Share Kit card survives a reload and the images and
 * captions stored beside it are never overwritten.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, action, blogUrl } = (await req.json()) as {
    projectId?: string; action?: "write" | "save_url"; blogUrl?: string;
  };
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, ai_script, seo_data, location_city, location_state")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const seo = (project.seo_data ?? {}) as Record<string, unknown>;

  if (action === "save_url") {
    const url = (blogUrl ?? "").trim();
    if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) {
      return NextResponse.json({ error: "Enter the full link, starting with https://" }, { status: 400 });
    }
    const { error } = await admin.from("projects").update({ seo_data: { ...seo, email_blog_url: url } }).eq("id", projectId);
    if (error) return NextResponse.json({ error: "Couldn't save the link." }, { status: 500 });
    return NextResponse.json({ ok: true, blogUrl: url });
  }

  // Writing costs a model call, so it sits behind the same trial window as
  // writing the article itself.
  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const s = (project.ai_script ?? {}) as {
    blog_headline?: string; blog_intro?: string; blog_body?: string; blog_conclusion?: string;
  };
  const article = [s.blog_intro, s.blog_body, s.blog_conclusion]
    .filter(Boolean)
    .join("\n\n")
    .replace(/^H[23]:\s*/gm, "");
  if (article.trim().split(/\s+/).length < 80) {
    return NextResponse.json({ error: "Write the blog article first. The email is made from it." }, { status: 400 });
  }

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const market = [project.location_city, project.location_state].filter(Boolean).join(", ");
  const email = await writeEmailVersion({
    headline: s.blog_headline || project.title,
    article,
    agentName: (profile as { full_name?: string | null } | null)?.full_name,
    market: market || null,
  });
  if (!email) return NextResponse.json({ error: "Couldn't write the email. Please try again." }, { status: 502 });

  const { error } = await admin.from("projects").update({ seo_data: { ...seo, email } }).eq("id", projectId);
  if (error) console.error("[email-version] save failed:", error.message);
  return NextResponse.json({ email });
}
