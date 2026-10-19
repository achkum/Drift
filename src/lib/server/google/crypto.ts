// OWNER: sync agent. AES-256-GCM sealing for cookie values (node:crypto, server only).
//
// Format: "v1.<iv>.<ciphertext><tag>" (base64url). The cookie name is bound in as additional
// authenticated data, so a sealed value cannot be moved from one cookie to another.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function seal(key: Buffer, purpose: string, value: unknown): string {
  if (key.length !== 32) throw new Error('seal: key must be 32 bytes');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose, 'utf8'));
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${iv.toString('base64url')}.${ct.toString('base64url')}`;
}

/** Returns undefined for anything malformed, tampered with, sealed for another purpose or with another key. */
export function unseal<T = unknown>(key: Buffer, purpose: string, sealed: string | undefined): T | undefined {
  if (!sealed || key.length !== 32) return undefined;
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return undefined;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const data = Buffer.from(parts[2], 'base64url');
    if (iv.length !== IV_BYTES || data.length < TAG_BYTES) return undefined;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(purpose, 'utf8'));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    const pt = Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]);
    return JSON.parse(pt.toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Constant-time string comparison (hashes first, so unequal lengths don't leak through timing). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
