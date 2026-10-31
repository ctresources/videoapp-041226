import { sendWelcomeOnce } from "@/lib/welcome";
import { sendFreeFollowup } from "@/lib/free-followup";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") return null;
  return user;
}

export async function GET() {
  const admin_user = await verifyAdmin();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const [{ data: profiles }, { count: totalVideos }] = await Promise.all([
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.from("generated_videos").select("*", { count: "exact", head: true }),
  ]);

  const users = (profiles || []) as Array<Record<string, unknown>>;

  // Get video counts per user
  const { data: videoCounts } = await admin
    .from("generated_videos")
    .select("user_id")
    .in("user_id", users.map((u) => u.id));

  const countMap: Record<string, number> = {};
  (videoCounts || []).forEach((v: { user_id: string }) => {
    countMap[v.user_id] = (countMap[v.user_id] || 0) + 1;
  });

  // Affiliate status for the Affiliate column (2026-10-23). An application
  // is linked to an account on first login after approval, so match by
  // account first and fall back to the email it was made with.
  const { data: affiliateRows } = await admin.from("affiliates").select("user_id, email, status");
  const affByUser: Record<string, string> = {};
  const affByEmail: Record<string, string> = {};
  for (const a of (affiliateRows ?? []) as { user_id: string | null; email: string | null; status: string }[]) {
    if (a.user_id) affByUser[a.user_id] = a.status;
    if (a.email) affByEmail[a.email.toLowerCase()] = a.status;
  }

  // Time in the app (2026-10-30): last sign-in from auth, last active and
  // minutes over the last 30 days from the heartbeat (app_time_daily).
  const lastSignIn: Record<string, string> = {};
  for (let page = 1; page <= 20; page++) {
    const { data: au } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    for (const x of au?.users ?? []) if (x.last_sign_in_at) lastSignIn[x.id] = x.last_sign_in_at;
    if ((au?.users ?? []).length < 1000) break;
  }
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: timeRows } = await admin.from("app_time_daily").select("user_id, day, seconds, last_seen").gte("day", since30).limit(20000);
  const mins30: Record<string, number> = {};
  const seen: Record<string, string> = {};
  for (const r of (timeRows ?? []) as { user_id: string; seconds: number; last_seen: string }[]) {
    mins30[r.user_id] = (mins30[r.user_id] ?? 0) + Math.round(r.seconds / 60);
    if (!seen[r.user_id] || r.last_seen > seen[r.user_id]) seen[r.user_id] = r.last_seen;
  }

  const enriched = users.map((u) => ({
    ...u,
    last_sign_in_at: lastSignIn[u.id as string] ?? null,
    last_seen_at: seen[u.id as string] ?? (u.last_active_at as string | null) ?? null,
    minutes_30d: mins30[u.id as string] ?? 0,
    video_count: countMap[u.id as string] || 0,
    affiliate_status:
      affByUser[u.id as string]
      ?? (typeof u.email === "string" ? affByEmail[u.email.toLowerCase()] : undefined)
      ?? null,
  }));
  const proUsers = users.filter((u) => u.subscription_tier !== "free").length;

  return NextResponse.json({
    users: enriched,
    stats: {
      totalUsers: users.length,
      totalVideos: totalVideos ?? 0,
      proUsers,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const admin_user = await verifyAdmin();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { userId, role, subscription_tier, credits_remaining, suspended, staff_video_cap, send_welcome, send_followup } = body as {
    userId: string;
    /** Free-account follow-up 1, 2 or 3, sent by the owner (2026-10-23). */
    send_followup?: number;
    /** The Admin panel's Send welcome email button (2026-10-23). */
    send_welcome?: boolean;
    role?: string;
    /** A staff account's monthly video cap (2026-10-23). */
    staff_video_cap?: number;
    subscription_tier?: string;
    credits_remaining?: number;
    suspended?: boolean;
  };

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const admin = createAdminClient();

  // Send welcome email: once ever, same email as a new subscription gets.
  if (send_welcome === true) {
    const result = await sendWelcomeOnce(admin, userId);
    if (result === "failed") return NextResponse.json({ error: "The welcome email couldn't be sent. Try again." }, { status: 500 });
    const { data: row } = await admin.from("profiles").select("*").eq("id", userId).single();
    return NextResponse.json({ success: true, result, user: row });
  }

  // Free-account follow-up 1, 2 or 3: once each, only while they haven't made their free video.
  if (send_followup !== undefined) {
    if (send_followup !== 1 && send_followup !== 2 && send_followup !== 3) {
      return NextResponse.json({ error: "Follow-up must be 1, 2 or 3" }, { status: 400 });
    }
    const result = await sendFreeFollowup(admin, userId, send_followup);
    const errors: Record<string, [string, number]> = {
      failed: ["The follow-up couldn't be sent. Try again.", 500],
      already: [`Follow-up ${send_followup} was already sent.`, 409],
      opted_out: ["They turned these reminders off.", 409],
      not_eligible: ["Only free accounts that haven't made their free video get these.", 409],
    };
    if (errors[result]) return NextResponse.json({ error: errors[result][0] }, { status: errors[result][1] });
    const { data: row } = await admin.from("profiles").select("*").eq("id", userId).single();
    return NextResponse.json({ success: true, result, user: row });
  }

  const updates: Record<string, unknown> = {};

  if (role !== undefined) {
    if (!["user", "admin", "staff"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    updates.role = role;
  }
  if (subscription_tier !== undefined) {
    if (!["free", "starter", "agent", "pro", "agency"].includes(subscription_tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    updates.subscription_tier = subscription_tier;
  }
  if (credits_remaining !== undefined) {
    if (typeof credits_remaining !== "number" || credits_remaining < 0) return NextResponse.json({ error: "Invalid credits" }, { status: 400 });
    updates.credits_remaining = credits_remaining;
  }
  if (staff_video_cap !== undefined) {
    if (!Number.isInteger(staff_video_cap) || staff_video_cap < 0 || staff_video_cap > 500) {
      return NextResponse.json({ error: "Cap must be a whole number from 0 to 500" }, { status: 400 });
    }
    updates.staff_video_cap = staff_video_cap;
  }
  if (suspended !== undefined) {
    // Its own column now. Writing "suspended" into role destroyed the role —
    // reactivating always wrote "user", so a suspended admin came back
    // demoted — and nothing in the app ever read that value, which meant
    // suspending someone locked them out of precisely nothing.
    updates.suspended = suspended;
    updates.suspended_at = suspended ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  // Returns the row it wrote, because the admin table used to merge the
  // REQUEST payload into its local copy: { suspended: true } is not a field
  // the badge reads, so the badge never changed and admins clicked twice.
  const { data: updated, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("id, email, full_name, role, suspended, staff_video_cap, subscription_tier, credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: updated });
}
