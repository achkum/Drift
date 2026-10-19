// OWNER: sync agent. Small helpers for cookies, JSON responses and same-origin checks.
// Handlers work on the standard Request / Response types so they can be tested without Next.
import type { GoogleErrorCode, GoogleErrorResponse } from '@/lib/connectors/google/types';

/** Browsers cap a cookie (name + value + attributes) at 4096 bytes; stay well under. */
export const MAX_COOKIE_BYTES = 3800;

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.get('cookie');
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

export interface CookieOptions {
  path: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict';
}

export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`, `SameSite=${opts.sameSite ?? 'Lax'}`];
  if (opts.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
    if (opts.maxAge <= 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  const cookie = parts.join('; ');
  if (cookie.length > MAX_COOKIE_BYTES) throw new Error(`Cookie ${name} is too large (${cookie.length} bytes).`);
  return cookie;
}

export function clearCookie(name: string, path: string, secure: boolean, httpOnly = true): string {
  return serializeCookie(name, '', { path, maxAge: 0, httpOnly, secure });
}

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export function json(body: unknown, status = 200, cookies: string[] = [], extra: Record<string, string> = {}): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', ...NO_STORE, ...extra });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorJson(
  status: number,
  error: GoogleErrorCode,
  message: string,
  extra: Partial<GoogleErrorResponse> = {},
  cookies: string[] = [],
): Response {
  const headers: Record<string, string> = {};
  if (extra.retryAfter) headers['retry-after'] = String(extra.retryAfter);
  return json({ error, message, ...extra } satisfies GoogleErrorResponse, status, cookies, headers);
}

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, ...NO_STORE });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

/** Public origin of the app: DRIFT_APP_URL when set, else the request URL's origin. */
export function requestOrigin(req: Request, appOrigin?: string): string {
  if (appOrigin) return appOrigin;
  return new URL(req.url).origin;
}

/**
 * CSRF guard for state-changing and proxy routes. Rejects requests that a browser marks as
 * cross-site (Sec-Fetch-Site) or that carry an Origin / Referer from another origin.
 * Requests without any of these headers (curl, server-to-server) are allowed: they carry no
 * ambient browser cookies an attacker could ride on.
 */
export function isSameOrigin(req: Request, appOrigin?: string): boolean {
  const expected = requestOrigin(req, appOrigin);
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (origin) return origin === expected;
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return true;
}
