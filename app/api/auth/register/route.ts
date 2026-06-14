import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewUser } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email, password, fullName } = await req.json();

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  notifyNewUser({ name: fullName, email, provider: "email" });

  return NextResponse.json({ user_id: data.user.id });
}
