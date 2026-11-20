import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyVoice } from "@/lib/api/my-voice";

export const dynamic = "force-dynamic";

/** GET / POST /api/profile/my-voice (2026-11-18): read, edit, or pause My voice. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getMyVoice(createAdminClient(), user.id));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { note?: unknown; learning?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof b.note === "string") patch.my_voice = b.note.trim().replace(/\s+/g, " ").slice(0, 600) || null;
  if (typeof b.learning === "boolean") patch.my_voice_learning = b.learning;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json(await getMyVoice(admin, user.id));
}
