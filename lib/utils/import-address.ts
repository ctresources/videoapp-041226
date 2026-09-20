/**
 * The private address an agent forwards articles to.
 *
 * Shaped `firstname-k7m3qz@`, which is two jobs at once. The name half is there
 * to be recognised: this address is read in Settings and picked out of an
 * autocomplete list, and a wall of random characters told nobody whose it was
 * or whether it was the right one. The random half is the security: it is the
 * ONLY thing standing between this mailbox and anyone who can guess an address,
 * because the sender is not checked.
 *
 * Six characters from a 31-letter alphabet is about 900 million, which is far
 * past worth-attacking for a mailbox whose worst case is junk text appearing in
 * a list the agent chooses from. A guessable address — plain `carmella@` — was
 * the alternative, and it would have needed a sender allowlist to be safe,
 * which silently drops forwards from any inbox not on the list.
 *
 * The sender is deliberately not checked. A forward arrives from whatever inbox
 * the agent happened to be in, often not the one they signed up with, and a
 * From header can be typed by hand anyway — checking it would refuse real mail
 * while stopping nobody.
 */

/** Ambiguous characters left out: an address gets read aloud and typed by hand. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SUFFIX_LENGTH = 6;

/** Long enough to be recognisable, short enough to type on a phone. */
const MAX_NAME_LENGTH = 12;

export const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.sparkreels.ai";

/**
 * The name half. A first name where there is one, otherwise the part of their
 * sign-in address before the @ — and "spark" when neither yields letters, which
 * keeps the address valid for an account with a name we cannot transliterate.
 */
export function nameSlug(fullName?: string | null, email?: string | null): string {
  const fromName = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const fromEmail = (email ?? "").split("@")[0] ?? "";
  for (const candidate of [fromName, fromEmail]) {
    const slug = candidate
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")  // é → e, so the address stays ASCII
      .replace(/[^a-z0-9]/g, "")
      .slice(0, MAX_NAME_LENGTH);
    if (slug.length >= 2) return slug;
  }
  return "spark";
}

function randomSuffix(): string {
  const bytes = new Uint8Array(SUFFIX_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * The whole local part, which is what gets stored: the name is baked in rather
 * than re-derived at read time, so changing your name in Settings cannot
 * silently break an address you have already given out.
 */
export function generateImportToken(fullName?: string | null, email?: string | null): string {
  return `${nameSlug(fullName, email)}-${randomSuffix()}`;
}

export function importAddressFor(token: string): string {
  return `${token}@${INBOUND_DOMAIN}`;
}

/**
 * The token out of whichever recipient address carried it.
 *
 * Checked against every address the delivery names, because a forward can be
 * sent to several people at once and can arrive via a rule that keeps the
 * original recipient in `to` — so ours may be in `cc` or only in `received_for`.
 *
 * Returns candidates rather than one match: the local part is taken from any
 * recipient at our inbound domain, and the caller decides which is a real
 * account. Anything else in the To line is somebody else's mail.
 */
export function tokensFromRecipients(addresses: (string | null | undefined)[]): string[] {
  const domain = INBOUND_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "+" is in the class so that plus-addressing is captured and then stripped
  // below. Left out, the match started AFTER the plus and the tag itself was
  // read as the token: carmella-k7m3qz+news@ looked like an account called
  // "news".
  const at = new RegExp(`([a-z0-9][a-z0-9._+-]{1,63})@${domain}`, "gi");
  const found: string[] = [];
  for (const raw of addresses) {
    if (!raw) continue;
    at.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = at.exec(raw)) !== null) {
      // Gmail's plus-addressing and a trailing dot are both things a mail
      // system can add on the way through; neither is part of the token.
      const local = match[1].toLowerCase().split("+")[0].replace(/\.$/, "");
      if (!found.includes(local)) found.push(local);
    }
  }
  return found;
}
