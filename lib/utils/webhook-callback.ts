/**
 * Builds the callback URL handed to HeyGen when submitting a render.
 *
 * HeyGen signs deliveries only to endpoints registered via
 * POST /v3/webhooks/endpoints, which issues a signing secret. We use the other
 * mechanism — a per-request `callback_url` — and those deliveries carry no
 * signature at all: production logs show no Heygen-Signature header on any
 * event, and HeyGen never issues a secret for them. That left the webhook
 * unauthenticated, so a forged avatar_video.fail could refund a user's credits
 * on demand.
 *
 * Until the render pipeline moves to a registered endpoint, the URL itself
 * carries a shared secret and the handler compares it in constant time.
 * Weaker than HMAC — the token sits in a URL rather than a signature over the
 * body — but it closes the forgery hole without a HeyGen-side migration.
 *
 * Submission and validation both read HEYGEN_WEBHOOK_TOKEN, so setting the env
 * var switches protection on at both ends at once; there is never a window
 * where the handler demands a token the URL doesn't carry. Renders already
 * in flight when the var is first set will fail their callback — recoverable
 * via /api/video/refresh-url, which re-stores and re-processes them.
 */
export function buildCallbackUrl(): string | undefined {
  // Once a webhook endpoint is registered with HeyGen it delivers every event
  // on the account, so continuing to pass a per-request callback_url would
  // deliver each event TWICE — and two near-simultaneous deliveries can both
  // clear the already-stored guard before either finishes writing. Setting this
  // flag at the same time as registering keeps delivery single-path.
  // callback_id is a separate parameter and is still sent: registered payloads
  // carry it through, so row matching is unaffected.
  if (process.env.HEYGEN_WEBHOOK_REGISTERED === "true") return undefined;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  // No public URL (or local dev) means HeyGen has nowhere to call back to.
  if (!appUrl || appUrl.includes("localhost")) return undefined;

  const base = `${appUrl}/api/video/webhook`;
  const token = process.env.HEYGEN_WEBHOOK_TOKEN;
  return token ? `${base}?k=${encodeURIComponent(token)}` : base;
}
