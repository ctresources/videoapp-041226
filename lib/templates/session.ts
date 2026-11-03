import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The signed-in agent. Quick Reels Templates are open to every account since
 * 2026-11-03 (the owner's call); the video_templates switch is no longer read.
 */
export async function templateSession(): Promise<
  | { ok: true; user: { id: string; email: string | null }; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, user: { id: user.id, email: user.email ?? null }, admin: createAdminClient() };
}
