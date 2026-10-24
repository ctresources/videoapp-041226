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

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = (profile as { full_name: string | null } | null)?.full_name?.trim() || user.email;

  // Listed in Admin → Emails (2026-10-24), as well as the email to support.
  // A second press while one is still waiting adds no new row.
  const { count } = await admin
    .from("ghl_workflow_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "waiting");
  const listed = (count ?? 0) > 0 || !(await admin
    .from("ghl_workflow_requests")
    .insert({ user_id: user.id, name, email: user.email })).error;

  const sent = await notifyGhlWorkflowRequest({ name, email: user.email });
  if (!sent && !listed) return NextResponse.json({ error: "The request didn't send. Try again in a minute." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
