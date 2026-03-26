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

  const enriched = users.map((u) => ({ ...u, video_count: countMap[u.id as string] || 0 }));
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

  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: "userId and role required" }, { status: 400 });
  if (!["user", "admin"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
