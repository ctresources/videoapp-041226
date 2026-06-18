import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvatarLooks } from "@/lib/api/heygen";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_photo_id, heygen_digital_twin_group_id")
    .eq("id", user.id)
    .single();

  const photoGroupId = profile?.heygen_photo_id ?? null;
  const dtGroupId = profile?.heygen_digital_twin_group_id ?? null;

  if (!photoGroupId && !dtGroupId) {
    return NextResponse.json({ looks: [] });
  }

  const [photoResult, dtResult] = await Promise.allSettled([
    photoGroupId ? getAvatarLooks(photoGroupId) : Promise.resolve([]),
    dtGroupId ? getAvatarLooks(dtGroupId) : Promise.resolve([]),
  ]);

  const looks = [
    ...(photoResult.status === "fulfilled" ? photoResult.value : []),
    ...(dtResult.status === "fulfilled" ? dtResult.value : []),
  ];

  return NextResponse.json({ looks });
}
