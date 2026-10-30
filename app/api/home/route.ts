import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadHome } from "@/lib/home/data";

export const dynamic = "force-dynamic";

/** GET /api/home — the Home dashboard's data (lib/home/data.ts), for the signed-in agent. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await loadHome(createAdminClient(), user.id));
  } catch (err) {
    console.error("[home]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't load Home." }, { status: 500 });
  }
}
