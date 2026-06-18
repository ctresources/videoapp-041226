import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDigitalTwin, getAvatarLooks } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

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

  const body = await req.json().catch(() => ({}));
  const videoUrl = body.videoUrl as string | undefined;
  const name = (body.name as string | undefined) || "My Digital Twin";

  if (!videoUrl) return NextResponse.json({ error: "videoUrl required" }, { status: 400 });

  try {
    const result = await createDigitalTwin(videoUrl, name);

    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({
        heygen_digital_twin_group_id: result.groupId,
        heygen_digital_twin_look_id: result.lookId,
      })
      .eq("id", user.id);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[digital-twin] POST error:", err);
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
    .select("heygen_digital_twin_group_id, heygen_digital_twin_look_id")
    .eq("id", user.id)
    .single();

  if (!profile?.heygen_digital_twin_group_id) {
    return NextResponse.json({ status: "none" });
  }

  try {
    const looks = await getAvatarLooks(profile.heygen_digital_twin_group_id);
    const look = looks[0] ?? null;
    const status = look?.status ?? "processing";

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
 * Clears the stored Digital Twin group + look IDs from the user's profile.
 */
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ heygen_digital_twin_group_id: null, heygen_digital_twin_look_id: null })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
