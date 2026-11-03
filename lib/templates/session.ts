import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/utils/feature-access";
import { TEMPLATE_FEATURE } from "@/lib/templates/designs";

/** The signed-in agent, if video templates are switched on for them (testing, 2026-11-02). */
export async function templateSession(): Promise<
  | { ok: true; user: { id: string; email: string | null }; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasFeature(user.id, TEMPLATE_FEATURE))) {
    return { ok: false, response: NextResponse.json({ error: "Video templates aren't on for your account yet." }, { status: 403 }) };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? null }, admin: createAdminClient() };
}
