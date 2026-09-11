import { createAdminClient } from "@/lib/supabase/admin";

/** The campaign calendar, while it is being built. */
export const CAMPAIGN_CALENDAR = "campaign_calendar";

/**
 * Whether a user has been granted a feature that is still behind a switch.
 *
 * Grants live in feature_access, which only the service role can write — a
 * profiles column would be a switch users could flip on their own row. Read
 * with the service client so the answer does not depend on the caller's
 * session either.
 */
export async function hasFeature(userId: string, feature: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("feature_access")
    .select("feature")
    .eq("user_id", userId)
    .eq("feature", feature)
    .maybeSingle();
  return !!data;
}
