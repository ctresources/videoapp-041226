import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewUser } from "@/lib/email";
import { screenSignup, canonicalEmail } from "@/lib/spam-guards";
import { attributeReferral } from "@/lib/affiliate-attribution";
import { getCapacity, maybeNotifyCapacity } from "@/lib/capacity";

export async function POST(req: NextRequest) {
  const { email, password, fullName, refCode } = await req.json();

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Spam / bot screening ────────────────────────────────────────────────────
  // Includes the canonical-inbox check, so "j.o.h.n+x@gmail.com" can't collect
  // a second free video when "john@gmail.com" already has an account.
  const spam = await screenSignup(admin, { name: fullName, email });
  if (spam) return NextResponse.json({ error: spam }, { status: 400 });

  // Beta capacity. The cap governs the FREE VIDEO, not the door: once the 100
  // spots are gone a new account is still created, just without the free video,
  // so someone who wants to pay can. Refusing outright shut the only route to a
  // paying customer the moment the beta filled.
  const { open } = await getCapacity(admin);
  const paidOnly = !open;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Record the canonical inbox so a later signup under a different spelling
  // of the same address is recognised as a duplicate. The free video is taken
  // back in the same write when the beta is full — the column defaults to 1,
  // so this is what makes a post-cap account paid-only.
  await admin
    .from("profiles")
    .update({
      email_canonical: canonicalEmail(email),
      ...(paidOnly && { credits_remaining: 0 }),
    })
    .eq("id", data.user.id);

  // Deliberately not awaited — the owner notification must not slow signup.
  // The .catch() is load-bearing: an unhandled rejection from this floating
  // promise is fatal in Node >=15 and would kill the request mid-flight.
  notifyNewUser({ name: fullName, email, provider: "email" }).catch((err) =>
    console.error("[register] new-user notification failed:", err),
  );
  await maybeNotifyCapacity(admin);

  // Affiliate attribution (best-effort; profile row exists via handle_new_user)
  await attributeReferral(admin, data.user.id, email, refCode);

  // paidOnly tells the form to say so before the person goes looking for a free
  // video that was never granted.
  return NextResponse.json({ user_id: data.user.id, paidOnly });
}
