import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { haloSession } from "@/lib/halo/session";
import { startSparkleeDraft } from "@/lib/halo/sparklee";
import { connectedPlatforms } from "@/lib/home/data";
import type { PlanItem } from "@/lib/home/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * POST /api/sparklee/plan/approve { items } — the agent approved Sparklee's
 * plan (2026-10-29). Each video item becomes a written draft in Needs Your
 * Approval: script, blog, title and thumbnail, NO video yet and nothing
 * charged. The agent presses Make video, watches it, then Approve to post.
 * Tool items are links the agent finishes themselves.
 *
 * Free plans: { fill } — Spark Studio is filled in with the first video and
 * they make it there, as with "Tell Sparklee what to make".
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { items?: PlanItem[] };
  const items = (Array.isArray(body.items) ? body.items : []).filter((i) => i && i.type === "video").slice(0, 4);
  if (!items.length) return NextResponse.json({ ok: true, drafts: 0 });

  const s = await haloSession();
  if (!s.ok) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const first = items[0];
    return NextResponse.json({ fill: `/create?say=${encodeURIComponent(`Make a video: ${String(first.topic || first.title).slice(0, 300)}`)}` });
  }

  const p = s.profile as unknown as { location_city?: string | null; location_state?: string | null };
  const city = p.location_city?.trim() || "";
  const state = p.location_state?.trim() || "";
  if (!city || !state) return NextResponse.json({ error: "Add your town and state in Settings first.", href: "/settings" }, { status: 400 });

  // Only accounts that are really connected, checked again here.
  const { data: prof } = await s.admin.from("profiles")
    .select("youtube_channel_id, youtube_refresh_token, social_profile_created_at").eq("id", s.user.id).single();
  const connected = new Set(await connectedPlatforms(prof as never, s.user.id));

  const started: { draftId: string; slotAt: string }[] = [];
  const work: Promise<void>[] = [];
  for (const i of items) {
    const topic = String(i.topic || i.title || "").trim().slice(0, 300);
    if (!topic) continue;
    const r = await startSparkleeDraft(s.admin, s.user, s.profile, {
      words: String(i.day || "tomorrow"), topic, city, state,
      size: i.size === "horizontal" ? "horizontal" : "vertical",
    }, {
      makeVideo: false,
      platforms: (i.platforms ?? []).filter((x) => connected.has(x)),
    });
    if (r) { started.push({ draftId: r.draftId, slotAt: r.slotAt }); work.push(r.work); }
  }
  waitUntil(Promise.allSettled(work).then(() => undefined));
  return NextResponse.json({ ok: true, drafts: started.length, started });
}
