import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvatarLooks, getAllPrivateLooks, type AvatarLook } from "@/lib/api/heygen";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_photo_id, heygen_digital_twin_group_id, heygen_digital_twin_look_id")
    .eq("id", user.id)
    .single();

  const photoGroupId = profile?.heygen_photo_id ?? null;
  const dtGroupId = profile?.heygen_digital_twin_group_id ?? null;
  const dtLookId = profile?.heygen_digital_twin_look_id ?? null;

  if (!photoGroupId && !dtGroupId && !dtLookId) {
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

  const [photoResult, dtResult] = await Promise.allSettled([
    photoGroupId ? getAvatarLooks(photoGroupId) : Promise.resolve([]),
    dtLookPromise,
  ]);

  const looks = [
    ...(photoResult.status === "fulfilled" ? photoResult.value : []),
    ...(dtResult.status === "fulfilled" ? dtResult.value : []),
  ];

  return NextResponse.json({ looks });
}
