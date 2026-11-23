import { CIRCLE_CREDIT_SOURCE, CIRCLE_DAILY_LIMIT, hasUnlimitedCircle } from "@/lib/plan-limits";
import { DEFAULT_TIME_ZONE, dayKey, isValidTimeZone, zonedToUtc } from "@/lib/utils/time-zone";

/**
 * Whether this account's free AI Avatar in Circle video for today is still
 * available (2026-11-22, the two-plan pricing). The day is the agent's own,
 * from their saved time zone. A failed render doesn't count, so they can try
 * again. Shared by the render, the allowance and the agent layer.
 */
export async function circleFreeToday(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  tier: string | null | undefined,
  timeZone: string | null | undefined,
): Promise<boolean> {
  if (!hasUnlimitedCircle(tier)) return false;
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const start = zonedToUtc(dayKey(new Date(), tz), "00:00", tz);
  const { count } = await admin
    .from("generated_videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .eq("metadata->>credit_source", CIRCLE_CREDIT_SOURCE)
    .neq("render_status", "failed");
  return (count ?? 0) < CIRCLE_DAILY_LIMIT;
}
