import { isReviewRequest } from "@/lib/utils/review-request";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { loadBoldTrailToken } from "@/lib/api/boldtrail";
import { writeVideoEmail } from "@/lib/api/video-email";
import { emailPosterFor } from "@/lib/video/email-poster";
import { isHeygenUrl } from "@/lib/utils/video-url";
import { loadQuickPicks } from "@/lib/api/boldtrail-picks";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Email it, for a finished video in My Sparks (2026-10-15, the owner's mock).
 *
 *   POST { videoId, action: "load" }   the video (with its email still, made once),
 *        the sign-off, whether BoldTrail is connected, quick picks, and the last send
 *   POST { videoId, action: "write" }  a subject and short note written from the video
 *
 * Sending is /api/video-email/send; finding a contact is /api/video-email/contact.
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, action } = (await req.json().catch(() => ({}))) as { videoId?: string; action?: "load" | "write" };
  if (!videoId) return NextResponse.json({ error: "videoId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, duration_seconds, render_status, email_poster_url, project_id, projects(title, thumbnail_url, ai_script, seo_data, location_city, location_state)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .maybeSingle();
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) {
    return NextResponse.json({ error: "That video isn't ready to email yet." }, { status: 404 });
  }
  const project = (Array.isArray(video.projects) ? video.projects[0] : video.projects) as {
    title?: string | null; thumbnail_url?: string | null; ai_script?: { script?: string } | null; seo_data?: { description?: string } | null;
    location_city?: string | null; location_state?: string | null;
  } | null;
  const title = project?.title || "My latest video";
  const seconds = (video.duration_seconds as number | null) ?? null;

  if (action === "write") {
    const gate = await freeTrialGateResponse(user.id);
    if (gate) return gate;
    const signature = await loadAgentSignature(admin, user.id);
    const written = await writeVideoEmail({
      title,
      about: project?.seo_data?.description || project?.ai_script?.script || null,
      agentName: signature.name,
      market: [project?.location_city, project?.location_state].filter(Boolean).join(", ") || null,
    });
    if (!written) return NextResponse.json({ error: "Couldn't write the note. Please try again, or write your own." }, { status: 502 });
    await admin.from("api_usage_log").insert({
      user_id: user.id, api_provider: "perplexity", endpoint: "video_email_write", credits_used: 0, response_status: 200,
    });
    return NextResponse.json(written);
  }

  // The thumbnail they made, with a play button; a still from the video only
  // when there is no thumbnail (2026-10-27, the owner's ask).
  const posterUrl = await emailPosterFor(admin, user.id,
    { id: videoId, video_url: url, duration_seconds: seconds, email_poster_url: (video.email_poster_url as string | null) ?? null },
    project?.thumbnail_url ?? null);

  const [signature, token, picks, { data: sends }, { data: prof }] = await Promise.all([
    loadAgentSignature(admin, user.id),
    loadBoldTrailToken(admin, user.id),
    loadQuickPicks(admin, user.id),
    // Every send of this video, Email it and review asks alike (2026-10-29).
    admin.from("video_email_sends").select("video_id, sent_to, sent_at, subject").eq("user_id", user.id).eq("video_id", videoId).order("sent_at", { ascending: false }).limit(50),
    admin.from("profiles").select("google_review_url").eq("id", user.id).single(),
  ]);

  const last = (sends ?? []).find((s) => s.video_id === videoId);
  return NextResponse.json({
    // The Google review button (2026-10-29): the agent's link, and whether
    // this video was made to ask for a review, which ticks it to begin with.
    reviewUrl: (prof as { google_review_url: string | null } | null)?.google_review_url ?? null,
    isReview: isReviewRequest(project?.ai_script),
    video: { id: videoId, title, url, seconds, posterUrl },
    signature,
    boldtrail: !!token,
    picks,
    lastSent: last ? { at: last.sent_at, to: last.sent_to } : null,
    history: (sends ?? []).map((s) => ({ at: s.sent_at, subject: s.subject, to: s.sent_to })),
  });
}
