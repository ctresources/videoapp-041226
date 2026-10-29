import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDigitalTwin, deleteAvatarLook, getAvatarLooks } from "@/lib/api/heygen";
import { notifyTwinRefused } from "@/lib/email";
import { toTwinVideo, videoIsUpright } from "@/lib/utils/twin-video";
import { canUseDigitalTwin, DIGITAL_TWIN_UPGRADE_MESSAGE } from "@/lib/utils/plan-features";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";

// Relays the recording (up to ~200 MB) from Supabase to HeyGen's S3 slot,
// converting an iPhone MOV to MP4 on the way (~0.7x real time on one core),
// so the Fluid Compute ceiling rather than five minutes (2026-10-20).
export const maxDuration = 800;

/**
 * Two Digital Twins per account since 2026-10-29 (the owner's mockup): one
 * filmed upright for Reels and Shorts, one sideways for YouTube. Slot 1 is
 * every account's twin (the free plan's only one, in either shape); slot 2,
 * the other shape, is for paid plans. Every action takes ?slot=2 for the
 * second; no slot means slot 1, so older callers are unchanged.
 */
type TwinSlot = 1 | 2;
const COLS = {
  1: { group: "heygen_digital_twin_group_id", look: "heygen_digital_twin_look_id", upright: "twin_upright", consent: "twin_consent_needed" },
  2: { group: "heygen_twin2_group_id", look: "heygen_twin2_look_id", upright: "twin2_upright", consent: "twin2_consent_needed" },
} as const;

function slotOf(req: NextRequest, body?: { slot?: unknown }): TwinSlot {
  const s = body?.slot ?? req.nextUrl.searchParams.get("slot");
  return String(s) === "2" ? 2 : 1;
}

/**
 * POST /api/avatar/digital-twin[?slot=2]
 * Body: { videoUrl: string, name?: string, slot?: 1 | 2 }
 * Creates a HeyGen Digital Twin from the given video URL and stores the
 * resulting group_id + look_id in that slot.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const slot = slotOf(req, body);
  const c = COLS[slot];

  // Plan gate. Checked BEFORE the HeyGen call — training a twin costs money
  // upstream, so a refused request must never reach the API.
  const admin0 = createAdminClient();
  const { data: gateRow } = await admin0
    .from("profiles")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .single();
  const gate = gateRow as { subscription_tier: string | null; role: string | null } | null;

  if (!canUseDigitalTwin(gate?.subscription_tier, gate?.role)) {
    return NextResponse.json(
      { error: DIGITAL_TWIN_UPGRADE_MESSAGE, code: "upgrade_required" },
      { status: 403 },
    );
  }
  // The second twin is for paid plans (2026-10-29, the owner's call).
  if (slot === 2 && !isPaidLevel(getAccessLevel(gate ?? {}))) {
    return NextResponse.json(
      { error: "A second Digital Twin comes with a SparkReels plan. See plans in Settings → Billing.", code: "paid_plan_required" },
      { status: 403 },
    );
  }

  const videoUrl = body.videoUrl as string | undefined;
  const name = (body.name as string | undefined) || (slot === 2 ? "My Digital Twin 2" : "My Digital Twin");

  if (!videoUrl) return NextResponse.json({ error: "videoUrl required" }, { status: 400 });

  try {
    // An iPhone's MOV/HEVC recording is converted to MP4 first (2026-10-20),
    // and measured on the way (2026-10-29): HeyGen reports every twin as
    // 1280x720, so whether it was filmed upright is only known here.
    let upright: boolean | null = null;
    const result = await createDigitalTwin(videoUrl, name, async (buf, type) => {
      const out = await toTwinVideo(buf, type);
      upright = await videoIsUpright(out.buffer);
      return out;
    });

    const admin = createAdminClient();
    console.log(`[digital-twin] slot ${slot}: saving groupId=${result.groupId} lookId=${result.lookId} upright=${upright} for user=${user.id}`);
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        [c.group]: result.groupId || null,
        [c.look]: result.lookId || null,
        // Needs its one-time approval before any video (2026-10-24, the
        // owner's ask): asked for as soon as training ends, not found out
        // when a video fails.
        [c.consent]: true,
        [c.upright]: upright,
      })
      .eq("id", user.id);
    if (updateErr) console.error("[digital-twin] profile update error:", updateErr);

    return NextResponse.json({ ...result, upright });
  } catch (err) {
    console.error("[digital-twin] POST error:", err);
    const raw = err instanceof Error ? err.message : String(err);
    // The July refusal (one twin per account). HeyGen says it no longer
    // applies to API twins; if it does come back, the owner hears at once.
    if (/plan allows only one|resource_limit_reached|verified avatar group/i.test(raw)) {
      void notifyTwinRefused({ userEmail: user.email ?? user.id, detail: raw });
      return NextResponse.json(
        { error: "We couldn't create your Digital Twin just now. Our team has been told and will be in touch. Your photo avatar keeps working in the meantime." },
        { status: 503 },
      );
    }
    if (/^HeyGen /.test(raw)) {
      return NextResponse.json(
        { error: "Your Digital Twin couldn't be created from that video. Try again, or upload a different recording." },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digital Twin creation failed" },
      { status: 422 },
    );
  }
}

/**
 * GET /api/avatar/digital-twin[?slot=2]
 * Returns the current training status by polling getAvatarLooks on the stored group.
 * Status values: "none" | "processing" | "pending_consent" | "active" | "failed"
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slot = slotOf(req);
  const c = COLS[slot];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(`${c.group}, ${c.look}, ${c.consent}, ${c.upright}, twin_outfit_look_ids`)
    .eq("id", user.id)
    .single();
  const profile = (data ?? {}) as Record<string, unknown>;
  const groupId = profile[c.group] as string | null;
  const storedLook = profile[c.look] as string | null;

  if (!groupId) return NextResponse.json({ status: "none" });

  try {
    const looks = await getAvatarLooks(groupId);
    // The twin itself, never one of its AI outfits (2026-10-28): those live in
    // the same group, and taking the first look could have swapped the twin
    // for an outfit.
    const outfits = new Set((profile.twin_outfit_look_ids as string[] | null) ?? []);
    const look = looks.find((l) => l.id === storedLook)
      ?? looks.find((l) => !outfits.has(l.id))
      ?? null;
    // Training first; once trained, the one-time approval if it's still
    // needed (set when training starts since 2026-10-24, and by a render
    // HeyGen refused); the look itself reads "completed" either way.
    const lookStatus = look?.status ?? "processing";
    const trained = lookStatus === "completed" || lookStatus === "active" || lookStatus === "pending_consent";
    const status = trained && profile[c.consent] ? "pending_consent" : lookStatus;

    // Keep stored look_id up to date
    if (look?.id && look.id !== storedLook) {
      await admin.from("profiles").update({ [c.look]: look.id }).eq("id", user.id);
    }

    return NextResponse.json({
      groupId,
      lookId: look?.id ?? storedLook,
      status,
      // Measured from the training clip; null for a twin made before that.
      upright: (profile[c.upright] as boolean | null) ?? null,
    });
  } catch (err) {
    console.error("[digital-twin] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/avatar/digital-twin[?slot=2]
 * Deletes the twin at HeyGen and clears it from the profile. Since 2026-10-19
 * it is really deleted, not just unlinked: a twin is a lifelike copy of a real
 * person, made with their consent, and should not outlive their asking for it
 * to go. Its outfits go with it.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slot = slotOf(req);
  const c = COLS[slot];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(`${c.group}, ${c.look}, twin_outfit_look_ids`)
    .eq("id", user.id)
    .maybeSingle();
  const r = (data ?? {}) as Record<string, unknown>;
  const groupId = r[c.group] as string | null;
  const lookId = r[c.look] as string | null;
  const outfits = (r.twin_outfit_look_ids as string[] | null) ?? [];

  // This twin's outfits: the ones in its own group (2026-10-29, two twins).
  let mine: string[] = [];
  if (groupId && outfits.length) {
    const inGroup = new Set((await getAvatarLooks(groupId).catch(() => [])).map((l) => l.id));
    mine = outfits.filter((id) => inGroup.has(id));
  }
  for (const id of [lookId, ...mine]) {
    if (!id) continue;
    const deleted = await deleteAvatarLook(id);
    if (!deleted) console.warn(`[digital-twin] HeyGen delete failed for ${id}; unlinking anyway`);
  }
  await admin
    .from("profiles")
    .update({
      [c.group]: null,
      [c.look]: null,
      [c.upright]: null,
      [c.consent]: false,
      twin_outfit_look_ids: outfits.filter((id) => !mine.includes(id)),
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/avatar/digital-twin[?slot=2] — "I've approved it" in Settings
 * (2026-10-23). Clears that twin's approval flag; a render refused for
 * approval sets it again.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = COLS[slotOf(req)];
  await createAdminClient().from("profiles").update({ [c.consent]: false }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
