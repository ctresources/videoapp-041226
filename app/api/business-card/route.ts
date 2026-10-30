import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { cardUrl, ensureCard, loadCard, sanitizeSettings } from "@/lib/card/card";

export const dynamic = "force-dynamic";

/**
 * GET  /api/business-card — the agent's card, its link, the videos they can
 *      put on it, and (paid plans) the last 30 days of opens and taps.
 * POST /api/business-card { settings } — save what's on it.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const card = await loadCard(admin, user.id);
  const { data: prof } = await admin.from("profiles").select("subscription_tier, role").eq("id", user.id).single();
  const level = getAccessLevel(prof as { subscription_tier: string | null; role: string | null } | null);
  const paid = level === "admin" || isPaidLevel(level);

  const { data: vids } = await admin.from("generated_videos")
    .select("id, video_url, video_type, created_at, projects(title, thumbnail_url, ai_script)")
    .eq("user_id", user.id).eq("render_status", "completed").not("video_url", "is", null)
    .order("created_at", { ascending: false }).limit(20);
  type V = { id: string; video_type: string | null; created_at: string; projects: { title: string | null; thumbnail_url: string | null; ai_script: { kind?: string } | null } | null };
  const videos = ((vids ?? []) as unknown as V[]).map((v) => ({
    id: v.id, title: v.projects?.title ?? "Video", thumbnail: v.projects?.thumbnail_url ?? null,
    vertical: v.video_type === "reel_9x16", intro: v.projects?.ai_script?.kind === "agent_intro", createdAt: v.created_at,
  }));

  let stats: { opens: number; plays: number; taps: number; saves: number } | null = null;
  if (paid) {
    const { data: ev } = await admin.from("business_card_events").select("kind")
      .eq("user_id", user.id).gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5000);
    const kinds = ((ev ?? []) as { kind: string }[]).map((e) => e.kind);
    stats = {
      opens: kinds.filter((k) => k === "open").length,
      plays: kinds.filter((k) => k === "play").length,
      taps: kinds.filter((k) => ["call", "text", "email", "book"].includes(k)).length,
      saves: kinds.filter((k) => k === "save").length,
    };
  }

  return NextResponse.json({
    slug: card.slug, url: cardUrl(card.slug), settings: card.settings,
    profile: card.profile, video: card.video, videos,
    videoCardUrl: card.videoCardUrl, videoCardMadeAt: card.videoCardMadeAt, paid, stats,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { settings } = (await req.json().catch(() => ({}))) as { settings?: unknown };
  const admin = createAdminClient();
  await ensureCard(admin, user.id);
  const clean = sanitizeSettings(settings);
  const { error } = await admin.from("business_cards").update({ settings: clean, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save your card." }, { status: 500 });
  return NextResponse.json({ settings: clean });
}
