import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { ImportProgress, ImportRecord } from '@/lib/types';

const importFiles = vi.fn<(files: File[], onProgress?: (p: ImportProgress) => void) => Promise<ImportRecord[]>>();
vi.mock('@/lib/pipeline', () => ({ importFiles: (files: File[], cb?: (p: ImportProgress) => void) => importFiles(files, cb) }));

const { syncGoogle, shouldAutoSync, getGoogleStatus, getGoogleSyncInfo, disconnectGoogle, GoogleSyncError } = await import('./index');

const ARCHIVE = zipSync({
  'Portability/My Activity/YouTube/MyActivity.json': strToU8(JSON.stringify([{ header: 'YouTube', title: 'Watched X', titleUrl: 'https://www.youtube.com/watch?v=abcDEF12345', time: '2026-10-01T10:00:00Z' }])),
});
const SIGNED = 'https://storage.googleapis.com/bucket/job-1.zip?X-Goog-Signature=abc';
const RECORD: ImportRecord = { id: 'r1', platform: 'youtube', importedAt: '2026-10-18T12:00:00Z', fileName: 'x.zip', events: 1, newEvents: 1, warnings: [] };

interface Call { url: string; init?: RequestInit }
let calls: Call[];
let routes: ((c: Call) => Response | Promise<Response> | undefined)[];

const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const c = { url: String(input), init };
    calls.push(c);
    for (const r of routes) {
      const res = await r(c);
      if (res) return res;
    }
    throw new Error(`unexpected fetch ${c.url}`);
  });
  importFiles.mockReset();
  importFiles.mockImplementation(async (_files, cb) => {
    cb?.({ stage: 'done', message: 'Done' });
    return [{ ...RECORD }];
  });
});
afterEach(() => vi.unstubAllGlobals());

function happyRoutes(opts: { cors?: boolean; states?: string[] } = {}) {
  const states = [...(opts.states ?? ['IN_PROGRESS', 'COMPLETE'])];
  routes.push((c) => (c.url === '/api/google/export' ? jsonRes({ jobId: 'job-1~job-2', accessType: 'time-based', resources: [], warnings: ['subs skipped'] }) : undefined));
  routes.push((c) => {
    if (!c.url.startsWith('/api/google/export/')) return undefined;
    const state = states.length > 1 ? states.shift()! : states[0];
    return jsonRes({ state, urls: state === 'COMPLETE' ? [SIGNED] : [], jobs: [], warnings: [], exportTime: '2026-10-18T10:00:00Z' });
  });
  routes.push((c) => {
    if (c.url !== SIGNED) return undefined;
    if (!opts.cors) throw new TypeError('Failed to fetch'); // what a CORS block looks like
    return new Response(ARCHIVE);
  });
  routes.push((c) => (c.url.startsWith('/api/google/download?url=') ? new Response(ARCHIVE) : undefined));
}

describe('syncGoogle', () => {
  it('initiates, polls, downloads via the proxy when CORS blocks, adapts and imports', async () => {
    happyRoutes();
    const progress: ImportProgress[] = [];
    const records = await syncGoogle((p) => progress.push(p), { pollMs: 1 });

    const exportCall = calls.find((c) => c.url === '/api/google/export')!;
    expect(exportCall.init?.method).toBe('POST');
    expect(JSON.parse(String(exportCall.init?.body))).toEqual({});
    expect(calls.filter((c) => c.url === '/api/google/export/job-1~job-2')).toHaveLength(2);
    expect(calls.some((c) => c.url === `/api/google/download?url=${encodeURIComponent(SIGNED)}`)).toBe(true);

    expect(importFiles).toHaveBeenCalledTimes(1);
    const file = importFiles.mock.calls[0][0][0];
    expect(file.name).toBe('google-sync-2026-10-18.zip');
    expect(Object.keys(unzipSync(new Uint8Array(await file.arrayBuffer())))).toEqual(['Takeout/My Activity/YouTube/MyActivity.json']);

    expect(records[0].warnings).toEqual(['subs skipped']);
    expect(progress.some((p) => p.stage === 'reading' && /preparing/.test(p.message))).toBe(true);
    expect(progress.some((p) => p.stage === 'reading' && /Downloading/.test(p.message))).toBe(true);
    expect(progress.at(-1)?.stage).toBe('done');

    const info = getGoogleSyncInfo();
    expect(info.pending).toBeUndefined();
    expect(info.nextSince).toBe('2026-10-18T09:50:00.000Z');
    expect(info.lastSyncAt).toBeTruthy();
  });

  it('downloads directly when CORS allows it, and syncs incrementally next time', async () => {
    happyRoutes({ cors: true, states: ['COMPLETE'] });
    await syncGoogle(undefined, { pollMs: 1 });
    expect(calls.some((c) => c.url.startsWith('/api/google/download'))).toBe(false);

    calls = [];
    await syncGoogle(undefined, { pollMs: 1 });
    const body = JSON.parse(String(calls.find((c) => c.url === '/api/google/export')!.init?.body));
    expect(body).toEqual({ since: '2026-10-18T09:50:00.000Z' });

    calls = [];
    await syncGoogle(undefined, { pollMs: 1, full: true });
    expect(JSON.parse(String(calls.find((c) => c.url === '/api/google/export')!.init?.body))).toEqual({});
  });

  it('resumes a pending export instead of starting a new one', async () => {
    happyRoutes({ states: ['COMPLETE'] });
    localStorage.setItem('drift.google.sync', JSON.stringify({ pending: { jobId: 'job-9', startedAt: new Date().toISOString() } }));
    await syncGoogle(undefined, { pollMs: 1 });
    expect(calls.some((c) => c.url === '/api/google/export')).toBe(false);
    expect(calls.some((c) => c.url === '/api/google/export/job-9')).toBe(true);
  });

  it('surfaces the 24 h limit as GoogleSyncError(already_exported)', async () => {
    routes.push(() => jsonRes({ error: 'already_exported', message: 'Google allows one export every 24 hours. Try again later.', retryAfter: 86400 }, 429));
    const progress: ImportProgress[] = [];
    const err = await syncGoogle((p) => progress.push(p)).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleSyncError);
    expect(err.code).toBe('already_exported');
    expect(err.retryAfter).toBe(86400);
    expect(progress.at(-1)).toEqual({ stage: 'error', message: 'Google allows one export every 24 hours. Try again later.' });
    expect(importFiles).not.toHaveBeenCalled();
  });

  it('a failed job clears the pending export', async () => {
    happyRoutes({ states: ['FAILED'] });
    await expect(syncGoogle(undefined, { pollMs: 1 })).rejects.toThrow(/could not prepare/);
    expect(getGoogleSyncInfo().pending).toBeUndefined();
  });

  it('can be cancelled while waiting', async () => {
    happyRoutes({ states: ['IN_PROGRESS'] });
    const ac = new AbortController();
    const p = syncGoogle(undefined, { pollMs: 50, signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
    expect(getGoogleSyncInfo().pending?.jobId).toBe('job-1~job-2'); // resumable
  });
});

describe('status helpers', () => {
  it('getGoogleStatus maps 503 to configured: false', async () => {
    routes.push(() => jsonRes({ error: 'not_configured', message: 'x', configured: false }, 503));
    expect(await getGoogleStatus()).toEqual({ configured: false, connected: false });
  });

  it('shouldAutoSync', async () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const base = { configured: true, connected: true, accessType: 'time-based' as const };
    expect(await shouldAutoSync({ configured: true, connected: false }, now)).toBe(false);
    expect(await shouldAutoSync(base, now)).toBe(true);
    localStorage.setItem('drift.google.sync', JSON.stringify({ lastSyncAt: '2026-10-18T01:00:00Z' }));
    expect(await shouldAutoSync(base, now)).toBe(false);
    localStorage.setItem('drift.google.sync', JSON.stringify({ lastSyncAt: '2026-10-16T01:00:00Z' }));
    expect(await shouldAutoSync(base, now)).toBe(true);
    expect(await shouldAutoSync({ ...base, lastExportAt: '2026-10-18T02:00:00Z' }, now)).toBe(false); // another device exported
    expect(await shouldAutoSync({ ...base, accessType: 'one-time' }, now)).toBe(false);
    localStorage.clear();
    expect(await shouldAutoSync({ ...base, accessType: 'one-time' }, now)).toBe(true);
  });

  it('disconnectGoogle posts and forgets local sync state', async () => {
    localStorage.setItem('drift.google.sync', JSON.stringify({ lastSyncAt: '2026-10-16T01:00:00Z' }));
    routes.push((c) => (c.url === '/api/google/disconnect' && c.init?.method === 'POST' ? jsonRes({ connected: false, revoked: true }) : undefined));
    expect(await disconnectGoogle()).toEqual({ revoked: true });
    expect(getGoogleSyncInfo()).toEqual({});
  });
});
