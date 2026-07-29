import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewUser } from "@/lib/email";
import { spamCheck } from "@/lib/spam-guards";
import { attributeReferral } from "@/lib/affiliate-attribution";
import { getCapacity, maybeNotifyCapacity } from "@/lib/capacity";

export async function POST(req: NextRequest) {
  const { email, password, fullName, refCode } = await req.json();

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Spam / bot heuristic checks ──────────────────────────────────────────────
  const spam = spamCheck(fullName, email);
  if (spam) return NextResponse.json({ error: spam }, { status: 400 });

  const admin = createAdminClient();

  // Beta capacity. This check used to be missing here entirely, so the cap
  // could be sidestepped by using the email form instead of Google. Checked
  // BEFORE createUser so a refused signup leaves nothing behind.
  const { open, max } = await getCapacity(admin);
  if (!open) {
    return NextResponse.json(
      { error: `All ${max} beta spots are taken. Join the waitlist and we'll email you when a spot opens.`, code: "beta_full" },
      { status: 403 },
    );
  }

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
  await maybeNotifyCapacity(admin);

  // Affiliate attribution (best-effort; profile row exists via handle_new_user)
  await attributeReferral(admin, data.user.id, email, refCode);

  return NextResponse.json({ user_id: data.user.id });
}
