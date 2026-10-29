import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDigitalTwin, deleteAvatarLook, getAvatarLooks } from "@/lib/api/heygen";
import { notifyTwinRefused } from "@/lib/email";
import { toTwinVideo, videoIsUpright } from "@/lib/utils/twin-video";
import { canUseDigitalTwin, DIGITAL_TWIN_UPGRADE_MESSAGE } from "@/lib/utils/plan-features";
import { NextRequest, NextResponse } from "next/server";

// Relays the recording (up to ~200 MB) from Supabase to HeyGen's S3 slot,
// converting an iPhone MOV to MP4 on the way (~0.7x real time on one core),
// so the Fluid Compute ceiling rather than five minutes (2026-10-20).
export const maxDuration = 800;

/**
 * POST /api/avatar/digital-twin
 * Body: { videoUrl: string, name?: string }
 * Creates a HeyGen Digital Twin from the given video URL and stores the
 * resulting group_id + look_id in the user's profile.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Plan gate. Checked BEFORE the HeyGen call — training a twin costs money
  // upstream, so a free-tier request must never reach the API.
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

  const body = await req.json().catch(() => ({}));
  const videoUrl = body.videoUrl as string | undefined;
  const name = (body.name as string | undefined) || "My Digital Twin";

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
    console.log(`[digital-twin] saving groupId=${result.groupId} lookId=${result.lookId} for user=${user.id}`);
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        heygen_digital_twin_group_id: result.groupId || null,
        heygen_digital_twin_look_id: result.lookId || null,
        // Needs its one-time approval before any video (2026-10-24, the
        // owner's ask): asked for as soon as training ends, not found out
        // when a video fails.
        twin_consent_needed: true,
        twin_upright: upright,
        // A new twin starts with no outfits; the old twin's went with it.
        twin_outfit_look_ids: [],
      })
      .eq("id", user.id);
    if (updateErr) console.error("[digital-twin] profile update error:", updateErr);

    return NextResponse.json(result);
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
 * GET /api/avatar/digital-twin
 * Returns the current training status by polling getAvatarLooks on the stored group.
 * Status values: "none" | "processing" | "pending_consent" | "active" | "failed"
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_digital_twin_group_id, heygen_digital_twin_look_id, twin_consent_needed, twin_outfit_look_ids")
    .eq("id", user.id)
    .single();

  if (!profile?.heygen_digital_twin_group_id) {
    return NextResponse.json({ status: "none" });
  }

  try {
    const looks = await getAvatarLooks(profile.heygen_digital_twin_group_id);
    // The twin itself, never one of its AI outfits (2026-10-28): those live in
    // the same group, and taking the first look could have swapped the twin
    // for an outfit.
    const outfits = new Set((profile as { twin_outfit_look_ids?: string[] | null }).twin_outfit_look_ids ?? []);
    const look = looks.find((l) => l.id === profile.heygen_digital_twin_look_id)
      ?? looks.find((l) => !outfits.has(l.id))
      ?? null;
    // Training first; once trained, the one-time approval if it's still
    // needed (set when training starts since 2026-10-24, and by a render
    // HeyGen refused); the look itself reads "completed" either way.
    const lookStatus = look?.status ?? "processing";
    const trained = lookStatus === "completed" || lookStatus === "active" || lookStatus === "pending_consent";
    const status = trained && profile.twin_consent_needed ? "pending_consent" : lookStatus;

    // Keep stored look_id up to date
    if (look?.id && look.id !== profile.heygen_digital_twin_look_id) {
      await admin
        .from("profiles")
        .update({ heygen_digital_twin_look_id: look.id })
        .eq("id", user.id);
    }

    return NextResponse.json({
      groupId: profile.heygen_digital_twin_group_id,
      lookId: look?.id ?? profile.heygen_digital_twin_look_id,
      status,
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
 * DELETE /api/avatar/digital-twin
 * Deletes the twin at HeyGen and clears it from the profile. Since 2026-10-19
 * it is really deleted, not just unlinked: a twin is a lifelike copy of a real
 * person, made with their consent, and should not outlive their asking for it
 * to go.
 */
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("profiles")
    .select("heygen_digital_twin_look_id, twin_outfit_look_ids")
    .eq("id", user.id)
    .maybeSingle();
  const r = row as { heygen_digital_twin_look_id: string | null; twin_outfit_look_ids: string[] | null } | null;
  // The twin and its outfits (2026-10-28): every copy of the person goes.
  for (const lookId of [r?.heygen_digital_twin_look_id, ...(r?.twin_outfit_look_ids ?? [])]) {
    if (!lookId) continue;
    const deleted = await deleteAvatarLook(lookId);
    if (!deleted) console.warn(`[digital-twin] HeyGen delete failed for ${lookId}; unlinking anyway`);
  }
  await admin
    .from("profiles")
    .update({ heygen_digital_twin_group_id: null, heygen_digital_twin_look_id: null, twin_outfit_look_ids: [] })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/avatar/digital-twin — "I've approved it" in Settings
 * (2026-10-23). Clears twin_consent_needed; a render refused for approval
 * sets it again.
 */
export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await createAdminClient().from("profiles").update({ twin_consent_needed: false }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
