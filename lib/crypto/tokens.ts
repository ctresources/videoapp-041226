import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM for OAuth tokens at rest.
 *
 * A YouTube refresh token is a long-lived credential: it grants upload access
 * to a user's channel until they revoke it. Storing it as readable text means
 * anyone with a copy of the database — a backup, a support export, a leaked
 * service-role key — can publish to every connected channel.
 *
 * ROLLOUT: this is deliberately inert until TOKEN_ENCRYPTION_KEY is set. With
 * no key configured encryptToken() returns null and callers fall back to the
 * existing plaintext columns, so behaviour is byte-for-byte what it was. Once
 * the key exists, new writes are encrypted and existing plaintext rows migrate
 * the next time their token is read or refreshed. That ordering matters:
 * setting the key must never be able to lock anyone out of a channel they had
 * already connected.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const PREFIX = "v1"; // lets a future scheme be told apart without guessing

/**
 * Reads and validates the key. Accepts base64 or hex, and must decode to
 * exactly 32 bytes — a shorter key would silently weaken the cipher.
 */
function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  const decoded = /^[0-9a-fA-F]{64}$/.test(raw.trim())
    ? Buffer.from(raw.trim(), "hex")
    : Buffer.from(raw.trim(), "base64");

  if (decoded.length !== 32) {
    // Throwing here rather than falling back to plaintext: a key that is
    // present but wrong is a misconfiguration to fix, not to paper over.
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${decoded.length}). ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }
  return decoded;
}

/** True when encryption is configured. */
export function encryptionEnabled(): boolean {
  return getKey() !== null;
}

/**
 * Encrypts a token. Returns null when no key is configured, which callers
 * treat as "store it the old way".
 *
 * Output: v1:<iv>:<authTag>:<ciphertext>, all base64. The tag is what makes
 * this authenticated — decryption fails loudly if the value was tampered with.
 */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const key = getKey();
  if (!key) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** A value produced by encryptToken, as opposed to a raw token. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

/**
 * Decrypts a stored value.
 *
 * Anything not carrying the v1 prefix is returned unchanged — that is how
 * rows written before the key existed keep working. Throws if a value IS
 * encrypted but cannot be decrypted, since silently returning a broken token
 * would surface later as a confusing YouTube API error.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored;

  const key = getKey();
  if (!key) {
    throw new Error(
      "Found an encrypted token but TOKEN_ENCRYPTION_KEY is not set. " +
        "The key was removed or changed; restore it to read existing tokens.",
    );
  }

  const [, ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted token: expected v1:<iv>:<tag>:<data>");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
