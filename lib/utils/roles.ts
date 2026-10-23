import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who gets what (2026-10-23).
 *
 * - "admin": the owner. Everything, including the Admin panel.
 * - "staff": an assistant's own account. An admin's in-app perks (videos
 *   never charged, every feature unlocked) but no Admin panel, no admin
 *   tools, and a monthly video cap (profiles.staff_video_cap).
 *
 * Use hasAdminPerks for "uncapped, unlocked, not charged" and check
 * role === "admin" only for the Admin panel and owner-only tools.
 */
export function hasAdminPerks(role: string | null | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function isStaff(role: string | null | undefined): boolean {
  return role === "staff";
}

/** Start of this calendar month, UTC. */
function monthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Videos a staff account has started this month (failed ones don't count),
 * against its cap. Admin client required: it counts generated_videos.
 */
export async function staffVideosThisMonth(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin
    .from("generated_videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStartIso())
    .neq("render_status", "failed");
  return count ?? 0;
}

/** The refusal for a staff account at its cap, or null when it may go on. */
export async function staffCapMessage(
  admin: SupabaseClient,
  userId: string,
  role: string | null | undefined,
): Promise<string | null> {
  if (!isStaff(role)) return null;
  const { data } = await admin.from("profiles").select("staff_video_cap").eq("id", userId).single();
  const cap = (data as { staff_video_cap?: number } | null)?.staff_video_cap;
  const limit = typeof cap === "number" ? cap : 10;
  const used = await staffVideosThisMonth(admin, userId);
  if (used < limit) return null;
  return `You've made your ${limit} videos for this month. Ask the account owner to raise your limit, or make more next month.`;
}
