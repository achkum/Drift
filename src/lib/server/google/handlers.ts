// OWNER: sync agent. Route handlers for /api/google/*. Stateless: everything the server needs
// comes from env and the request's cookies. Uses standard Request/Response so tests can call
// these directly with a mocked fetch.
import type {
  GoogleAccessType,
  GoogleExportResponse,
  GoogleJobState,
  GoogleJobStateResponse,
  GoogleResource,
} from '@/lib/connectors/google/types';
import { GOOGLE_RESOURCES, TIME_FILTER_RESOURCES } from '@/lib/connectors/google/types';
import {
  GoogleApiError,
  buildAuthUrl,
  checkAccessType,
  exchangeCode,
  getArchiveState,
  initiateArchive,
  refreshAccessToken,
  resetAuthorization,
  resourcesFromScope,
  type ArchiveState,
  type FetchLike,
} from './api';
import { getGoogleConfig, type GoogleConfig } from './config';
import { pkceChallenge, randomToken, safeEqual } from './crypto';
import { errorJson, isSameOrigin, json, parseCookies, redirect, requestOrigin } from './http';
import { MOCK_JOB_MS, buildMockArchive, decodeMockJob, encodeMockJob } from './mock';
import {
  type Session,
  clearOAuthCookie,
  clearSessionCookies,
  oauthCookie,
  readOAuthPending,
  readSession,
  sessionCookies,
  statusFromSession,
} from './session';

export interface Deps {
  env: Record<string, string | undefined>;
  fetch: FetchLike;
  now: () => number;
}

export function defaultDeps(): Deps {
  return { env: process.env, fetch: (input, init) => fetch(input, init), now: () => Date.now() };
}

const JOB_ID_RE = /^[A-Za-z0-9_.:-]{1,600}$/;
const JOB_SEP = '~';
const MAX_BODY_BYTES = 2048;
/** Accepted values for /connect?google=error&reason=… */
type CallbackReason = 'not_configured' | 'access_denied' | 'invalid_state' | 'exchange_failed' | 'no_refresh_token' | 'no_scopes';

function connectRedirect(origin: string, ok: true | CallbackReason, cookies: string[] = []): Response {
  const qs = ok === true ? 'google=connected' : `google=error&reason=${ok}`;
  return redirect(`${origin}/connect?${qs}`, cookies);
}

function notConfigured(reason: string): Response {
  return errorJson(503, 'not_configured', `Google sync is not configured on this server. ${reason}`, { configured: false });
}

function redirectUri(config: GoogleConfig, req: Request): string {
  return config.redirectUri ?? `${requestOrigin(req, config.appOrigin)}/api/google/auth/callback`;
}

function fromApiError(err: unknown, config: GoogleConfig): Response {
  if (err instanceof GoogleApiError) {
    const cookies = err.code === 'reauth_required' ? clearSessionCookies(config) : [];
    const retryAfter = err.code === 'already_exported' && !/one export per approval/.test(err.message) ? 24 * 3600 : err.code === 'rate_limited' ? 60 : undefined;
    return errorJson(err.httpStatus, err.code, err.message, retryAfter ? { retryAfter } : {}, cookies);
  }
  return errorJson(500, 'upstream_error', 'Something went wrong talking to Google.');
}

/** Valid access token for the session, refreshing it when needed. `changed` = re-set the cookie. */
async function accessToken(config: GoogleConfig, s: Session, deps: Deps): Promise<{ token: string; session: Session; changed: boolean }> {
  const now = deps.now();
  if (s.mock) return { token: 'mock-access-token', session: s, changed: false };
  if (s.at && s.atExp && s.atExp - 60_000 > now) return { token: s.at, session: s, changed: false };
  const t = await refreshAccessToken(deps.fetch, { clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: s.rt });
  const next: Session = { ...s, at: t.access_token, atExp: now + (t.expires_in || 3600) * 1000 };
  if (t.refresh_token) next.rt = t.refresh_token;
  return { token: t.access_token, session: next, changed: true };
}

function loadConfigured(deps: Deps): { config: GoogleConfig } | { response: Response } {
  const c = getGoogleConfig(deps.env);
  if (!c.ok) return { response: notConfigured(c.reason) };
  return { config: c.config };
}

// ── GET /api/google/auth/start ──────────────────────────────────────

export async function handleAuthStart(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const c = getGoogleConfig(deps.env);
  const origin = requestOrigin(req, c.ok ? c.config.appOrigin : undefined);
  if (!c.ok) return connectRedirect(origin, 'not_configured');
  const config = c.config;
  const state = randomToken(32);
  const verifier = randomToken(48); // 64 chars, within RFC 7636's 43-128
  const cookie = oauthCookie(config, { state, verifier, iat: deps.now() });
  if (config.mock) {
    // Skip Google's consent screen: go straight to our callback with a fake code.
    const cb = new URL(redirectUri(config, req));
    cb.searchParams.set('code', 'mock-code');
    cb.searchParams.set('state', state);
    return redirect(cb.toString(), [cookie]);
  }
  const url = buildAuthUrl({ clientId: config.clientId, redirectUri: redirectUri(config, req), state, codeChallenge: pkceChallenge(verifier) });
  return redirect(url, [cookie]);
}

// ── GET /api/google/auth/callback ───────────────────────────────────

export async function handleAuthCallback(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const c = getGoogleConfig(deps.env);
  const origin = requestOrigin(req, c.ok ? c.config.appOrigin : undefined);
  if (!c.ok) return connectRedirect(origin, 'not_configured');
  const config = c.config;
  const now = deps.now();
  const url = new URL(req.url);
  const clearOAuth = clearOAuthCookie(config);

  if (url.searchParams.get('error')) return connectRedirect(origin, 'access_denied', [clearOAuth]);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const pending = readOAuthPending(config, parseCookies(req), now);
  if (!code || !state || !pending || !safeEqual(state, pending.state)) return connectRedirect(origin, 'invalid_state', [clearOAuth]);

  let session: Session;
  if (config.mock) {
    session = {
      rt: 'mock-refresh-token',
      res: [...GOOGLE_RESOURCES],
      accessType: 'time-based',
      rtExp: now + 30 * 86_400_000,
      connectedAt: now,
      mock: true,
    };
  } else {
    let tokens;
    try {
      tokens = await exchangeCode(deps.fetch, {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        code,
        redirectUri: redirectUri(config, req),
        codeVerifier: pending.verifier,
      });
    } catch {
      return connectRedirect(origin, 'exchange_failed', [clearOAuth]);
    }
    if (!tokens.refresh_token) return connectRedirect(origin, 'no_refresh_token', [clearOAuth]);
    const res = resourcesFromScope(tokens.scope);
    if (!res.length) return connectRedirect(origin, 'no_scopes', [clearOAuth]);
    let accessType: GoogleAccessType = tokens.refresh_token_expires_in ? 'time-based' : 'unknown';
    try {
      accessType = (await checkAccessType(deps.fetch, tokens.access_token)).accessType;
    } catch {
      // Not fatal: keep the guess from refresh_token_expires_in.
    }
    session = {
      rt: tokens.refresh_token,
      at: tokens.access_token,
      atExp: now + (tokens.expires_in || 3600) * 1000,
      res,
      accessType,
      rtExp: tokens.refresh_token_expires_in ? now + tokens.refresh_token_expires_in * 1000 : undefined,
      connectedAt: now,
    };
  }
  return connectRedirect(origin, true, [clearOAuth, ...sessionCookies(config, session, now)]);
}

// ── GET /api/google/status ──────────────────────────────────────────

export async function handleStatus(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const c = getGoogleConfig(deps.env);
  if (!c.ok) return json({ configured: false, connected: false });
  const config = c.config;
  const now = deps.now();
  const cookies = parseCookies(req);
  let session = readSession(config, cookies, now);
  const setCookies: string[] = [];
  // A cookie we can't read (expired, other key, tampered) means "not connected": clear it.
  if (!session && (cookies.drift_google || cookies.drift_google_status)) setCookies.push(...clearSessionCookies(config));

  if (session && !session.mock && new URL(req.url).searchParams.get('live') === '1') {
    try {
      const t = await accessToken(config, session, deps);
      session = { ...t.session, accessType: (await checkAccessType(deps.fetch, t.token)).accessType };
      setCookies.push(...sessionCookies(config, session, now));
    } catch (err) {
      if (err instanceof GoogleApiError && err.code === 'reauth_required') {
        return json(statusFromSession(undefined, config), 200, clearSessionCookies(config));
      }
      // Other errors: report what we know.
    }
  }
  return json(statusFromSession(session, config), 200, setCookies);
}

// ── POST /api/google/export ─────────────────────────────────────────

async function readJsonBody(req: Request): Promise<Record<string, unknown> | undefined> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export async function handleExport(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const l = loadConfigured(deps);
  if ('response' in l) return l.response;
  const { config } = l;
  if (!isSameOrigin(req, config.appOrigin)) return errorJson(403, 'forbidden', 'Cross-site request refused.');
  const now = deps.now();
  const session = readSession(config, parseCookies(req), now);
  if (!session) return errorJson(401, 'not_connected', 'Google is not connected.');

  const body = await readJsonBody(req);
  if (!body) return errorJson(400, 'invalid_request', 'Body must be a small JSON object: { "since"?: ISO time }.');
  let since: string | undefined;
  if (body.since !== undefined && body.since !== null) {
    const t = typeof body.since === 'string' ? Date.parse(body.since) : NaN;
    if (Number.isNaN(t) || t > now || t < Date.UTC(2005, 0, 1)) return errorJson(400, 'invalid_request', '"since" must be an ISO time in the past.');
    since = new Date(t).toISOString();
  }

  const granted = GOOGLE_RESOURCES.filter((r) => session.res.includes(r));
  if (!granted.length) return errorJson(403, 'permission_denied', 'No Google data was shared with Drift. Connect again and allow access.');

  // Time filters only work on My Activity; mixing in other resources is INVALID_ARGUMENT. So an
  // incremental export is one filtered job for My Activity plus one full job for the rest.
  const groups: { resources: GoogleResource[]; startTime?: string; optional: boolean }[] = [];
  if (since) {
    const timed = granted.filter((r) => TIME_FILTER_RESOURCES.includes(r));
    const untimed = granted.filter((r) => !TIME_FILTER_RESOURCES.includes(r));
    if (timed.length) groups.push({ resources: timed, startTime: since, optional: false });
    if (untimed.length) groups.push({ resources: untimed, optional: timed.length > 0 });
  } else {
    groups.push({ resources: granted, optional: false });
  }

  let tok;
  try {
    tok = await accessToken(config, session, deps);
  } catch (err) {
    return fromApiError(err, config);
  }

  const ids: string[] = [];
  const used: GoogleResource[] = [];
  const warnings: string[] = [];
  let accessType: GoogleAccessType = session.accessType;
  for (const g of groups) {
    try {
      let id: string;
      if (config.mock) {
        id = encodeMockJob({ t: now, s: g.startTime, r: g.resources });
        accessType = 'time-based';
      } else {
        const r = await initiateArchive(deps.fetch, tok.token, { resources: g.resources, startTime: g.startTime });
        id = r.archiveJobId;
        if (r.accessType !== 'unknown') accessType = r.accessType;
      }
      if (!JOB_ID_RE.test(id) || id.includes(JOB_SEP)) throw new GoogleApiError(502, 'upstream_error', 'Google returned an unexpected job id.');
      ids.push(id);
      used.push(...g.resources);
    } catch (err) {
      if (g.optional && err instanceof GoogleApiError && (err.code === 'already_exported' || err.code === 'rate_limited')) {
        warnings.push(`${g.resources.join(', ')} skipped: ${err.message}`);
        continue;
      }
      const cookies = tok.changed ? sessionCookies(config, tok.session, now) : [];
      if (ids.length) warnings.push('Part of the export started before an error.');
      const res = fromApiError(err, config);
      for (const ck of cookies) if (!(err instanceof GoogleApiError && err.code === 'reauth_required')) res.headers.append('set-cookie', ck);
      return res;
    }
  }

  const next: Session = { ...tok.session, lastExportAt: now, accessType };
  const out: GoogleExportResponse = { jobId: ids.join(JOB_SEP), accessType, resources: used, warnings };
  if (since) out.startTime = since;
  return json(out, 200, sessionCookies(config, next, now));
}

// ── GET /api/google/export/[jobId] ──────────────────────────────────

function mockState(id: string, origin: string, now: number): ArchiveState {
  const job = decodeMockJob(id);
  if (!job) throw new GoogleApiError(404, 'not_found', 'Export job not found.');
  if (now - job.t < MOCK_JOB_MS) return { state: 'IN_PROGRESS', urls: [] };
  return {
    state: 'COMPLETE',
    urls: [`${origin}/api/google/mock-archive/${id}`],
    startTime: job.s,
    exportTime: new Date(job.t).toISOString(),
  };
}

export async function handleJobState(req: Request, jobId: string, deps: Deps = defaultDeps()): Promise<Response> {
  const l = loadConfigured(deps);
  if ('response' in l) return l.response;
  const { config } = l;
  const now = deps.now();
  const session = readSession(config, parseCookies(req), now);
  if (!session) return errorJson(401, 'not_connected', 'Google is not connected.');
  const ids = decodeURIComponent(jobId).split(JOB_SEP);
  if (!ids.length || ids.length > 4 || ids.some((id) => !JOB_ID_RE.test(id))) return errorJson(400, 'invalid_request', 'Bad job id.');

  let tok;
  try {
    tok = await accessToken(config, session, deps);
  } catch (err) {
    return fromApiError(err, config);
  }
  const origin = requestOrigin(req, config.appOrigin);
  const jobs: GoogleJobStateResponse['jobs'] = [];
  let first: ArchiveState | undefined;
  try {
    for (const id of ids) {
      const s = config.mock ? mockState(id, origin, now) : await getArchiveState(deps.fetch, tok.token, id);
      first ??= s;
      jobs.push({ id, state: s.state, urls: s.urls });
    }
  } catch (err) {
    return fromApiError(err, config);
  }

  // The first job holds My Activity (the history); later jobs (subscriptions) are optional.
  const warnings: string[] = [];
  let state: GoogleJobState;
  if (jobs.some((j) => j.state === 'IN_PROGRESS')) state = 'IN_PROGRESS';
  else if (jobs[0].state !== 'COMPLETE') state = jobs[0].state;
  else {
    state = 'COMPLETE';
    for (const j of jobs.slice(1)) if (j.state !== 'COMPLETE') warnings.push(`Part of the export ${j.state.toLowerCase()}; subscriptions may be missing.`);
  }
  const body: GoogleJobStateResponse = {
    state,
    urls: state === 'COMPLETE' ? jobs.flatMap((j) => (j.state === 'COMPLETE' ? j.urls : [])) : [],
    jobs,
    warnings,
  };
  if (first?.startTime) body.startTime = first.startTime;
  if (first?.exportTime) body.exportTime = first.exportTime;
  return json(body, 200, tok.changed ? sessionCookies(config, tok.session, now) : []);
}

// ── POST /api/google/disconnect ─────────────────────────────────────

export async function handleDisconnect(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const l = loadConfigured(deps);
  if ('response' in l) return l.response;
  const { config } = l;
  if (!isSameOrigin(req, config.appOrigin)) return errorJson(403, 'forbidden', 'Cross-site request refused.');
  const session = readSession(config, parseCookies(req), deps.now());
  let revoked = false;
  if (session) {
    if (session.mock) revoked = true;
    else {
      try {
        const t = await accessToken(config, session, deps);
        await resetAuthorization(deps.fetch, t.token);
        revoked = true;
      } catch {
        // Token already invalid or Google unreachable: still forget it locally.
      }
    }
  }
  return json({ connected: false, revoked }, 200, [...clearSessionCookies(config), clearOAuthCookie(config)]);
}

// ── GET /api/google/mock-archive/[jobId] (mock mode only) ───────────

export async function handleMockArchive(req: Request, jobId: string, deps: Deps = defaultDeps()): Promise<Response> {
  const c = getGoogleConfig(deps.env);
  if (!c.ok || !c.config.mock) return errorJson(404, 'not_found', 'Not found.');
  const job = decodeMockJob(decodeURIComponent(jobId));
  if (!job || deps.now() - job.t < MOCK_JOB_MS) return errorJson(404, 'not_found', 'Archive not ready.');
  const zip = buildMockArchive(job);
  return new Response(zip as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-length': String(zip.byteLength),
      'content-disposition': `attachment; filename="portability-${new Date(job.t).toISOString().slice(0, 10)}.zip"`,
      'cache-control': 'no-store',
    },
  });
}
