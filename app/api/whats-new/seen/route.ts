import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LATEST_WHATS_NEW_ID } from "@/lib/data/whats-new";

/**
 * Marks the newest What's New update as seen for the caller (2026-10-28),
 * which clears the menu's NEW dot. Always the newest id from the server's own
 * list, never one sent by the browser. Written through the caller's session:
 * last_seen_whats_new is not a privileged column.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_whats_new: LATEST_WHATS_NEW_ID } as never)
    .eq("id", user.id);
  if (error) {
    console.error("[whats-new/seen] could not save:", error.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, seen: LATEST_WHATS_NEW_ID });
}
