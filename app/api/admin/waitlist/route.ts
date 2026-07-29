import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCapacity } from "@/lib/capacity";
import { NextResponse } from "next/server";

/** Admin-only: the beta waitlist plus current capacity. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if ((me as { role?: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: entries }, capacity] = await Promise.all([
    admin
      .from("beta_waitlist")
      .select("id, email, full_name, source, notified_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    getCapacity(admin),
  ]);

  return NextResponse.json({ entries: entries ?? [], capacity });
}
