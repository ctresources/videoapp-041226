import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { signPayload, videoMessage } from "@/lib/utils/webhook-publisher";

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

  /**
   * The same fields a real finished-video message has (2026-10-24), so a CRM
   * that learns its fields from a sample (GoHighLevel does) can be set up
   * before the first video. Filled from the agent's latest finished video
   * when there is one, else with sample words.
   */
  const { data: latest } = await admin
    .from("generated_videos")
    .select("id, video_url, video_type, project_id")
    .eq("user_id", user.id)
    .eq("render_status", "completed")
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = latest as { id: string; video_url: string | null; video_type: string | null; project_id: string | null } | null;
  const data = await videoMessage(admin, user.id, v
    ? { video_id: v.id, video_url: v.video_url, video_type: v.video_type, project_id: v.project_id }
    : { video_id: "test", video_url: "https://www.sparkreels.ai", video_type: "reel_9x16", project_id: null });
  if (!v) {
    data.title = "Test video from SparkReels";
    data.caption = `Your webhook "${webhook.name}" is working. Your real videos will arrive with these same fields.`;
  }
  if (!data.agent_email) data.agent_email = user.email ?? "";

  const payload = {
    event: "test",
    timestamp: new Date().toISOString(),
    source: "SparkReels",
    data,
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "SparkReels/1.0",
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
