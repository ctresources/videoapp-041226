import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Removes a saved photo from a project (2026-10-16, the owner's ask: "need
 * ability to delete photos everywhere").
 *
 *   POST { projectId, url, from: "listing" }  out of listing_data.photoUrls
 *   POST { projectId, url, from: "share_kit" } out of seo_data.share_images
 *
 * The listing's photos were shown in the video editor and could be removed
 * there, but only from the screen: the saved list put them back on reload,
 * and the render and the camera added them back into the video. Taking them
 * out of the saved list is what makes the removal stick everywhere that list
 * is read. The file itself is left in storage; nothing else depends on it
 * being gone, and a video already made may still show it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, url, from } = (await req.json().catch(() => ({}))) as {
    projectId?: string; url?: string; from?: "listing" | "share_kit";
  };
  if (!projectId || !url || (from !== "listing" && from !== "share_kit")) {
    return NextResponse.json({ error: "projectId, url and from are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, listing_data, seo_data")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (from === "listing") {
    const ld = { ...((project.listing_data ?? {}) as Record<string, unknown>) };
    const before = Array.isArray(ld.photoUrls) ? (ld.photoUrls as unknown[]).filter((u): u is string => typeof u === "string") : [];
    ld.photoUrls = before.filter((u) => u !== url);
    const { error } = await admin.from("projects").update({ listing_data: ld }).eq("id", projectId);
    if (error) return NextResponse.json({ error: "Couldn't remove the photo." }, { status: 500 });
    return NextResponse.json({ photoUrls: ld.photoUrls });
  }

  const seo = { ...((project.seo_data ?? {}) as Record<string, unknown>) };
  const before = Array.isArray(seo.share_images) ? (seo.share_images as unknown[]).filter((u): u is string => typeof u === "string") : [];
  seo.share_images = before.filter((u) => u !== url);
  const { error } = await admin.from("projects").update({ seo_data: seo }).eq("id", projectId);
  if (error) return NextResponse.json({ error: "Couldn't remove the image." }, { status: 500 });
  return NextResponse.json({ shareImages: seo.share_images });
}
