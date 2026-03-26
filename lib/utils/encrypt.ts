// AES-256-GCM token encryption for storing OAuth tokens safely in Supabase
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

function getKeyMaterial(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY env variable not set");
  return key;
}

async function deriveKey(keyMaterial: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(keyMaterial.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", rawKey, { name: ALGORITHM }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await deriveKey(getKeyMaterial());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, enc.encode(plaintext));
  // Combine iv + encrypted and base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return Buffer.from(combined).toString("base64");
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await deriveKey(getKeyMaterial());
  const combined = Buffer.from(ciphertext, "base64");
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}
