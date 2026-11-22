import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { createPersonalKey } from "@/lib/agent/auth/personal-key";
import { ALL_SCOPES, type Scope } from "@/lib/agent/types";

/**
 * Settings → Connections (2026-11-22, the owner's approved mockup).
 *
 * GET     the AI apps connected and the personal access keys, active only.
 * POST    { action: "create_key", name, scopes, expiresInDays } → the key, shown once.
 *         { action: "reconnect", clientId } → clears a Disconnect when the
 *         person approves that app again on the consent page.
 * DELETE  { id } → Disconnect an AI app (also revokes its OAuth grant) or revoke a key.
 *
 * Connecting is for paid plans; disconnecting and revoking always work.
 */
export const dynamic = "force-dynamic";

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await createAdminClient()
    .from("agent_connections")
    .select("id, kind, client_id, client_name, scopes, key_prefix, created_at, last_used_at, expires_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { kind: string; expires_at: string | null }[];
  const live = rows.filter((r) => !r.expires_at || Date.parse(r.expires_at) > Date.now());
  return NextResponse.json({
    apps: live.filter((r) => r.kind === "oauth"),
    keys: live.filter((r) => r.kind === "key"),
  });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; name?: string; scopes?: string[]; expiresInDays?: number | null; clientId?: string };
  const admin = createAdminClient();

  const { data: prof } = await supabase.from("profiles").select("subscription_tier, role").eq("id", user.id).single();
  const paid = isPaidLevel(getAccessLevel((prof as { subscription_tier: string | null; role: string | null } | null) ?? {}));

  if (b.action === "reconnect") {
    if (!paid || !b.clientId) return NextResponse.json({ ok: false });
    await admin.from("agent_connections").update({ revoked_at: null }).eq("user_id", user.id).eq("client_id", b.clientId).eq("kind", "oauth");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "create_key") {
    if (!paid) {
      return NextResponse.json({ error: "AI connections come with a SparkReels plan.", code: "paid_plan_required" }, { status: 403 });
    }
    const scopes = (b.scopes ?? []).filter((s): s is Scope => ALL_SCOPES.includes(s as Scope));
    if (!scopes.length) return NextResponse.json({ error: "Pick at least one thing the key can do." }, { status: 400 });
    const days = [30, 90, 365].includes(Number(b.expiresInDays)) ? Number(b.expiresInDays) : null;
    const k = await createPersonalKey(user.id, { name: b.name ?? "", scopes, expiresInDays: days });
    return NextResponse.json({ id: k.id, key: k.key, prefix: k.prefix });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("kind, client_id")
    .maybeSingle();
  const row = data as { kind: string; client_id: string | null } | null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // An AI app's sign-in is ended at the OAuth server too, so its tokens stop at once.
  if (row.kind === "oauth" && row.client_id) {
    await supabase.auth.oauth.revokeGrant({ clientId: row.client_id }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
