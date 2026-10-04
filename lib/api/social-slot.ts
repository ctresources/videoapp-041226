import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteProfile, profileUsername, uploadPostConfigured } from "@/lib/api/upload-post";

/**
 * Gives an account's publishing slot back.
 *
 * The publishing plan holds a fixed number of customers and refuses the next
 * one outright, so a departed customer still holding a slot is a present one
 * turned away. Deleting their profile with the partner frees it at once, and
 * takes their connections with it: if they come back they connect again.
 * Their past posts stay where they are, on the platforms and in our records.
 *
 * Never throws. It runs inside the Stripe webhook and a nightly job, and
 * neither a cancellation nor the rest of a sweep should fail over a slot.
 * Returns whether a slot was actually released.
 */
export async function releaseSocialSlot(admin: SupabaseClient, userId: string, why: string): Promise<boolean> {
  if (!uploadPostConfigured()) return false;
  try {
    const { data } = await admin
      .from("profiles")
      .select("social_profile_created_at")
      .eq("id", userId)
      .maybeSingle();
    if (!(data as { social_profile_created_at: string | null } | null)?.social_profile_created_at) return false;

    // The partner first, then our record of it: if the delete fails the flag
    // stays set, and the nightly sweep tries again rather than losing track.
    await deleteProfile(profileUsername(userId));
    await admin.from("profiles").update({ social_profile_created_at: null }).eq("id", userId);
    console.log(`[social-slot] released for ${userId} (${why})`);
    return true;
  } catch (err) {
    console.error(`[social-slot] release failed for ${userId} (${why}):`, err instanceof Error ? err.message : err);
    return false;
  }
}
