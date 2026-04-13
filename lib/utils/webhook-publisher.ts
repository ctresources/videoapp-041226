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
  source: "VoiceToVideos.AI";
  data: Record<string, unknown>;
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

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    source: "VoiceToVideos.AI",
    data,
  };

  const body = JSON.stringify(payload);

  const fires = webhooks
    .filter((w) => (w.events as string[]).includes(event))
    .map(async (webhook) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "VoiceToVideos.AI/1.0",
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
