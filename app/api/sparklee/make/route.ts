import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import { sparkleeSetup, startSparkleeDraft } from "@/lib/halo/sparklee";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { hasAdminPerks } from "@/lib/utils/roles";

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
 *   { confirm }  with { preview: true }: what it would make, for "I'll
 *                create:" with Create it / Change details. Nothing is written.
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) {
    // Free plans: the page is filled in and they press Next, as before.
    return NextResponse.json({ fill: true, reason: "plan" });
  }
  const body = (await req.json().catch(() => ({}))) as { words?: unknown; slots?: Slots; preview?: unknown };
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

  const { data: prof } = await s.admin.from("profiles")
    .select(`heygen_digital_twin_look_id, heygen_voice_id, voice_sample_url, ${ALLOWANCE_SELECT}`)
    .eq("id", s.user.id).single();
  const me = prof as unknown as { heygen_digital_twin_look_id: string | null; heygen_voice_id: string | null; voice_sample_url: string | null } | null;
  // A Digital Twin asked for by name: the twin's look. (The old check had
  // stray control characters in place of \b and never matched; fixed 2026-10-31.)
  const lookId = /\btwin\b/.test(t) ? me?.heygen_digital_twin_look_id ?? null : null;

  // "I'll create:" (2026-10-31, the owner's ask): what it would make, before
  // anything is written or charged. The same setup the real start uses.
  if (body.preview === true) {
    const { setup, slot } = await sparkleeSetup(s.admin, s.user.id, s.profile, { words, size, look: lookId ? "full" : look, lookId });
    const twin = !!setup.lookId && setup.lookId === me?.heygen_digital_twin_look_id;
    const face = twin ? "Your Digital Twin" : setup.look === "circle" ? "AI avatar in a circle" : "AI avatar";
    const voice = me?.heygen_voice_id || me?.voice_sample_url ? "cloned voice" : "AI voice";
    const unlimited = hasAdminPerks((s.profile as { role?: string | null }).role);
    const left = availableFor(prof as never, "short");
    return NextResponse.json({
      confirm: {
        items: [
          { label: "Spark", value: "Video / Reel" },
          { label: "On screen", value: `${face} + ${voice}` },
          { label: "Place", value: `${city}, ${state}` },
          { label: "Size", value: setup.size === "vertical" ? "Vertical 9:16" : "Horizontal 16:9" },
          { label: "Length", value: "Up to 2 minutes" },
          { label: "Ending", value: "Your closing line from Settings" },
        ],
        usage: unlimited ? null : `Uses 1 of your ${left} remaining video${left === 1 ? "" : "s"}.`,
        outOfVideos: !unlimited && left < 1,
        platforms: setup.platforms,
        slotAt: slot.toISOString(),
      },
    });
  }

  const started = await startSparkleeDraft(s.admin, s.user, s.profile, {
    words, topic, city, state, size, look: lookId ? "full" : look, lookId,
    audience: slots.audience ?? null, tone: slots.tone ?? null,
  });
  if (!started) return NextResponse.json({ error: "Couldn't start that. Try again." }, { status: 500 });

  waitUntil(started.work);
  return NextResponse.json({ draftId: started.draftId, slotAt: started.slotAt, platforms: started.platforms, topic, city, state });
}
