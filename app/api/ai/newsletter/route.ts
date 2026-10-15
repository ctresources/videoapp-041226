import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { writeNewsletter } from "@/lib/api/newsletter";
import { loadAgentSignature } from "@/lib/utils/agent-signature";

// One model call, well under a minute.
export const maxDuration = 60;

const MIN_POSTS = 2;
const MAX_POSTS = 5;

/**
 * POST /api/ai/newsletter (2026-10-15)
 *   { projectIds, action: "load" }   the picked posts (title, saved link) and the sign-off
 *   { projectIds, action: "write" }  writes the newsletter from them
 *
 * Nothing is saved but each post's link, which goes through the email
 * version's save_url (projects.seo_data.email_blog_url), so a link typed here
 * is the same one the post's own email uses.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectIds, action } = (await req.json()) as { projectIds?: string[]; action?: "load" | "write" };
  const ids = Array.from(new Set((projectIds ?? []).filter((x) => typeof x === "string"))).slice(0, MAX_POSTS);
  if (ids.length < MIN_POSTS) {
    return NextResponse.json({ error: `Pick ${MIN_POSTS} to ${MAX_POSTS} blog posts.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("projects")
    .select("id, title, ai_script, seo_data, location_city, location_state")
    .in("id", ids)
    .eq("user_id", user.id);
  // In the order they were picked, and only the ones with an article.
  const posts = ids
    .map((id) => (rows ?? []).find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => {
      const s = (r.ai_script ?? {}) as { blog_headline?: string; blog_intro?: string; blog_body?: string; blog_conclusion?: string };
      const article = [s.blog_intro, s.blog_body, s.blog_conclusion].filter(Boolean).join("\n\n").replace(/^H[23]:\s*/gm, "");
      const seo = (r.seo_data ?? {}) as { email_blog_url?: string };
      return {
        id: r.id as string,
        headline: s.blog_headline || (r.title as string) || "Untitled post",
        article,
        url: seo.email_blog_url ?? "",
        market: [r.location_city, r.location_state].filter(Boolean).join(", "),
      };
    })
    .filter((p) => p.article.trim().split(/\s+/).length >= 80);
  if (posts.length < MIN_POSTS) {
    return NextResponse.json({ error: `Pick ${MIN_POSTS} to ${MAX_POSTS} blog posts that have an article.` }, { status: 400 });
  }

  const signature = await loadAgentSignature(admin, user.id);
  const postsOut = posts.map(({ id, headline, url }) => ({ id, title: headline, url }));

  if (action !== "write") return NextResponse.json({ posts: postsOut, signature });

  // Writing costs a model call, so it sits behind the same trial window as
  // the single post's email version.
  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const newsletter = await writeNewsletter({
    posts: posts.map(({ id, headline, article }) => ({ id, headline, article })),
    agentName: signature.name,
    market: posts.find((x) => x.market)?.market || null,
  });
  if (!newsletter) return NextResponse.json({ error: "Couldn't write the newsletter. Please try again." }, { status: 502 });

  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "perplexity", endpoint: "newsletter", credits_used: 0, response_status: 200,
  });
  return NextResponse.json({ newsletter, posts: postsOut, signature });
}
