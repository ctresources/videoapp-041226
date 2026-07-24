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
 * Runs all spam heuristics against a name + email. Returns a user-facing
 * error message when something looks fake, or null when it passes.
 */
export function spamCheck(name: string, email: string): string | null {
  if (looksLikeRandomString(name)) return "Please enter your real full name.";
  const domain = email.toLowerCase().split("@")[1] ?? "";
  if (DISPOSABLE_DOMAINS.has(domain)) return "Please use a permanent email address.";
  if (isGmailDotsTrick(email)) return "Please use your primary Gmail address (without extra dots).";
  return null;
}
