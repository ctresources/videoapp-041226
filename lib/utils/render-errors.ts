/**
 * Turn a render provider's error into a sentence an agent can act on.
 *
 * Two problems this solves at once. The raw text names the provider and its
 * endpoint ("HeyGen Video Agent v3 failed (400): {...}"), which means nothing
 * to someone selling houses. And the useful part — *which* thing broke — was
 * buried in a JSON blob nobody was reading.
 *
 * The codes come from the provider's documented error list. Everything not
 * recognised falls back to the generic sentence rather than leaking the raw
 * text: an unrecognised message is exactly the one most likely to be internal.
 */

/** The one message shown whenever we cannot say anything more specific. */
export const GENERIC_RENDER_ERROR =
  "We couldn't render this right now. Your credit has been returned — try again.";

type Rule = { match: RegExp; message: string };

const RULES: Rule[] = [
  {
    // A URL we handed over couldn't be fetched — the logo, or one of the
    // photos. This is the one failure the agent can actually fix themselves,
    // and it used to arrive as a generic "render failed".
    match: /download_failed|could not (be )?download|failed to download/i,
    message:
      "We couldn't load one of the images for this video. Check your logo and photos in Settings, then try again.",
  },
  {
    match: /voice_unavailable|voice_expired|voice.*(not available|failed processing)/i,
    message:
      "Your voice isn't available right now. Re-record it in Settings, then try again.",
  },
  {
    match: /avatar_not_found|avatar_group_not_found|no usable image/i,
    message:
      "We couldn't find your avatar. Open Settings to check your photos, then try again.",
  },
  {
    match: /resource_limit_(reached|exceeded)/i,
    message:
      "Your account hit a limit on this kind of render. Try again shortly, or contact support if it keeps happening.",
  },
  {
    match: /gateway_timeout|timed out|timeout/i,
    message:
      "A file took too long to load and the render stopped. Your credit has been returned — try again.",
  },
  {
    match: /invalid_parameter|validation/i,
    message:
      "Something in this video's setup was rejected. Check your photos and settings, then try again.",
  },
];

/**
 * @param raw the provider's message, or null when it gave us nothing
 * @returns a sentence safe to put on screen — never the raw text
 */
export function friendlyRenderError(raw: string | null | undefined): string {
  if (!raw) return GENERIC_RENDER_ERROR;
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message;
  }
  return GENERIC_RENDER_ERROR;
}

/**
 * True when the provider recognisably told us what went wrong, so a caller can
 * decide whether the raw text is worth keeping as a diagnostic.
 */
export function hasKnownRenderError(raw: string | null | undefined): boolean {
  return !!raw && RULES.some((r) => r.match.test(raw));
}
