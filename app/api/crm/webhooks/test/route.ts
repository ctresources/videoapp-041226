import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { signPayload } from "@/lib/utils/webhook-publisher";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: webhook } = await admin
    .from("crm_webhooks")
    .select("url, secret, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const payload = {
    event: "test",
    timestamp: new Date().toISOString(),
    source: "VoiceToVideos.AI",
    data: {
      message: `Test webhook from VoiceToVideos.AI — webhook "${webhook.name}" is working correctly.`,
      agent_name: (profile as { full_name: string } | null)?.full_name || "Agent",
      agent_email: user.email,
    },
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "VoiceToVideos.AI/1.0",
    "X-VTV-Event": "test",
  };

  if (webhook.secret) {
    headers["X-VTV-Signature"] = `sha256=${signPayload(body, webhook.secret)}`;
  }

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Request failed",
    });
  }
}
