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
    .select("heygen_photo_id")
    .eq("id", user.id)
    .single();

  if (!profile?.heygen_photo_id) {
    return NextResponse.json({ looks: [] });
  }

  const looks = await getAvatarLooks(profile.heygen_photo_id);
  return NextResponse.json({ looks });
}
