import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadTalkingPhoto } from "@/lib/api/heygen";
import { registerFormatLooks } from "@/lib/utils/avatar-crops";
import { getAccessLevel, isPaidLevel } from "@/lib/access";

export const maxDuration = 120;

/**
 * The agent's two photos (2026-10-29, the owner's mockup): a vertical one for
 * Reels and Shorts and a horizontal one for YouTube.
 *
 * POST { slot: "tall" | "wide", image_url } — the picture is already stored
 * (/api/uploads/image). This saves it to its slot, makes sure the photo avatar
 * exists, and rebuilds the 16:9 look from the horizontal photo and the 9:16
 * look from the vertical one; an empty slot is filled from the other photo,
 * as before. avatar_url stays the main photo: the vertical one if there is
 * one.
 *
 * DELETE { slot } — empties one slot (the looks are rebuilt from what's left).
 *
 * Free plan: one photo, in the shape the agent picks. Saving to one slot
 * clears the other.
 */

type Slot = "tall" | "wide";

async function rebuild(userId: string, p: {
  heygen_photo_id: string | null; photo_tall_url: string | null; photo_wide_url: string | null;
}): Promise<{ photoId: string | null; error?: string }> {
  const main = p.photo_tall_url || p.photo_wide_url;
  const admin = createAdminClient();
  if (!main) return { photoId: p.heygen_photo_id };
  let photoId = p.heygen_photo_id;
  try {
    if (!photoId) {
      photoId = await uploadTalkingPhoto(main);
      await admin.from("profiles").update({ heygen_photo_id: photoId }).eq("id", userId);
    }
    await registerFormatLooks(userId, photoId, main, { wide: p.photo_wide_url, tall: p.photo_tall_url });
    return { photoId };
  } catch (err) {
    console.error("[profile/photo] avatar registration failed:", err);
    return { photoId, error: err instanceof Error ? err.message : "Avatar registration failed" };
  }
}

async function load(userId: string) {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("subscription_tier, role, heygen_photo_id, photo_tall_url, photo_wide_url")
    .eq("id", userId)
    .single();
  return data as {
    subscription_tier: string | null; role: string | null; heygen_photo_id: string | null;
    photo_tall_url: string | null; photo_wide_url: string | null;
  } | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { slot?: string; image_url?: string };
  const slot = body.slot === "wide" ? "wide" : body.slot === "tall" ? "tall" : null;
  const url = (body.image_url ?? "").trim();
  if (!slot || !url) return NextResponse.json({ error: "slot and image_url required" }, { status: 400 });
  // Only pictures this app stored: our own storage, the account's own folder.
  if (!url.includes(`/storage/v1/object/public/avatars/${user.id}/`)) {
    return NextResponse.json({ error: "Upload the photo again." }, { status: 400 });
  }

  const p = await load(user.id);
  if (!p) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const paid = isPaidLevel(getAccessLevel(p));

  const next = {
    photo_tall_url: slot === "tall" ? url : (paid ? p.photo_tall_url : null),
    photo_wide_url: slot === "wide" ? url : (paid ? p.photo_wide_url : null),
  };
  const main = next.photo_tall_url || next.photo_wide_url;
  await createAdminClient().from("profiles").update({ ...next, avatar_url: main }).eq("id", user.id);

  const r = await rebuild(user.id, { heygen_photo_id: p.heygen_photo_id, ...next });
  return NextResponse.json({ ...next, avatar_url: main, photo_id: r.photoId, registration_error: r.error ?? null });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { slot?: string };
  const slot: Slot | null = body.slot === "wide" ? "wide" : body.slot === "tall" ? "tall" : null;
  if (!slot) return NextResponse.json({ error: "slot required" }, { status: 400 });

  const p = await load(user.id);
  if (!p) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const next = {
    photo_tall_url: slot === "tall" ? null : p.photo_tall_url,
    photo_wide_url: slot === "wide" ? null : p.photo_wide_url,
  };
  const main = next.photo_tall_url || next.photo_wide_url;
  await createAdminClient().from("profiles").update({ ...next, avatar_url: main }).eq("id", user.id);
  // The other photo now stands in for both shapes.
  if (main) await rebuild(user.id, { heygen_photo_id: p.heygen_photo_id, ...next });
  return NextResponse.json({ ...next, avatar_url: main });
}
