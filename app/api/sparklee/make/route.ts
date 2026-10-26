import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import { startSparkleeDraft } from "@/lib/halo/sparklee";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

interface Slots {
  city?: string | null; state?: string | null; topic?: string | null;
  audience?: string | null; tone?: string | null;
  platform?: "reel" | "youtube" | null;
  output?: "blog" | "video" | null;
  onScreen?: "avatar" | "voice_only" | "camera" | "scenes" | null;
}

/**
 * POST /api/sparklee/make { words, slots } — "Tell Sparklee what to make"
 * (2026-10-26, usability sweep #11). `slots` is what /api/ai/brief-session
 * read from the words.
 *
 * Answers one of three ways:
 *   { ask }      one thing is missing; Sparklee asks for it.
 *   { fill }     not something she makes by herself (a blog, a camera take,
 *                voice over): the Create page is filled in instead.
 *   { draftId }  started: written, then made. Nothing posts until approved.
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) {
    // Free plans: the page is filled in and they press Next, as before.
    return NextResponse.json({ fill: true, reason: "plan" });
  }
  const body = (await req.json().catch(() => ({}))) as { words?: unknown; slots?: Slots };
  const words = typeof body.words === "string" ? body.words.slice(0, 2000) : "";
  const slots = body.slots ?? {};

  if (slots.output === "blog" || (slots.onScreen && slots.onScreen !== "avatar")) {
    return NextResponse.json({ fill: true, reason: "kind" });
  }
  const topic = slots.topic?.trim();
  if (!topic) return NextResponse.json({ ask: "What should the video be about?" });

  const p = s.profile as unknown as { location_city?: string | null; location_state?: string | null };
  const city = slots.city?.trim() || p.location_city?.trim() || "";
  const state = slots.state?.trim() || p.location_state?.trim() || "";
  if (!city || !state) return NextResponse.json({ ask: "Which town and state is it for?" });

  const t = words.toLowerCase();
  const size = slots.platform === "reel" || /\bvertical\b|\btall\b/.test(t) ? "vertical"
    : slots.platform === "youtube" || /\bhorizontal\b|\bwide\b|16:9/.test(t) ? "horizontal" : null;
  const look = /\bcircle\b/.test(t) ? "circle" : /\btwin\b|\bfull\b/.test(t) ? "full" : null;

  // A Digital Twin asked for by name: the twin's look.
  let lookId: string | null = null;
  if (/twin/.test(t)) {
    const { data: prof } = await s.admin.from("profiles").select("heygen_digital_twin_look_id").eq("id", s.user.id).single();
    lookId = (prof as { heygen_digital_twin_look_id: string | null } | null)?.heygen_digital_twin_look_id ?? null;
  }

  const started = await startSparkleeDraft(s.admin, s.user, s.profile, {
    words, topic, city, state, size, look: lookId ? "full" : look, lookId,
    audience: slots.audience ?? null, tone: slots.tone ?? null,
  });
  if (!started) return NextResponse.json({ error: "Couldn't start that. Try again." }, { status: 500 });

  waitUntil(started.work);
  return NextResponse.json({ draftId: started.draftId, slotAt: started.slotAt, platforms: started.platforms, topic, city, state });
}
