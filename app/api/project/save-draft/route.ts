import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { learnMyVoice } from "@/lib/api/my-voice";
import { draftScriptPatch } from "@/lib/scripts/draft-script";

/** How many words one version has that the other doesn't, both ways. */
function changedWords(a: string, b: string): number {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const w of s.toLowerCase().match(/[a-z0-9']+/g) ?? []) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const ca = count(a), cb = count(b);
  let diff = 0;
  ca.forEach((n, w) => { diff += Math.max(0, n - (cb.get(w) ?? 0)); });
  cb.forEach((n, w) => { diff += Math.max(0, n - (ca.get(w) ?? 0)); });
  return diff;
}

/**
 * Saves an in-progress draft back onto the project without generating a video.
 * The project keeps status "draft" and shows up in My Content under Drafts so
 * the user can come back and finish later.
 *
 * It used to save four fields — script, CTA, hook, title — and the setup
 * screen's other six choices were React state only. Pick a shape, reorder the
 * photos, choose music, leave, come back, and every one of them was gone with
 * nothing saying so. Photo order matters more than it looks: the render slices
 * the first twelve in grid order.
 *
 * All of them live on ai_script beside the rest, which is the pattern already
 * in use — render_mode and video_platform have round-tripped this way since
 * the editor started reading its defaults back off the project.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    projectId, script, cta, ctaOff, ctaEdited, hook, title,
    videoType, photoUrls, musicId, musicUrl, captions, renderMode, lookId, avatarStyle, scriptTyped,
  } = await req.json() as {
    projectId?: string;
    script?: string;
    /** The script was changed by hand, not by AI: My voice may learn from it. */
    scriptTyped?: boolean;
    cta?: string;
    /** "No call to action": the wording is kept, and not spoken. */
    ctaOff?: boolean;
    /** The closing line was typed over in this video, so it is kept as typed. */
    ctaEdited?: boolean;
    hook?: string;
    title?: string;
    /** reel_9x16 | youtube_16x9 | youtube_long — the shape picker. */
    videoType?: string;
    /** Photo grid, IN ORDER. The render takes the first twelve of these. */
    photoUrls?: unknown;
    musicId?: string;
    musicUrl?: string | null;
    captions?: boolean;
    renderMode?: string;
    lookId?: string;
    /** Which avatar video: "full" (b-roll and graphics made for it) or "circle" (a corner circle over scenes). */
    avatarStyle?: string;
  };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, ai_script")
    .eq("id", projectId)
    .single();

  if (!project || (project as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const aiScript = ((project as { ai_script: Record<string, unknown> | null }).ai_script) || {};
  const updatedScript = draftScriptPatch(aiScript, {
    script, cta, ctaOff, ctaEdited, hook, videoType, photoUrls, musicId, musicUrl, captions, renderMode, lookId, avatarStyle,
  });

  const { error } = await admin
    .from("projects")
    .update({ ai_script: updatedScript, ...(title?.trim() ? { title: title.trim() } : {}) })
    .eq("id", projectId);

  if (error) {
    console.error("save-draft update error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }

  // My voice (2026-11-18, the owner's ask): what they changed by hand in a
  // script written for them. Compared with the version it last learned from,
  // so saving the same words twice teaches nothing twice.
  if (scriptTyped === true && typeof script === "string") {
    const before = String(aiScript.voice_seen_script ?? aiScript.script ?? "");
    if (changedWords(before, script) >= 8) {
      waitUntil((async () => {
        await learnMyVoice(admin, user.id, "edits", { text: script, rejected: before });
        // Read again: another save may have landed while this was learning.
        const { data: fresh } = await admin.from("projects").select("ai_script").eq("id", projectId).single();
        const now = ((fresh as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? updatedScript;
        await admin.from("projects").update({ ai_script: { ...now, voice_seen_script: script } }).eq("id", projectId);
      })());
    }
  }
  return NextResponse.json({ ok: true });
}
