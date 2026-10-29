import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_SHAPES, renderImage, type ImageShape } from "@/lib/utils/image-render";

export const maxDuration = 60;

/**
 * POST { projectId, headline } — the post's headline, as the agent typed it
 * in the Share Kit (2026-10-15). Saved as ai_script.blog_headline, merged into
 * what is there on the server so nothing else in ai_script (the header image,
 * the moving header) is overwritten by an older copy from the browser. The
 * email, the newsletter and the header image all read it first. Empty clears
 * it, and the written title is used again.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, headline } = (await req.json().catch(() => ({}))) as { projectId?: string; headline?: string };
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const h = (headline ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, ai_script")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const ai = { ...((project.ai_script ?? {}) as Record<string, unknown>) };
  const before = typeof ai.blog_headline === "string" ? ai.blog_headline : "";
  if (h) ai.blog_headline = h;
  else delete ai.blog_headline;

  /**
   * The header image carries the headline, so it is redrawn with the new one
   * (2026-10-29, the owner's ask), over the same background: no AI image is
   * used. Needs the image's own record (its background); a header added from
   * elsewhere is left as it is. Text styling beyond the headline isn't stored,
   * so the redraw uses the default look.
   */
  let headerUrl: string | null = null;
  const currentHeader = typeof ai.blog_header_url === "string" ? ai.blog_header_url : "";
  if (h && h !== before && currentHeader) {
    try {
      const { data: img } = await admin
        .from("generated_images")
        .select("shape, background_url")
        .eq("user_id", user.id)
        .eq("image_url", currentHeader)
        .maybeSingle();
      const rec = img as { shape: string; background_url: string | null } | null;
      if (rec?.background_url && rec.shape in IMAGE_SHAPES) {
        const shape = rec.shape as ImageShape;
        headerUrl = await renderImage({
          userId: user.id, shape, backgroundUrl: rec.background_url,
          text: { headline: h.slice(0, 120), showLogo: true },
        });
        await admin.from("generated_images").insert({
          user_id: user.id, project_id: projectId, template: "blog_header", shape,
          image_url: headerUrl, background_url: rec.background_url, ai_background: false,
        });
        ai.blog_header_url = headerUrl;
      }
    } catch (err) {
      console.warn("[headline] header redraw failed; keeping the old header:", err instanceof Error ? err.message : err);
    }
  }

  const { error } = await admin.from("projects").update({ ai_script: ai }).eq("id", projectId);
  if (error) return NextResponse.json({ error: "Couldn't save the headline." }, { status: 500 });
  return NextResponse.json({ headline: h, headerUrl });
}
