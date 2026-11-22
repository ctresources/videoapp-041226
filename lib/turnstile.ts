/**
 * Bot check on email signup (2026-11-22, the owner's ask after a bot account
 * "uTmzisYUYnAdfDEc" got in). Cloudflare Turnstile: most people never see a
 * puzzle; the widget hands the form a token and this asks Cloudflare whether
 * it is genuine.
 *
 * Until TURNSTILE_SECRET_KEY is set in Vercel the check is skipped, so signup
 * keeps working before the keys exist.
 */
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: unknown, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (e) {
    // Cloudflare unreachable: let the person in rather than lock every signup
    // out. The name/email rules and the phone requirement still apply.
    console.error("[turnstile] verify failed:", e instanceof Error ? e.message : e);
    return true;
  }
}
