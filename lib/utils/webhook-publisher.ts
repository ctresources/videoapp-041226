import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac } from "crypto";

export function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export type WebhookEvent =
  | "video.published"
  | "video.created"
  | "video.failed"
  | "listing.created"
  | "test";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  source: "SparkReels";
  data: Record<string, unknown>;
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Everything a "video published" message carries (2026-10-24, the owner's
 * ask): the video, plus its title, a short caption, the thumbnail and the
 * agent's name and email, so a GoHighLevel workflow can text or email it
 * with words, not a bare link. The Test button sends this same shape
 * (app/api/crm/webhooks/test), so the CRM can learn every field from it.
 */
export async function videoMessage(
  admin: Admin,
  userId: string,
  base: { video_id: string; video_url: string | null; video_type: string | null; project_id: string | null },
): Promise<Record<string, unknown>> {
  const [{ data: proj }, { data: prof }] = await Promise.all([
    base.project_id
      ? admin.from("projects").select("title, ai_script, seo_data, thumbnail_url").eq("id", base.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
  ]);
  const p = proj as { title: string | null; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null; thumbnail_url: string | null } | null;
  const a = prof as { full_name: string | null; email: string | null } | null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(p?.seo_data?.youtube_title) || str(p?.ai_script?.title) || str(p?.title);
  const caption = str(p?.ai_script?.hook) || str(p?.ai_script?.description) || str(p?.seo_data?.meta_description);
  return {
    ...base,
    title: title.slice(0, 200),
    caption: caption.slice(0, 500),
    thumbnail_url: p?.thumbnail_url && /^https?:\/\//.test(p.thumbnail_url) ? p.thumbnail_url : "",
    agent_name: a?.full_name?.trim() || "",
    agent_email: a?.email?.trim() || "",
  };
}

/**
 * Fire all active webhooks for a user that are subscribed to the given event.
 * Call this from API routes after video publish, creation, etc.
 * Fire-and-forget — does not block the caller.
 */
export async function publishWebhookEvent(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();

  const { data: webhooks } = await admin
    .from("crm_webhooks")
    .select("id, url, secret, events")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!webhooks?.length) return;

  // A finished video carries its title, caption, thumbnail and the agent too.
  // Never stops the message going out: on any trouble it goes as it came.
  if (event === "video.published" && typeof data.video_id === "string") {
    try {
      data = await videoMessage(admin, userId, {
        video_id: data.video_id,
        video_url: (data.video_url as string | null) ?? null,
        video_type: (data.video_type as string | null) ?? null,
        project_id: (data.project_id as string | null) ?? null,
      });
    } catch (err) {
      console.error("[webhook] adding video details failed:", err instanceof Error ? err.message : err);
    }
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    source: "SparkReels",
    data,
  };

  const body = JSON.stringify(payload);

  const fires = webhooks
    .filter((w) => (w.events as string[]).includes(event))
    .map(async (webhook) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "SparkReels/1.0",
        "X-VTV-Event": event,
        "X-VTV-Timestamp": payload.timestamp,
      };

      if (webhook.secret) {
        headers["X-VTV-Signature"] = `sha256=${signPayload(body, webhook.secret)}`;
      }

      try {
        await fetch(webhook.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(8000),
        });
      } catch (err) {
        // Log silently — never block the main flow
        console.error(`Webhook fire failed for ${webhook.id}:`, err);
      }
    });

  await Promise.allSettled(fires);
}
