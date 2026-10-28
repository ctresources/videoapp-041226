import { createClient } from "@/lib/supabase/server";
import { canAccessFeature, getAccessLevel, type AccessLevel, type FeatureKey } from "@/lib/access";

/**
 * The signed-in account's access level, read on the server through the
 * caller's own session (profiles RLS lets a user read their own row).
 */
export async function getServerAccess(): Promise<{ level: AccessLevel; userId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { level: "visitor", userId: null };
  const { data } = await supabase
    .from("profiles")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .single();
  // A signed-in account whose profile can't be read is treated as free, never paid.
  return { level: getAccessLevel((data as { subscription_tier: string | null; role: string | null } | null) ?? {}), userId: user.id };
}

export async function serverCanAccess(feature: FeatureKey): Promise<boolean> {
  const { level } = await getServerAccess();
  return canAccessFeature(level, feature);
}
