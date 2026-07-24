import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewUser } from "@/lib/email";
import { spamCheck } from "@/lib/spam-guards";
import { attributeReferral } from "@/lib/affiliate-attribution";

export async function POST(req: NextRequest) {
  const { email, password, fullName, refCode } = await req.json();

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Spam / bot heuristic checks ──────────────────────────────────────────────
  const spam = spamCheck(fullName, email);
  if (spam) return NextResponse.json({ error: spam }, { status: 400 });

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

  // Affiliate attribution (best-effort; profile row exists via handle_new_user)
  await attributeReferral(admin, data.user.id, email, refCode);

  return NextResponse.json({ user_id: data.user.id });
}
