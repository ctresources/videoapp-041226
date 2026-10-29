import { NextRequest, NextResponse } from "next/server";
import { haloSession } from "@/lib/halo/session";
import { makeDraftVideo } from "@/lib/halo/make";
import type { HaloSetup } from "@/lib/halo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/halo/approve { draftId, make? }
 *
 * Two steps since 2026-10-26 (the owner's ask: approve after watching it).
 *
 * make: true — Make video. Starts the render exactly as the editor's Spark
 * Video button does (lib/video/start-render), with this draft's setup: look,
 * avatar, size, captions, music, and what is on screen. It is charged to the
 * plan then, like any video. The draft stays a draft: nothing is posted.
 *
 * Without make — Approve. Only once the video is finished, so it has been
 * watched first. The halo-post job then posts it on its day to the accounts
 * chosen (lib/halo/post.ts).
 *
 * Refusals come back as start-render gives them (out of videos, no headshot,
 * Digital Twin approval …), so the page can say what to do.
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const { draftId, make, remake } = (await req.json().catch(() => ({}))) as { draftId?: string; make?: boolean; remake?: boolean };

  const { data } = await s.admin
    .from("autopilot_drafts")
    .select("id, status, source, setup, project_id")
    .eq("id", draftId ?? "")
    .eq("user_id", s.user.id)
    .single();
  const d = data as { id: string; status: string; source: string; setup: HaloSetup; project_id: string | null } | null;
  if (!d || !["halo", "halo_promo", "email", "sparklee"].includes(d.source)) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (d.status !== "draft") return NextResponse.json({ error: d.status === "writing" ? "Still writing. Try again in a minute." : "This one is already approved." }, { status: 409 });
  if (!d.project_id) return NextResponse.json({ error: "Still writing. Try again in a minute." }, { status: 409 });

  /**
   * A video already made from this draft (2026-10-24, Daniel Okiro's draft):
   * he made it from Setup → the editor, then pressed Approve, which made and
   * charged a second identical one, and the posting job would have posted that
   * one again. Now a video that is finished or still being made is used as it
   * is: no new video, nothing charged. The posting job sends it on its day to
   * the accounts it isn't on yet. A failed one is ignored and a new one made.
   */
  const { data: made } = await s.admin
    .from("generated_videos")
    .select("id, render_status")
    .eq("project_id", d.project_id)
    .eq("user_id", s.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = made as { id: string; render_status: string | null } | null;
  const hasVideo = !!existing && existing.render_status !== "failed";

  // Approve: the video must be finished, so it can be watched first.
  if (!make) {
    if (!hasVideo) {
      return NextResponse.json({ error: "Make the video first, watch it, then approve it to post." }, { status: 409 });
    }
    if (existing!.render_status !== "completed") {
      return NextResponse.json({ error: "Your video is still being made. Watch it when it's done, then approve it." }, { status: 409 });
    }
  }
  /**
   * Remake (2026-10-29, the owner's ask): the card's video is made but she
   * didn't like it. A new one is made from the draft's setup as it is now and
   * charged like any video; the card follows the newest video for its project,
   * so Approve posts the new one. The old one stays in My Sparks. Only once
   * the first has finished, so a double press can't make two.
   */
  if (make && remake && hasVideo) {
    if (existing!.render_status !== "completed") {
      return NextResponse.json({ error: "Your video is still being made. Watch it when it's done, then remake it if you need to." }, { status: 409 });
    }
    const r = await makeDraftVideo(s.admin, s.user, { id: d.id, setup: d.setup, project_id: d.project_id });
    return NextResponse.json(r.out, { status: r.status });
  }

  // Make video when one is already made or being made: nothing new, nothing charged.
  if (make && hasVideo) {
    return NextResponse.json({ ok: true, made: true, ready: existing!.render_status === "completed" });
  }

  if (hasVideo && existing) {
    await s.admin.from("autopilot_drafts").update({
      status: "approved",
      approved_at: new Date().toISOString(),
      video_id: existing.id,
      post_error: null,
    }).eq("id", d.id);
    return NextResponse.json({ ok: true, reused: true, ready: existing.render_status === "completed" });
  }

  const r = await makeDraftVideo(s.admin, s.user, { id: d.id, setup: d.setup, project_id: d.project_id });
  return NextResponse.json(r.out, { status: r.status });
}
