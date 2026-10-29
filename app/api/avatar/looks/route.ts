import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvatarLooks, getAllPrivateLooks, deleteAvatarLook, type AvatarLook } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";
import { twinLookIds } from "@/lib/utils/twin-looks";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_photo_id, heygen_digital_twin_group_id, heygen_digital_twin_look_id, heygen_look_wide, heygen_look_tall, twin_outfit_look_ids, heygen_twin2_group_id, heygen_twin2_look_id, twin_upright, twin2_upright")
    .eq("id", user.id)
    .single();
  // The second twin's own group (2026-10-29): its look and its outfits.
  const twin2Group = (profile as { heygen_twin2_group_id?: string | null } | null)?.heygen_twin2_group_id ?? null;
  // The widescreen and vertical copies of the headshot, so the editor can
  // start on one of them (2026-10-18); the render swaps to the right shape.
  const formatLooks = { wide: profile?.heygen_look_wide ?? null, tall: profile?.heygen_look_tall ?? null };

  const photoGroupId = profile?.heygen_photo_id ?? null;
  const dtGroupId = profile?.heygen_digital_twin_group_id ?? null;
  const dtLookId = profile?.heygen_digital_twin_look_id ?? null;

  if (!photoGroupId && !dtGroupId && !dtLookId && !twin2Group) {
    return NextResponse.json({ looks: [] });
  }

  // When dtGroupId is missing but we have a dtLookId, fetch all private looks
  // to recover the DT look and back-fill the group_id.
  let dtLookPromise: Promise<AvatarLook[]>;
  if (dtGroupId) {
    dtLookPromise = getAvatarLooks(dtGroupId);
  } else if (dtLookId) {
    dtLookPromise = getAllPrivateLooks().then(async (allLooks) => {
      const dtLook = allLooks.find((l) => l.id === dtLookId);
      if (dtLook?.group_id) {
        // Back-fill the group_id so future requests are faster
        await admin
          .from("profiles")
          .update({ heygen_digital_twin_group_id: dtLook.group_id })
          .eq("id", user.id);
      }
      return dtLook ? [dtLook] : [];
    });
  } else {
    dtLookPromise = Promise.resolve([]);
  }

  const [photoResult, dtResult, dt2Result] = await Promise.allSettled([
    photoGroupId ? getAvatarLooks(photoGroupId) : Promise.resolve([]),
    dtLookPromise,
    twin2Group ? getAvatarLooks(twin2Group) : Promise.resolve([] as AvatarLook[]),
  ]);

  const p2 = profile as { heygen_twin2_look_id?: string | null; twin_upright?: boolean | null; twin2_upright?: boolean | null } | null;
  /**
   * Each look's shape (2026-10-29, the owner's ask: "how do I know which is
   * wide or vertical?"), for the Wide / Vertical / Square labels. A twin's
   * comes from its training clip (HeyGen reports every twin as 1280x720);
   * every other look's, outfits included, from what HeyGen reports.
   */
  const shapeOf = (l: AvatarLook): "landscape" | "portrait" | "square" | null => {
    if (l.id === dtLookId) return p2?.twin_upright === false ? "landscape" : "portrait";
    if (l.id === p2?.heygen_twin2_look_id) return p2?.twin2_upright === false ? "landscape" : "portrait";
    const raw = l as unknown as { image_width?: number; image_height?: number; preferred_orientation?: string };
    const w = Number(raw.image_width), h = Number(raw.image_height);
    if (w > 0 && h > 0) {
      const r = w / h;
      return r > 1.1 ? "landscape" : r < 0.9 ? "portrait" : "square";
    }
    return raw.preferred_orientation === "portrait" || raw.preferred_orientation === "landscape" ? raw.preferred_orientation : null;
  };
  const looks = [
    ...(photoResult.status === "fulfilled" ? photoResult.value : []),
    ...(dtResult.status === "fulfilled" ? dtResult.value : []),
    ...(dt2Result.status === "fulfilled" ? dt2Result.value : []),
  ].map((l) => ({ ...l, shape: shapeOf(l) }));

  // Which look is the Digital Twin. HeyGen's own avatar_type calls it a
  // photo_avatar, so the editor can't tell from the look itself (2026-10-20).
  // twinLookIds adds its AI outfits (2026-10-28), which count as the twin.
  return NextResponse.json({
    looks, formatLooks, twinLookId: dtLookId, twinLookIds: twinLookIds(profile),
    // The second twin itself (2026-10-29), so it isn't mistaken for an outfit.
    twin2LookId: (profile as { heygen_twin2_look_id?: string | null } | null)?.heygen_twin2_look_id ?? null,
  });
}

/**
 * DELETE /api/avatar/looks
 * Body: { lookId: string } — deletes a look from HeyGen. If the look was the
 * user's Digital Twin, the stored twin IDs are cleared too.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lookId } = await req.json().catch(() => ({})) as { lookId?: string };
  if (!lookId) return NextResponse.json({ error: "lookId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_photo_id, heygen_digital_twin_look_id, heygen_twin2_look_id, twin_outfit_look_ids")
    .eq("id", user.id)
    .single();

  // Only this account's own looks (2026-10-28): every customer's looks sit on
  // the one HeyGen account, so an id from the browser must be checked.
  const ownPhotoLooks = profile?.heygen_photo_id
    ? (await getAvatarLooks(profile.heygen_photo_id).catch(() => [] as AvatarLook[])).map((l) => l.id)
    : [];
  if (!twinLookIds(profile).includes(lookId) && !ownPhotoLooks.includes(lookId)) {
    return NextResponse.json({ error: "That look isn't on your account." }, { status: 403 });
  }

  const ok = await deleteAvatarLook(lookId);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not delete this look right now. Please try again in a moment." },
      { status: 502 },
    );
  }

  const outfits = ((profile as { twin_outfit_look_ids?: string[] | null } | null)?.twin_outfit_look_ids) ?? [];
  if (profile?.heygen_digital_twin_look_id === lookId) {
    // The twin itself: its outfits are no use without it, so they go too.
    for (const id of outfits) await deleteAvatarLook(id);
    await admin
      .from("profiles")
      .update({ heygen_digital_twin_group_id: null, heygen_digital_twin_look_id: null, twin_outfit_look_ids: [] })
      .eq("id", user.id);
  } else if ((profile as { heygen_twin2_look_id?: string | null } | null)?.heygen_twin2_look_id === lookId) {
    // The second twin (2026-10-29). Its outfits are removed from the list when
    // it is deleted from Settings, which knows its group.
    await admin
      .from("profiles")
      .update({ heygen_twin2_group_id: null, heygen_twin2_look_id: null, twin2_upright: null, twin2_consent_needed: false })
      .eq("id", user.id);
  } else if (outfits.includes(lookId)) {
    await admin
      .from("profiles")
      .update({ twin_outfit_look_ids: outfits.filter((id) => id !== lookId) })
      .eq("id", user.id);
  }

  return NextResponse.json({ ok: true });
}
