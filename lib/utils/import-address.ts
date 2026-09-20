/**
 * The private address an agent forwards articles to.
 *
 * The token in the address is what identifies the account, so it is the only
 * secret protecting the mailbox: anyone who learns it can drop text into that
 * account's import list. 12 base-32 characters is 60 bits, which is not
 * guessable, and the address can be reset from Settings if it ends up somewhere
 * public. Deliberately NOT derived from the user id or email — both are
 * discoverable, and a derived address could never be reset.
 *
 * The sender is not checked. A forward arrives from whatever inbox the agent
 * happened to be in, often not the one they signed up with, and a From header
 * can be typed by hand anyway — so it would refuse real mail while stopping
 * nobody.
 */

/** Ambiguous characters left out: an address gets read aloud and typed by hand. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 12;

export const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.sparkreels.ai";

export function generateImportToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function importAddressFor(token: string): string {
  return `import-${token}@${INBOUND_DOMAIN}`;
}

/**
 * The token out of whichever recipient address carried it.
 *
 * Checked against every address the delivery names, because a forward can be
 * sent to several people at once and can arrive via a rule that keeps the
 * original recipient in `to` — so ours may be in `cc` or only in `received_for`.
 */
export function tokenFromRecipients(addresses: (string | null | undefined)[]): string | null {
  for (const raw of addresses) {
    if (!raw) continue;
    const match = new RegExp(`import-([${ALPHABET}]{${TOKEN_LENGTH}})@`, "i").exec(raw);
    if (match) return match[1].toLowerCase();
  }
  return null;
}
