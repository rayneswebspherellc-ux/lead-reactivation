/**
 * Encryption at rest, one key per agent.
 *
 * Every agent's saved data is encrypted with a key derived from the server's
 * master secret AND that agent's id (HKDF). So even if a bug ever handed
 * agent A a row belonging to agent B, A's key could not open it. The account
 * id is also bound into each ciphertext (AES-GCM associated data), so a row
 * copied between accounts fails to decrypt.
 *
 * Uses Web Crypto only, so it runs the same on Cloudflare Workers and Node.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function ownerKey(masterSecret: string, ownerId: string): Promise<CryptoKey> {
  if (masterSecret.length < 32) throw new Error("DATA_ENCRYPTION_SECRET must be at least 32 characters.");
  if (!ownerId) throw new Error("Missing owner.");
  const base = await crypto.subtle.importKey("raw", enc.encode(masterSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("lead-reactivation/v1"), info: enc.encode(`owner:${ownerId}`) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key: CryptoKey, ownerId: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(ownerId) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function open<T>(key: CryptoKey, ownerId: string, sealed: string): Promise<T> {
  const [v, iv, data] = sealed.split(".");
  if (v !== "v1" || !iv || !data) throw new Error("Unknown format.");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv), additionalData: enc.encode(ownerId) },
    key,
    unb64(data),
  );
  return JSON.parse(dec.decode(plain)) as T;
}
