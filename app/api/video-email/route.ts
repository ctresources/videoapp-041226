import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { loadBoldTrailToken } from "@/lib/api/boldtrail";
import { writeVideoEmail } from "@/lib/api/video-email";
import { saveEmailPoster } from "@/lib/video/email-poster";
import { isHeygenUrl } from "@/lib/utils/video-url";

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

type Pick = { id: string; name: string; email: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, action } = (await req.json().catch(() => ({}))) as { videoId?: string; action?: "load" | "write" };
  if (!videoId) return NextResponse.json({ error: "videoId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, duration_seconds, render_status, email_poster_url, project_id, projects(title, ai_script, seo_data, location_city, location_state)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .maybeSingle();
  const url = (video?.video_url as string | null) ?? "";
  if (!video || !/^https:\/\//.test(url) || isHeygenUrl(url)) {
    return NextResponse.json({ error: "That video isn't ready to email yet." }, { status: 404 });
  }
  const project = (Array.isArray(video.projects) ? video.projects[0] : video.projects) as {
    title?: string | null; ai_script?: { script?: string } | null; seo_data?: { description?: string } | null;
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

  // The still with a play button, made the first time and kept on the video.
  let posterUrl = (video.email_poster_url as string | null) ?? null;
  if (!posterUrl) {
    posterUrl = await saveEmailPoster(admin, user.id, videoId, url, seconds, "video_email");
    if (posterUrl) await admin.from("generated_videos").update({ email_poster_url: posterUrl }).eq("id", videoId);
  }

  const [signature, token, { data: listings }, { data: sends }] = await Promise.all([
    loadAgentSignature(admin, user.id),
    loadBoldTrailToken(admin, user.id),
    admin.from("seller_listings").select("boldtrail_contacts").eq("user_id", user.id).is("archived_at", null).limit(50),
    admin.from("video_email_sends").select("video_id, sent_to, sent_at").eq("user_id", user.id).order("sent_at", { ascending: false }).limit(30),
  ]);

  // Quick picks: people emailed a video before, then the agent's sellers.
  const picks: Pick[] = [];
  const seen = new Set<string>();
  const add = (c: Partial<Pick> | null | undefined) => {
    if (!c?.id || seen.has(String(c.id)) || picks.length >= 8) return;
    seen.add(String(c.id));
    picks.push({ id: String(c.id), name: c.name || c.email || "Contact", email: c.email || "" });
  };
  for (const s of sends ?? []) for (const c of (s.sent_to ?? []) as Partial<Pick>[]) add(c);
  for (const l of listings ?? []) for (const c of (l.boldtrail_contacts ?? []) as Partial<Pick>[]) add(c);

  const last = (sends ?? []).find((s) => s.video_id === videoId);
  return NextResponse.json({
    video: { id: videoId, title, url, seconds, posterUrl },
    signature,
    boldtrail: !!token,
    picks,
    lastSent: last ? { at: last.sent_at, to: last.sent_to } : null,
  });
}
