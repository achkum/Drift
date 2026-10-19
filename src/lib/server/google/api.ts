// OWNER: sync agent. Thin client for Google OAuth 2.0 and the Data Portability API (v1).
// Reference: https://developers.google.com/data-portability/reference/rest
// Never logs or returns tokens in error messages.
import type { GoogleAccessType, GoogleErrorCode, GoogleJobState, GoogleResource } from '@/lib/connectors/google/types';
import { GOOGLE_RESOURCES, SCOPE_PREFIX } from '@/lib/connectors/google/types';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const PORTABILITY_BASE = 'https://dataportability.googleapis.com/v1';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GoogleApiError extends Error {
  constructor(
    public httpStatus: number,
    public code: GoogleErrorCode,
    message: string,
    /** Google's status string (RESOURCE_EXHAUSTED, ...) and reason, for tests and mapping. */
    public googleStatus?: string,
    public reason?: string,
  ) {
    super(message);
  }
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  /** Seconds until the refresh token (time-based access) ends: 2592000 (30 d) or 15552000 (180 d). */
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
}

export function scopesFor(resources: readonly string[]): string[] {
  return resources.map((r) => SCOPE_PREFIX + r);
}

/** Resource groups present in a space-separated scope string. */
export function resourcesFromScope(scope: string | undefined): GoogleResource[] {
  if (!scope) return [];
  const granted = new Set(scope.split(/\s+/));
  return GOOGLE_RESOURCES.filter((r) => granted.has(SCOPE_PREFIX + r));
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scopesFor(GOOGLE_RESOURCES).join(' '));
  u.searchParams.set('state', p.state);
  u.searchParams.set('code_challenge', p.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  return u.toString();
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

interface GoogleErrorBody {
  error?: { code?: number; status?: string; message?: string; details?: { reason?: string; '@type'?: string }[] } | string;
  error_description?: string;
}

/** Maps a Google error response to a Drift error code. */
export function mapGoogleError(httpStatus: number, body: unknown): GoogleApiError {
  const b = (body ?? {}) as GoogleErrorBody;
  // OAuth endpoints: { error: "invalid_grant", error_description }
  if (typeof b.error === 'string') {
    if (b.error === 'invalid_grant' || b.error === 'unauthorized_client') {
      return new GoogleApiError(401, 'reauth_required', 'Google access was revoked or expired. Connect Google again.', undefined, b.error);
    }
    return new GoogleApiError(502, 'upstream_error', `Google sign-in failed (${b.error}).`, undefined, b.error);
  }
  const e = b.error ?? {};
  const status = e.status ?? '';
  const reason = e.details?.find((d) => d.reason)?.reason ?? '';
  const msg = (e.message ?? '').slice(0, 300);

  if (httpStatus === 401 || status === 'UNAUTHENTICATED') {
    return new GoogleApiError(401, 'reauth_required', 'Google access was revoked or expired. Connect Google again.', status, reason);
  }
  if (status === 'RESOURCE_EXHAUSTED' || httpStatus === 429 || (status === 'FAILED_PRECONDITION' && /already been exported/i.test(msg))) {
    if (/already been exported/i.test(msg) || /TIME_BASED/i.test(reason) || status === 'FAILED_PRECONDITION') {
      const oneTime = /ResetAuthorization/i.test(msg);
      return new GoogleApiError(
        429,
        'already_exported',
        oneTime
          ? 'Google allows one export per approval for one-time access. Disconnect and connect Google again to export again.'
          : 'Google allows one export every 24 hours. Try again later.',
        status,
        reason,
      );
    }
    return new GoogleApiError(429, 'rate_limited', 'Google is rate limiting requests. Try again in a few minutes.', status, reason);
  }
  if (httpStatus === 403 || status === 'PERMISSION_DENIED') {
    return new GoogleApiError(
      403,
      'permission_denied',
      'Google refused the request. The account may not have granted access, or the Data Portability API may not be available in its country.',
      status,
      reason,
    );
  }
  if (httpStatus === 404 || status === 'NOT_FOUND') return new GoogleApiError(404, 'not_found', 'Export job not found.', status, reason);
  if (httpStatus === 400 || status === 'INVALID_ARGUMENT' || status === 'FAILED_PRECONDITION') {
    return new GoogleApiError(400, 'invalid_request', msg ? `Google rejected the request: ${msg}` : 'Google rejected the request.', status, reason);
  }
  return new GoogleApiError(502, 'upstream_error', `Google returned an error (HTTP ${httpStatus}).`, status, reason);
}

async function call<T>(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, cache: 'no-store', redirect: 'error' });
  } catch {
    throw new GoogleApiError(502, 'upstream_error', 'Could not reach Google. Try again.');
  }
  const body = await readBody(res);
  if (!res.ok) throw mapGoogleError(res.status, body);
  return body as T;
}

function form(params: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  };
}

export function exchangeCode(
  fetchImpl: FetchLike,
  p: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier: string },
): Promise<TokenResponse> {
  return call<TokenResponse>(
    fetchImpl,
    GOOGLE_TOKEN_URL,
    form({
      grant_type: 'authorization_code',
      code: p.code,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
      code_verifier: p.codeVerifier,
    }),
  );
}

export function refreshAccessToken(
  fetchImpl: FetchLike,
  p: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<TokenResponse> {
  return call<TokenResponse>(
    fetchImpl,
    GOOGLE_TOKEN_URL,
    form({ grant_type: 'refresh_token', refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret }),
  );
}

function bearer(accessToken: string, body?: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: body === undefined ? '{}' : JSON.stringify(body),
  };
}

export function toAccessType(v: string | undefined): GoogleAccessType {
  if (v === 'ACCESS_TYPE_ONE_TIME') return 'one-time';
  if (v === 'ACCESS_TYPE_TIME_BASED') return 'time-based';
  return 'unknown';
}

/** POST /v1/portabilityArchive:initiate */
export async function initiateArchive(
  fetchImpl: FetchLike,
  accessToken: string,
  p: { resources: readonly string[]; startTime?: string; endTime?: string },
): Promise<{ archiveJobId: string; accessType: GoogleAccessType }> {
  const body: Record<string, unknown> = { resources: p.resources };
  if (p.startTime) body.startTime = p.startTime;
  if (p.endTime) body.endTime = p.endTime;
  const res = await call<{ archiveJobId?: string; accessType?: string }>(
    fetchImpl,
    `${PORTABILITY_BASE}/portabilityArchive:initiate`,
    bearer(accessToken, body),
  );
  if (!res.archiveJobId) throw new GoogleApiError(502, 'upstream_error', 'Google did not return an export job id.');
  return { archiveJobId: res.archiveJobId, accessType: toAccessType(res.accessType) };
}

export interface ArchiveState {
  state: GoogleJobState;
  urls: string[];
  startTime?: string;
  exportTime?: string;
}

/** GET /v1/archiveJobs/{id}/portabilityArchiveState */
export async function getArchiveState(fetchImpl: FetchLike, accessToken: string, jobId: string): Promise<ArchiveState> {
  const res = await call<{ state?: string; urls?: string[]; startTime?: string; exportTime?: string }>(
    fetchImpl,
    `${PORTABILITY_BASE}/archiveJobs/${encodeURIComponent(jobId)}/portabilityArchiveState`,
    { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
  );
  const s = res.state;
  const state: GoogleJobState = s === 'COMPLETE' || s === 'FAILED' || s === 'CANCELLED' ? s : 'IN_PROGRESS';
  return { state, urls: Array.isArray(res.urls) ? res.urls.filter((u) => typeof u === 'string') : [], startTime: res.startTime, exportTime: res.exportTime };
}

/** POST /v1/authorization:reset — revokes all granted scopes and archive access. */
export async function resetAuthorization(fetchImpl: FetchLike, accessToken: string): Promise<void> {
  await call<unknown>(fetchImpl, `${PORTABILITY_BASE}/authorization:reset`, bearer(accessToken));
}

/** POST /v1/accessType:check */
export async function checkAccessType(
  fetchImpl: FetchLike,
  accessToken: string,
): Promise<{ accessType: GoogleAccessType; oneTimeResources: string[]; timeBasedResources: string[] }> {
  const res = await call<{ oneTimeResources?: string[]; timeBasedResources?: string[] }>(
    fetchImpl,
    `${PORTABILITY_BASE}/accessType:check`,
    bearer(accessToken),
  );
  const oneTimeResources = res.oneTimeResources ?? [];
  const timeBasedResources = res.timeBasedResources ?? [];
  // Google: a job is one-time if any requested resource is one-time.
  const accessType: GoogleAccessType = oneTimeResources.length ? 'one-time' : timeBasedResources.length ? 'time-based' : 'unknown';
  return { accessType, oneTimeResources, timeBasedResources };
}

/** Resource names may come back prefixed with the scope URL or bare; normalise to bare ids. */
export function bareResource(r: string): string {
  return r.startsWith(SCOPE_PREFIX) ? r.slice(SCOPE_PREFIX.length) : r;
}
