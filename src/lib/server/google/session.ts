// OWNER: sync agent. The connection lives only in the user's browser, as cookies:
//   drift_google         httpOnly, path /api/google, AES-256-GCM sealed: refresh token, cached access token, metadata
//   drift_google_oauth   httpOnly, path /api/google/auth, sealed, 10 min: OAuth state + PKCE verifier
//   drift_google_status  readable by page JS, path /: non-sensitive status (no tokens)
// The server keeps nothing.
import type { GoogleAccessType, GoogleResource, GoogleStatusResponse } from '@/lib/connectors/google/types';
import type { GoogleConfig } from './config';
import { seal, unseal } from './crypto';
import { clearCookie, serializeCookie } from './http';

export const SESSION_COOKIE = 'drift_google';
export const OAUTH_COOKIE = 'drift_google_oauth';
export const STATUS_COOKIE = 'drift_google_status';
export const SESSION_PATH = '/api/google';
export const OAUTH_PATH = '/api/google/auth';
export const OAUTH_TTL_S = 600;
/** Fallback lifetime when Google does not say when the refresh token expires (max time-based access). */
const DEFAULT_SESSION_S = 180 * 86_400;

export interface Session {
  /** Refresh token. */
  rt: string;
  /** Cached access token and its expiry (epoch ms). */
  at?: string;
  atExp?: number;
  res: GoogleResource[];
  accessType: GoogleAccessType;
  /** Refresh token expiry (epoch ms), from refresh_token_expires_in. */
  rtExp?: number;
  connectedAt: number;
  lastExportAt?: number;
  mock?: boolean;
}

export interface OAuthPending {
  state: string;
  verifier: string;
  iat: number;
}

export function readSession(config: GoogleConfig, cookies: Record<string, string>, now: number): Session | undefined {
  const s = unseal<Session>(config.tokenKey, SESSION_COOKIE, cookies[SESSION_COOKIE]);
  if (!s || typeof s.rt !== 'string' || !Array.isArray(s.res)) return undefined;
  if (s.rtExp && s.rtExp <= now) return undefined;
  if (!!s.mock !== config.mock) return undefined; // never mix mock and real sessions
  return s;
}

export function readOAuthPending(config: GoogleConfig, cookies: Record<string, string>, now: number): OAuthPending | undefined {
  const p = unseal<OAuthPending>(config.tokenKey, OAUTH_COOKIE, cookies[OAUTH_COOKIE]);
  if (!p || typeof p.state !== 'string' || typeof p.verifier !== 'string' || typeof p.iat !== 'number') return undefined;
  if (now - p.iat > OAUTH_TTL_S * 1000 || p.iat > now + 60_000) return undefined;
  return p;
}

export function statusFromSession(s: Session | undefined, config: GoogleConfig): GoogleStatusResponse {
  if (!s) return { configured: true, connected: false, ...(config.mock ? { mock: true } : {}) };
  const out: GoogleStatusResponse = {
    configured: true,
    connected: true,
    accessType: s.accessType,
    resources: s.res,
    connectedAt: new Date(s.connectedAt).toISOString(),
  };
  if (config.mock) out.mock = true;
  if (s.rtExp) out.expiresAt = new Date(s.rtExp).toISOString();
  if (s.lastExportAt) out.lastExportAt = new Date(s.lastExportAt).toISOString();
  return out;
}

/** Set-Cookie headers that store the session and the readable status mirror. */
export function sessionCookies(config: GoogleConfig, s: Session, now: number): string[] {
  const maxAge = s.rtExp ? Math.max(60, Math.floor((s.rtExp - now) / 1000)) : DEFAULT_SESSION_S;
  const secure = config.secureCookies;
  const status = statusFromSession(s, config);
  return [
    serializeCookie(SESSION_COOKIE, seal(config.tokenKey, SESSION_COOKIE, s), { path: SESSION_PATH, maxAge, httpOnly: true, secure }),
    serializeCookie(STATUS_COOKIE, JSON.stringify({ connected: true, accessType: status.accessType, expiresAt: status.expiresAt, lastExportAt: status.lastExportAt }), {
      path: '/',
      maxAge,
      httpOnly: false,
      secure,
    }),
  ];
}

export function clearSessionCookies(config: GoogleConfig): string[] {
  return [
    clearCookie(SESSION_COOKIE, SESSION_PATH, config.secureCookies),
    clearCookie(STATUS_COOKIE, '/', config.secureCookies, false),
  ];
}

export function oauthCookie(config: GoogleConfig, p: OAuthPending): string {
  return serializeCookie(OAUTH_COOKIE, seal(config.tokenKey, OAUTH_COOKIE, p), {
    path: OAUTH_PATH,
    maxAge: OAUTH_TTL_S,
    httpOnly: true,
    secure: config.secureCookies,
  });
}

export function clearOAuthCookie(config: GoogleConfig): string {
  return clearCookie(OAUTH_COOKIE, OAUTH_PATH, config.secureCookies);
}
