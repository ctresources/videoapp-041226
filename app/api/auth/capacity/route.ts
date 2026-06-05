import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const MAX_USERS = 100;

export async function GET() {
  const admin = createAdminClient();
  const { count } = await admin.from("profiles").select("*", { count: "exact", head: true });
  const total = count ?? 0;
  return NextResponse.json({ open: total < MAX_USERS, count: total, max: MAX_USERS });
}
