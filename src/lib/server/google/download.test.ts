import { describe, expect, it } from 'vitest';
import { handleDownload, isAllowedDownloadUrl } from './download';
import { handleAuthCallback, handleAuthStart } from './handlers';
import { CookieJar, ORIGIN, REAL_ENV, deps, fakeGoogle, makeReq } from './testUtils';
import type { FetchLike } from './api';

describe('download allow-list', () => {
  it.each([
    'https://storage.googleapis.com/bucket/obj.zip?X-Goog-Signature=abc',
    'https://bucket.storage.googleapis.com/obj.zip',
  ])('allows %s', (u) => expect(isAllowedDownloadUrl(u)).toBe(true));

  it.each([
    'http://storage.googleapis.com/bucket/obj.zip',
    'https://storage.googleapis.com:8443/bucket/obj.zip',
    'https://user:pw@storage.googleapis.com/bucket/obj.zip',
    'https://storage.googleapis.com.evil.example/obj.zip',
    'https://evilstorage.googleapis.com/obj.zip',
    'https://.storage.googleapis.com/obj.zip',
    'https://example.com/?u=https://storage.googleapis.com/x',
    'https://169.254.169.254/latest/meta-data',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    '',
    `https://storage.googleapis.com/${'a'.repeat(9000)}`,
  ])('refuses %s', (u) => expect(isAllowedDownloadUrl(u)).toBe(false));

  it('allows the mock archive path only in mock mode on the same origin', () => {
    const u = `${ORIGIN}/api/google/mock-archive/mock_abc`;
    expect(isAllowedDownloadUrl(u)).toBe(false);
    expect(isAllowedDownloadUrl(u, { mock: true, origin: ORIGIN })).toBe(true);
    expect(isAllowedDownloadUrl(`${ORIGIN}/api/google/status`, { mock: true, origin: ORIGIN })).toBe(false);
    expect(isAllowedDownloadUrl('https://evil.example/api/google/mock-archive/x', { mock: true, origin: ORIGIN })).toBe(false);
  });
});

async function connected(fetchImpl: FetchLike) {
  const d = deps(REAL_ENV, fakeGoogle().fetch);
  const jar = new CookieJar();
  const start = jar.apply(await handleAuthStart(makeReq('/api/google/auth/start'), d));
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  jar.apply(await handleAuthCallback(makeReq(`/api/google/auth/callback?code=c&state=${state}`, jar), d));
  return { jar, d: { ...d, fetch: fetchImpl } };
}

describe('download proxy', () => {
  const signed = 'https://storage.googleapis.com/dp-bucket/archive.zip?X-Goog-Signature=abc';

  it('streams the upstream body with safe headers and no redirects', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const { jar, d } = await connected(async (url, init) => {
      seen.push({ url, init });
      return new Response(new Uint8Array([0x50, 0x4b, 3, 4, 9]), { headers: { 'content-type': 'application/zip', 'content-length': '5', 'set-cookie': 'x=y' } });
    });
    const res = await handleDownload(makeReq(`/api/google/download?url=${encodeURIComponent(signed)}`, jar, { headers: { 'sec-fetch-site': 'same-origin' } }), d);
    expect(res.status).toBe(200);
    expect(seen[0].url).toBe(signed);
    expect(seen[0].init?.redirect).toBe('error');
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 3, 4, 9]));
  });

  it('refuses hosts outside the allow-list without fetching', async () => {
    let fetched = false;
    const { jar, d } = await connected(async () => {
      fetched = true;
      return new Response('x');
    });
    const res = await handleDownload(makeReq(`/api/google/download?url=${encodeURIComponent('https://evil.example/x.zip')}`, jar), d);
    expect(res.status).toBe(400);
    expect(fetched).toBe(false);
  });

  it('requires a connection and a same-origin request', async () => {
    const { jar, d } = await connected(async () => new Response('x'));
    expect((await handleDownload(makeReq(`/api/google/download?url=${encodeURIComponent(signed)}`), d)).status).toBe(401);
    const cross = await handleDownload(makeReq(`/api/google/download?url=${encodeURIComponent(signed)}`, jar, { headers: { 'sec-fetch-site': 'cross-site' } }), d);
    expect(cross.status).toBe(403);
  });

  it('reports an expired signed URL as 410', async () => {
    const { jar, d } = await connected(async () => new Response('<Error>ExpiredToken</Error>', { status: 400 }));
    const res = await handleDownload(makeReq(`/api/google/download?url=${encodeURIComponent(signed)}`, jar), d);
    expect(res.status).toBe(410);
  });
});
