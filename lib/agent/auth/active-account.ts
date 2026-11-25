import type { SupabaseClient } from "@supabase/supabase-js";
import { areLinked } from "@/lib/accounts/links";

/**
 * The account an AI connection acts on (2026-11-25, linked accounts): the
 * one that connected it, or a linked account it switched to. A switch to an
 * account that is no longer linked is undone here, so Unlink takes effect on
 * the very next call.
 */
export async function activeAccount(
  admin: SupabaseClient,
  connectionId: string,
  ownerId: string,
  activeId: string | null,
): Promise<string> {
  if (!activeId || activeId === ownerId) return ownerId;
  if (await areLinked(admin, ownerId, activeId)) return activeId;
  await admin.from("agent_connections").update({ active_user_id: null }).eq("id", connectionId);
  return ownerId;
}
