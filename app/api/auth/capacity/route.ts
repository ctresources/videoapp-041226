import { createAdminClient } from "@/lib/supabase/admin";
import { getCapacity } from "@/lib/capacity";
import { NextResponse } from "next/server";

export async function GET() {
  const capacity = await getCapacity(createAdminClient());
  return NextResponse.json(capacity);
}
