// Shared spam / bot heuristics for public signup surfaces (user registration
// and affiliate applications). Extracted so both entry points enforce the same
// rules rather than drifting apart.

// Known disposable / temp-mail domains commonly used for spam signups.
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "trashmail.com", "yopmail.com",
  "throwam.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.net", "guerrillamail.org", "spam4.me", "getairmail.com",
  "fakeinbox.com", "maildrop.cc", "dispostable.com", "mailnull.com",
  "spamgourmet.com", "trashmail.at", "trashmail.me", "trashmail.io",
  "tempmail.com", "temp-mail.org", "throwaway.email", "discard.email",
  "mailnesia.com", "spamhereplease.com", "discardmail.com",
  // Added after reviewing real signups — the free video is worth farming.
  "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "tempmailo.com", "tempr.email", "temp-mail.io", "emailondeck.com",
  "mohmal.com", "moakt.com", "mytemp.email", "burnermail.io",
  "anonaddy.com", "simplelogin.io", "33mail.com", "spambog.com",
  "mailcatch.com", "inboxkitten.com", "tempinbox.com", "fakemail.net",
  "trash-mail.com", "wegwerfmail.de", "einrot.com", "cuvox.de",
  "dayrep.com", "armyspy.com", "teleworm.us", "rhyta.com", "jourrapide.com",
  "gustr.com", "superrito.com", "fleckens.hu", "linshiyouxiang.net",
  "vomoto.com", "yopmail.fr", "yopmail.net", "nowmymail.com",
]);

/**
 * Returns true when a name looks like a randomly-generated string rather
 * than a real person's name (e.g. "rRGbqkCiXveBrqTRW"). All heuristics must
 * fire together to avoid false positives:
 *  - No whitespace (no first+last or multi-word name)
 *  - Longer than 10 characters
 *  - Uppercase ratio between 20% and 80% (random mixed-case)
 *  - Vowel ratio below 25%
 */
export function looksLikeRandomString(name: string): boolean {
  const trimmed = name.trim();
  if (/\s/.test(trimmed)) return false;
  if (trimmed.length <= 10) return false;
  const upper = (trimmed.match(/[A-Z]/g) || []).length;
  const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (letters === 0) return false;
  const upperRatio = upper / letters;
  if (upperRatio < 0.2 || upperRatio > 0.8) return false;
  const vowels = (trimmed.match(/[aeiouAEIOU]/g) || []).length;
  return vowels / letters < 0.25;
}

/**
 * Returns true when a Gmail address is using the dots trick to obscure a real
 * address — multiple 1–3 char segments joined by dots,
 * e.g. "o.veda.c.i.y.u.so9.2@gmail.com".
 */
export function isGmailDotsTrick(email: string): boolean {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain || !["gmail.com", "googlemail.com"].includes(domain)) return false;
  const parts = local.split(".");
  if (parts.length < 4) return false;
  const shortParts = parts.filter((p) => p.length <= 2).length;
  return shortParts / parts.length >= 0.5;
}

/**
 * Providers that ignore dots and/or "+tag" suffixes, so many written forms
 * all deliver to one real inbox.
 */
const DOT_INSENSITIVE = new Set(["gmail.com", "googlemail.com"]);
const PLUS_TAG_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "proton.me", "protonmail.com", "icloud.com", "fastmail.com",
]);

/**
 * Reduces an address to the single inbox it actually reaches.
 *
 * "J.o.h.n+promo@Gmail.com" and "john@gmail.com" are the same mailbox, which
 * is how one person collects an unlimited number of free videos. Storing this
 * alongside the raw address lets signup refuse a second account for an inbox
 * that already has one.
 */
export function canonicalEmail(email: string): string {
  const raw = (email ?? "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 1) return raw;

  let local = raw.slice(0, at);
  const domain = raw.slice(at + 1);

  if (PLUS_TAG_DOMAINS.has(domain)) local = local.split("+")[0];
  if (DOT_INSENSITIVE.has(domain)) local = local.replace(/\./g, "");
  // googlemail and gmail are the same service.
  const canonDomain = domain === "googlemail.com" ? "gmail.com" : domain;

  return `${local}@${canonDomain}`;
}

/**
 * True when the local part looks machine-generated rather than chosen:
 * long, and either almost all digits or a low-vowel consonant soup.
 * Deliberately conservative — real addresses like "jsmith2024" must pass.
 */
export function looksLikeThrowawayLocal(email: string): boolean {
  const local = (email.toLowerCase().split("@")[0] ?? "").replace(/[.+_-]/g, "");
  if (local.length < 12) return false;

  const digits = (local.match(/\d/g) || []).length;
  if (digits / local.length > 0.6) return true;

  const letters = (local.match(/[a-z]/g) || []).length;
  if (letters < 8) return false;
  const vowels = (local.match(/[aeiou]/g) || []).length;
  return vowels / letters < 0.2;
}

/**
 * Runs all spam heuristics against a name + email. Returns a user-facing
 * error message when something looks fake, or null when it passes.
 */
export function spamCheck(name: string, email: string): string | null {
  if (looksLikeRandomString(name)) return "Please enter your real full name.";

  const lower = (email ?? "").toLowerCase();
  const domain = lower.split("@")[1] ?? "";

  if (DISPOSABLE_DOMAINS.has(domain)) return "Please use a permanent email address.";
  // Subdomains of temp-mail services, e.g. "inbox.tempmail.com". Array.from
  // rather than iterating the Set directly — the tsconfig target predates
  // downlevel Set iteration.
  const isDisposableSubdomain = Array.from(DISPOSABLE_DOMAINS).some((d) => domain.endsWith(`.${d}`));
  if (isDisposableSubdomain) return "Please use a permanent email address.";
  if (isGmailDotsTrick(email)) return "Please use your primary Gmail address (without extra dots).";
  if (looksLikeThrowawayLocal(email)) return "Please use your regular email address.";

  return null;
}

/**
 * Full signup screening: the static heuristics above, plus a check that this
 * inbox doesn't already have an account under a different spelling.
 *
 * Used by BOTH signup paths. Google OAuth previously ran no screening at all,
 * which is how the dotted-Gmail accounts got in — /beta offered Google only,
 * so in practice almost every signup skipped the guard entirely.
 *
 * `excludeUserId` is for the OAuth path, where the account already exists by
 * the time we can check; without it a user would collide with themselves.
 */
export async function screenSignup(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  { name, email, excludeUserId }: { name: string; email: string; excludeUserId?: string },
): Promise<string | null> {
  const basic = spamCheck(name, email);
  if (basic) return basic;

  const canonical = canonicalEmail(email);
  let query = admin.from("profiles").select("id").eq("email_canonical", canonical).limit(1);
  if (excludeUserId) query = query.neq("id", excludeUserId);

  const { data } = await query;
  if (data?.length) {
    return "An account already exists for this email address. Please sign in instead.";
  }
  return null;
}
