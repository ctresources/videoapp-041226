import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyGhlWorkflowRequest } from "@/lib/email";

/**
 * POST — "Ask for the workflow" on the GoHighLevel card in Settings
 * (2026-10-19, the owner's ask). Emails support with the agent's name and
 * address, Reply going to the agent, so the owner can send them the
 * ready-made GoHighLevel workflow.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = (profile as { full_name: string | null } | null)?.full_name?.trim() || user.email;

  const sent = await notifyGhlWorkflowRequest({ name, email: user.email });
  if (!sent) return NextResponse.json({ error: "The request didn't send. Try again in a minute." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
