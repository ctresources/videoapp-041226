import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { spamCheck } from "@/lib/spam-guards";

/** Public endpoint — anyone can join the waitlist once the beta is full. */
export async function POST(req: NextRequest) {
  const { email, fullName, source } = await req.json() as {
    email?: string; fullName?: string; source?: string;
  };

  const clean = (email ?? "").trim().toLowerCase();
  if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const spam = spamCheck(fullName ?? "waitlist", clean);
  if (spam) return NextResponse.json({ error: spam }, { status: 400 });

  const admin = createAdminClient();

  // Re-submitting the same address is not an error — refresh the row and
  // report success, so the person isn't told something went wrong.
  const { error } = await admin
    .from("beta_waitlist")
    .upsert(
      { email: clean, full_name: fullName?.trim() || null, source: source ?? "beta_page" },
      { onConflict: "email" },
    );

  if (error) {
    console.error("[waitlist] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save your spot. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
