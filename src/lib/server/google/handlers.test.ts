import { describe, expect, it } from 'vitest';
import { pkceChallenge } from './crypto';
import {
  handleAuthCallback,
  handleAuthStart,
  handleDisconnect,
  handleExport,
  handleJobState,
  handleMockArchive,
  handleStatus,
} from './handlers';
import { handleDownload } from './download';
import { CookieJar, ORIGIN, REAL_ENV, deps, fakeGoogle, jsonRes, makeReq } from './testUtils';
import type { GoogleExportResponse, GoogleJobStateResponse, GoogleStatusResponse } from '@/lib/connectors/google/types';
import { buildImportZip } from '@/lib/connectors/google/adapter';
import { parseExport } from '@/lib/parsers';

const post = (body?: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...headers },
});

/** Runs start + callback against the fake Google; returns the jar holding the session. */
async function connect(d: ReturnType<typeof deps>, jar = new CookieJar()) {
  const start = jar.apply(await handleAuthStart(makeReq('/api/google/auth/start'), d));
  const loc = new URL(start.headers.get('location')!);
  const state = loc.searchParams.get('state')!;
  const code = loc.searchParams.get('code') ?? 'auth-code';
  const cb = jar.apply(await handleAuthCallback(makeReq(`/api/google/auth/callback?code=${code}&state=${state}`, jar), d));
  return { jar, start, loc, cb };
}

describe('unconfigured', () => {
  const d = deps({}, fakeGoogle().fetch);
  it('status says configured: false', async () => {
    const res = await handleStatus(makeReq('/api/google/status'), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, connected: false });
  });
  it('other routes return 503 not_configured', async () => {
    for (const res of [
      await handleExport(makeReq('/api/google/export', undefined, post({})), d),
      await handleJobState(makeReq('/api/google/export/x'), 'x', d),
      await handleDisconnect(makeReq('/api/google/disconnect', undefined, post()), d),
      await handleDownload(makeReq('/api/google/download?url=x'), d),
    ]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: 'not_configured', configured: false });
    }
  });
  it('start redirects back to /connect with a reason', async () => {
    const res = await handleAuthStart(makeReq('/api/google/auth/start'), d);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/connect?google=error&reason=not_configured`);
  });
});

describe('OAuth start + callback', () => {
  it('redirects to Google with PKCE, offline access, consent and the three scopes', async () => {
    const g = fakeGoogle();
    const { loc, start } = await connect(deps(REAL_ENV, g.fetch));
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc.searchParams.get('client_id')).toBe(REAL_ENV.GOOGLE_CLIENT_ID);
    expect(loc.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/google/auth/callback`);
    expect(loc.searchParams.get('response_type')).toBe('code');
    expect(loc.searchParams.get('access_type')).toBe('offline');
    expect(loc.searchParams.get('prompt')).toBe('consent');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('scope')!.split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/dataportability.myactivity.search',
      'https://www.googleapis.com/auth/dataportability.myactivity.youtube',
      'https://www.googleapis.com/auth/dataportability.youtube.subscriptions',
    ]);
    const oauthCookie = start.headers.getSetCookie().find((c) => c.startsWith('drift_google_oauth='))!;
    expect(oauthCookie).toMatch(/HttpOnly/);
    expect(oauthCookie).toMatch(/Path=\/api\/google\/auth/);
    expect(oauthCookie).toMatch(/SameSite=Lax/);

    // The token exchange sent the verifier that matches the challenge.
    const exchange = g.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!;
    const p = new URLSearchParams(exchange.body);
    expect(p.get('grant_type')).toBe('authorization_code');
    expect(pkceChallenge(p.get('code_verifier')!)).toBe(loc.searchParams.get('code_challenge'));
    expect(p.get('client_secret')).toBe(REAL_ENV.GOOGLE_CLIENT_SECRET);
  });

  it('stores the refresh token encrypted and reports status', async () => {
    const g = fakeGoogle();
    const d = deps(REAL_ENV, g.fetch);
    const { jar, cb } = await connect(d);
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe(`${ORIGIN}/connect?google=connected`);
    const session = jar.lastSet('drift_google')!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Path=\/api\/google;/);
    expect(session).not.toMatch(/Secure/); // not production
    expect(session).not.toContain('rt-secret-1');
    expect(jar.lastSet('drift_google_status')).not.toMatch(/HttpOnly/);
    expect(jar.lastSet('drift_google_status')).not.toContain('rt-secret');
    expect(jar.cookies.has('drift_google_oauth')).toBe(false);

    const status = (await (await handleStatus(makeReq('/api/google/status', jar), d)).json()) as GoogleStatusResponse;
    expect(status).toMatchObject({ configured: true, connected: true, accessType: 'time-based' });
    expect(status.resources).toHaveLength(3);
    expect(Date.parse(status.expiresAt!) - Date.parse('2026-10-18T12:00:00Z')).toBe(2592000 * 1000);
  });

  it('marks cookies Secure in production', async () => {
    const { jar } = await connect(deps({ ...REAL_ENV, NODE_ENV: 'production' }, fakeGoogle().fetch));
    expect(jar.lastSet('drift_google')).toMatch(/Secure/);
  });

  it('rejects a wrong or missing state', async () => {
    const d = deps(REAL_ENV, fakeGoogle().fetch);
    const jar = new CookieJar();
    jar.apply(await handleAuthStart(makeReq('/api/google/auth/start'), d));
    const bad = await handleAuthCallback(makeReq('/api/google/auth/callback?code=c&state=forged', jar), d);
    expect(bad.headers.get('location')).toBe(`${ORIGIN}/connect?google=error&reason=invalid_state`);
    const noCookie = await handleAuthCallback(makeReq('/api/google/auth/callback?code=c&state=forged'), d);
    expect(noCookie.headers.get('location')).toContain('reason=invalid_state');
  });

  it('rejects an expired OAuth attempt', async () => {
    const clock = { now: Date.parse('2026-10-18T12:00:00Z') };
    const d = deps(REAL_ENV, fakeGoogle().fetch, clock);
    const jar = new CookieJar();
    const start = jar.apply(await handleAuthStart(makeReq('/api/google/auth/start'), d));
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    clock.now += 11 * 60_000;
    const res = await handleAuthCallback(makeReq(`/api/google/auth/callback?code=c&state=${state}`, jar), d);
    expect(res.headers.get('location')).toContain('reason=invalid_state');
  });

  it('handles the user declining', async () => {
    const res = await handleAuthCallback(makeReq('/api/google/auth/callback?error=access_denied&state=x'), deps(REAL_ENV, fakeGoogle().fetch));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/connect?google=error&reason=access_denied`);
  });

  it('handles a failed code exchange', async () => {
    const g = fakeGoogle();
    g.responders.push({ match: 'oauth2.googleapis.com/token', respond: () => jsonRes({ error: 'invalid_grant' }, 400) });
    const { cb } = await connect(deps(REAL_ENV, g.fetch));
    expect(cb.headers.get('location')).toContain('reason=exchange_failed');
  });

  it('keeps only the scopes the user granted', async () => {
    const g = fakeGoogle({ scope: 'https://www.googleapis.com/auth/dataportability.myactivity.youtube' });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res = await handleExport(makeReq('/api/google/export', jar, post({})), d);
    expect(res.status).toBe(200);
    const init = g.calls.find((c) => c.url.endsWith('portabilityArchive:initiate'))!;
    expect(JSON.parse(init.body)).toEqual({ resources: ['myactivity.youtube'] });
  });
});

describe('export', () => {
  it('full export: one job for all resources, cached access token', async () => {
    const g = fakeGoogle();
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const before = g.calls.length;
    const res = jar.apply(await handleExport(makeReq('/api/google/export', jar, post({})), d));
    expect(res.status).toBe(200);
    const body = (await res.json()) as GoogleExportResponse;
    expect(body).toMatchObject({ jobId: 'job-1', accessType: 'time-based', warnings: [] });
    const calls = g.calls.slice(before);
    expect(calls.map((c) => c.url)).toEqual(['https://dataportability.googleapis.com/v1/portabilityArchive:initiate']);
    expect(calls[0].headers.authorization).toBe('Bearer at-1');
    expect(JSON.parse(calls[0].body)).toEqual({ resources: ['myactivity.youtube', 'myactivity.search', 'youtube.subscriptions'] });
    const status = (await (await handleStatus(makeReq('/api/google/status', jar), d)).json()) as GoogleStatusResponse;
    expect(status.lastExportAt).toBe('2026-10-18T12:00:00.000Z');
  });

  it('incremental export: time filter on My Activity only, subscriptions separately', async () => {
    const g = fakeGoogle();
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res = await handleExport(makeReq('/api/google/export', jar, post({ since: '2026-10-10T00:00:00Z' })), d);
    const body = (await res.json()) as GoogleExportResponse;
    expect(body.jobId).toBe('job-1~job-2');
    expect(body.startTime).toBe('2026-10-10T00:00:00.000Z');
    const inits = g.calls.filter((c) => c.url.endsWith('portabilityArchive:initiate')).map((c) => JSON.parse(c.body));
    expect(inits).toEqual([
      { resources: ['myactivity.youtube', 'myactivity.search'], startTime: '2026-10-10T00:00:00.000Z' },
      { resources: ['youtube.subscriptions'] },
    ]);
  });

  it('subscriptions already exported today: warning, not an error', async () => {
    const g = fakeGoogle();
    let n = 0;
    g.responders.push({
      match: 'portabilityArchive:initiate',
      respond: () =>
        ++n === 1
          ? jsonRes({ archiveJobId: 'job-a', accessType: 'ACCESS_TYPE_TIME_BASED' })
          : jsonRes({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Requested resources have already been exported.', details: [{ reason: 'RESOURCE_EXHAUSTED_TIME_BASED' }] } }, 429),
    });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res = await handleExport(makeReq('/api/google/export', jar, post({ since: '2026-10-10T00:00:00Z' })), d);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GoogleExportResponse;
    expect(body.jobId).toBe('job-a');
    expect(body.resources).toEqual(['myactivity.youtube', 'myactivity.search']);
    expect(body.warnings[0]).toMatch(/youtube.subscriptions skipped/);
  });

  it('maps the 24 h limit to already_exported (429, Retry-After)', async () => {
    const g = fakeGoogle();
    g.responders.push({
      match: 'portabilityArchive:initiate',
      respond: () =>
        jsonRes({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Requested resources have already been exported.', details: [{ reason: 'RESOURCE_EXHAUSTED_TIME_BASED' }] } }, 429),
    });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res = await handleExport(makeReq('/api/google/export', jar, post({})), d);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('86400');
    expect(await res.json()).toMatchObject({ error: 'already_exported', retryAfter: 86400 });
  });

  it('maps the one-time "call ResetAuthorization" error', async () => {
    const g = fakeGoogle();
    g.responders.push({
      match: 'portabilityArchive:initiate',
      respond: () =>
        jsonRes({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Requested resources have already been exported. Please call ResetAuthorization and re-obtain consent before trying again.' } }, 429),
    });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const body = await (await handleExport(makeReq('/api/google/export', jar, post({})), d)).json();
    expect(body.error).toBe('already_exported');
    expect(body.message).toMatch(/connect Google again/i);
  });

  it('refreshes an expired access token; invalid_grant clears the connection', async () => {
    const clock = { now: Date.parse('2026-10-18T12:00:00Z') };
    const g = fakeGoogle();
    const d = deps(REAL_ENV, g.fetch, clock);
    const { jar } = await connect(d);
    clock.now += 2 * 3600_000;
    const ok = jar.apply(await handleExport(makeReq('/api/google/export', jar, post({})), d));
    expect(ok.status).toBe(200);
    const refresh = g.calls.filter((c) => c.url.includes('oauth2.googleapis.com/token')).pop()!;
    expect(new URLSearchParams(refresh.body).get('grant_type')).toBe('refresh_token');
    expect(new URLSearchParams(refresh.body).get('refresh_token')).toBe('rt-secret-1');

    clock.now += 2 * 3600_000;
    g.responders.push({ match: 'oauth2.googleapis.com/token', respond: () => jsonRes({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400) });
    const res = jar.apply(await handleExport(makeReq('/api/google/export', jar, post({})), d));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('reauth_required');
    expect(jar.cookies.has('drift_google')).toBe(false);
  });

  it('CSRF: refuses cross-site POSTs', async () => {
    const d = deps(REAL_ENV, fakeGoogle().fetch);
    const { jar } = await connect(d);
    const evil = await handleExport(makeReq('/api/google/export', jar, post({}, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })), d);
    expect(evil.status).toBe(403);
    const evil2 = await handleExport(makeReq('/api/google/export', jar, post({}, { origin: 'https://evil.example', 'sec-fetch-site': '' })), d);
    expect(evil2.status).toBe(403);
    const dis = await handleDisconnect(makeReq('/api/google/disconnect', jar, post(undefined, { 'sec-fetch-site': 'same-site', origin: 'http://sub.localhost:3000' })), d);
    expect(dis.status).toBe(403);
  });

  it('validates the body and the connection', async () => {
    const d = deps(REAL_ENV, fakeGoogle().fetch);
    expect((await handleExport(makeReq('/api/google/export', undefined, post({})), d)).status).toBe(401);
    const { jar } = await connect(d);
    expect((await handleExport(makeReq('/api/google/export', jar, post({ since: 'yesterday' })), d)).status).toBe(400);
    expect((await handleExport(makeReq('/api/google/export', jar, post({ since: '2099-01-01T00:00:00Z' })), d)).status).toBe(400);
    expect((await handleExport(makeReq('/api/google/export', jar, post([1]) ), d)).status).toBe(400);
  });

  it('a tampered session cookie means not connected', async () => {
    const d = deps(REAL_ENV, fakeGoogle().fetch);
    const { jar } = await connect(d);
    const v = jar.cookies.get('drift_google')!;
    jar.cookies.set('drift_google', v.slice(0, -4) + (v.endsWith('AAAA') ? 'BBBB' : 'AAAA'));
    const status = await (await handleStatus(makeReq('/api/google/status', jar), d)).json();
    expect(status.connected).toBe(false);
  });
});

describe('job state', () => {
  it('aggregates bundled jobs', async () => {
    const g = fakeGoogle({ jobStates: { 'job-2': { state: 'IN_PROGRESS' } } });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res1 = (await (await handleJobState(makeReq('/api/google/export/job-1~job-2', jar), 'job-1~job-2', d)).json()) as GoogleJobStateResponse;
    expect(res1.state).toBe('IN_PROGRESS');
    expect(res1.urls).toEqual([]);
    expect(g.calls.some((c) => c.url === 'https://dataportability.googleapis.com/v1/archiveJobs/job-1/portabilityArchiveState')).toBe(true);

    const res2 = (await (await handleJobState(makeReq('/api/google/export/job-1~job-3', jar), 'job-1~job-3', d)).json()) as GoogleJobStateResponse;
    expect(res2.state).toBe('COMPLETE');
    expect(res2.urls).toHaveLength(2);
    expect(res2.urls[0]).toMatch(/^https:\/\/storage\.googleapis\.com\//);
    expect(res2.exportTime).toBe('2026-10-18T10:00:00Z');
  });

  it('reports a failed main job; a failed side job is a warning', async () => {
    const g = fakeGoogle({ jobStates: { bad: { state: 'FAILED' } } });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const failed = await (await handleJobState(makeReq('/x', jar), 'bad~job-1', d)).json();
    expect(failed.state).toBe('FAILED');
    const partial = await (await handleJobState(makeReq('/x', jar), 'job-1~bad', d)).json();
    expect(partial.state).toBe('COMPLETE');
    expect(partial.warnings).toHaveLength(1);
  });

  it('rejects bad job ids and missing sessions', async () => {
    const d = deps(REAL_ENV, fakeGoogle().fetch);
    expect((await handleJobState(makeReq('/x'), 'job-1', d)).status).toBe(401);
    const { jar } = await connect(d);
    expect((await handleJobState(makeReq('/x', jar), '../../etc', d)).status).toBe(400);
    expect((await handleJobState(makeReq('/x', jar), 'a~b~c~d~e', d)).status).toBe(400);
  });
});

describe('disconnect', () => {
  it('calls resetAuthorization and clears cookies', async () => {
    const g = fakeGoogle();
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res = jar.apply(await handleDisconnect(makeReq('/api/google/disconnect', jar, post()), d));
    expect(await res.json()).toEqual({ connected: false, revoked: true });
    const reset = g.calls.find((c) => c.url === 'https://dataportability.googleapis.com/v1/authorization:reset')!;
    expect(reset.method).toBe('POST');
    expect(reset.headers.authorization).toBe('Bearer at-1');
    expect(jar.cookies.has('drift_google')).toBe(false);
    expect(jar.cookies.has('drift_google_status')).toBe(false);
    expect((await (await handleStatus(makeReq('/api/google/status', jar), d)).json()).connected).toBe(false);
  });

  it('still clears cookies when Google fails', async () => {
    const g = fakeGoogle();
    g.responders.push({ match: 'authorization:reset', respond: () => jsonRes({ error: { code: 500, status: 'INTERNAL' } }, 500) });
    const d = deps(REAL_ENV, g.fetch);
    const { jar } = await connect(d);
    const res = jar.apply(await handleDisconnect(makeReq('/api/google/disconnect', jar, post()), d));
    expect(await res.json()).toEqual({ connected: false, revoked: false });
    expect(jar.cookies.has('drift_google')).toBe(false);
  });
});

describe('mock mode end to end', () => {
  it('connects, exports, completes and serves an archive that parses', async () => {
    const clock = { now: Date.parse('2026-10-18T12:00:00Z') };
    const g = fakeGoogle();
    const d = deps({ DRIFT_GOOGLE_MOCK: '1' }, g.fetch, clock);
    const { jar, cb, loc } = await connect(d);
    expect(loc.pathname).toBe('/api/google/auth/callback');
    expect(cb.headers.get('location')).toBe(`${ORIGIN}/connect?google=connected`);
    const status = await (await handleStatus(makeReq('/api/google/status', jar), d)).json();
    expect(status).toMatchObject({ configured: true, connected: true, mock: true, accessType: 'time-based' });

    const exp = (await (await handleExport(makeReq('/api/google/export', jar, post({})), d)).json()) as GoogleExportResponse;
    expect(exp.jobId).toMatch(/^mock_/);
    const s1 = (await (await handleJobState(makeReq('/x', jar), exp.jobId, d)).json()) as GoogleJobStateResponse;
    expect(s1.state).toBe('IN_PROGRESS');
    clock.now += 5000;
    const s2 = (await (await handleJobState(makeReq('/x', jar), exp.jobId, d)).json()) as GoogleJobStateResponse;
    expect(s2.state).toBe('COMPLETE');
    expect(s2.urls[0]).toBe(`${ORIGIN}/api/google/mock-archive/${exp.jobId}`);

    const archive = await handleMockArchive(makeReq(new URL(s2.urls[0]).pathname, jar), exp.jobId, d);
    expect(archive.headers.get('content-type')).toBe('application/zip');
    const bytes = new Uint8Array(await archive.arrayBuffer());

    // Same bytes through the download proxy (mock URL is on the allow-list in mock mode).
    const viaProxy = await handleDownload(makeReq(`/api/google/download?url=${encodeURIComponent(s2.urls[0])}`, jar), {
      ...d,
      fetch: async (u) => handleMockArchive(makeReq(new URL(u).pathname), exp.jobId, d),
    });
    expect(new Uint8Array(await viaProxy.arrayBuffer())).toEqual(bytes);

    const built = buildImportZip([{ name: 'part-1.zip', bytes }]);
    expect(built.files.sort()).toEqual([
      'Takeout/My Activity/Search/MyActivity.json',
      'Takeout/My Activity/YouTube/MyActivity.json',
      'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv',
    ]);
    expect(g.calls).toHaveLength(0); // mock mode never calls Google
  });

  it('mock archive route is 404 outside mock mode', async () => {
    const res = await handleMockArchive(makeReq('/api/google/mock-archive/x'), 'mock_x', deps(REAL_ENV, fakeGoogle().fetch));
    expect(res.status).toBe(404);
  });

  it('mock archive is read by parseExport', async () => {
    const clock = { now: Date.parse('2026-10-18T12:00:00Z') };
    const d = deps({ DRIFT_GOOGLE_MOCK: '1' }, fakeGoogle().fetch, clock);
    const { jar } = await connect(d);
    const exp = (await (await handleExport(makeReq('/api/google/export', jar, post({})), d)).json()) as GoogleExportResponse;
    clock.now += 5000;
    const bytes = new Uint8Array(await (await handleMockArchive(makeReq('/x'), exp.jobId, d)).arrayBuffer());
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = Object.entries(unzipSync(buildImportZip([{ name: 'a.zip', bytes }]).zip)).map(([path, b]) => ({ path, text: async () => strFromU8(b) }));
    const [res] = await parseExport(files);
    expect(res.platform).toBe('mixed');
    const kinds = new Set(res.events.map((e) => `${e.platform}:${e.kind}`));
    expect(kinds).toEqual(new Set(['youtube:watch', 'youtube:search', 'youtube:ad', 'google_search:search']));
    expect(res.events.length).toBeGreaterThan(500);
    expect(res.follows.length).toBe(4);
  });
});
