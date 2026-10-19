// OWNER: sync agent. Server-only configuration for the Google Data Portability connector.
// Read on every request (not at import time) so tests and deployments can change env freely.
import { createHash } from 'node:crypto';

export interface GoogleConfig {
  mock: boolean;
  clientId: string;
  clientSecret: string;
  /** 32-byte AES-256-GCM key. */
  tokenKey: Buffer;
  /** Fixed redirect URI, or undefined to derive `${origin}/api/google/auth/callback` per request. */
  redirectUri?: string;
  /** Fixed public origin (e.g. https://drift.example), or undefined to use the request's origin. */
  appOrigin?: string;
  secureCookies: boolean;
}

export type ConfigResult = { ok: true; config: GoogleConfig } | { ok: false; reason: string };

type Env = Record<string, string | undefined>;

/** Accepts 64 hex chars or base64/base64url of exactly 32 bytes. */
export function parseTokenKey(raw: string | undefined): Buffer | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) {
    const buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (buf.length === 32) return buf;
  }
  return undefined;
}

export function isMockMode(env: Env = process.env): boolean {
  return env.DRIFT_GOOGLE_MOCK === '1' || env.DRIFT_GOOGLE_MOCK === 'true';
}

export function getGoogleConfig(env: Env = process.env): ConfigResult {
  const mock = isMockMode(env);
  const secureCookies = env.NODE_ENV === 'production' && env.DRIFT_INSECURE_COOKIES !== '1';
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim() || undefined;
  const appOrigin = env.DRIFT_APP_URL ? safeOrigin(env.DRIFT_APP_URL) : undefined;
  let tokenKey = parseTokenKey(env.DRIFT_TOKEN_KEY);

  if (mock) {
    // Mock tokens are not secrets; a fixed dev key keeps mock mode zero-config.
    tokenKey ??= createHash('sha256').update('drift-google-mock-key').digest();
    return {
      ok: true,
      config: { mock, clientId: 'mock-client', clientSecret: 'mock-secret', tokenKey, redirectUri, appOrigin, secureCookies },
    };
  }

  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { ok: false, reason: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.' };
  if (!env.DRIFT_TOKEN_KEY) return { ok: false, reason: 'DRIFT_TOKEN_KEY is not set.' };
  if (!tokenKey) return { ok: false, reason: 'DRIFT_TOKEN_KEY must be 32 bytes (64 hex chars or base64).' };
  return { ok: true, config: { mock, clientId, clientSecret, tokenKey, redirectUri, appOrigin, secureCookies } };
}

function safeOrigin(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}
