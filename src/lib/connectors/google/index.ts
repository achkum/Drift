// OWNER: sync agent. Browser client for automatic YouTube + Google Search sync through Google's
// Data Portability API. The server only brokers OAuth and export jobs; the archive is downloaded
// into this browser and imported with the normal pipeline (importFiles), so history is analysed
// and stored on this device only. See docs/GOOGLE_SETUP.md.
//
// UI usage:
//   const status = await getGoogleStatus();            // show Connect / Connected / not configured
//   connectGoogle();                                    // leaves the page; returns to /connect?google=connected|error&reason=…
//   const records = await syncGoogle(setProgress);      // initiate → wait → download → import
//   if (await shouldAutoSync()) syncGoogle(setProgress) // e.g. on app start
//   await disconnectGoogle();
import type { ImportProgress, ImportRecord } from '@/lib/types';
import { importFiles } from '@/lib/pipeline';
import { buildImportZip } from './adapter';
import type {
  GoogleErrorCode,
  GoogleErrorResponse,
  GoogleExportResponse,
  GoogleJobStateResponse,
  GoogleStatusResponse,
} from './types';

export type {
  GoogleStatusResponse as GoogleStatus,
  GoogleAccessType,
  GoogleErrorCode,
  GoogleResource,
} from './types';

const API = '/api/google';
const STORAGE_KEY = 'drift.google.sync';
const DAY_MS = 86_400_000;
/** Overlap incremental exports a little so nothing between two exports is lost (events dedupe). */
const SINCE_OVERLAP_MS = 10 * 60_000;
/** Signed URLs last ~6 h and archives ~14 days; resume a pending job for up to 6 days. */
const PENDING_MAX_AGE_MS = 6 * DAY_MS;

/** Thrown by the client for any failed step. `code` is the server's error code when there is one. */
export class GoogleSyncError extends Error {
  constructor(
    message: string,
    public code: GoogleErrorCode | 'failed' | 'aborted' | 'empty' = 'failed',
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'GoogleSyncError';
  }
}

/** What this browser remembers about Google sync (localStorage, no history, no tokens). */
export interface GoogleSyncInfo {
  /** Last successful sync (ISO). */
  lastSyncAt?: string;
  /** Start time for the next incremental export (Google's exportTime of the last one). */
  nextSince?: string;
  /** Export started but not imported yet (survives reloads). */
  pending?: { jobId: string; startedAt: string; since?: string };
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function getGoogleSyncInfo(): GoogleSyncInfo {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as GoogleSyncInfo) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function setSyncInfo(info: GoogleSyncInfo): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Private mode etc.: sync still works, it just won't be incremental.
  }
}

/** Forget local sync state (next sync is a full export). */
export function resetGoogleSyncInfo(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new GoogleSyncError('Could not reach Drift. Check your connection.', 'upstream_error');
  }
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = (body ?? {}) as Partial<GoogleErrorResponse>;
    throw new GoogleSyncError(e.message || `Request failed (HTTP ${res.status}).`, e.error ?? 'failed', e.retryAfter);
  }
  return body as T;
}

/** Server status. `live: true` re-checks the access type with Google (slower). */
export async function getGoogleStatus(opts: { live?: boolean } = {}): Promise<GoogleStatusResponse> {
  try {
    return await api<GoogleStatusResponse>(`/status${opts.live ? '?live=1' : ''}`);
  } catch (err) {
    if (err instanceof GoogleSyncError && err.code === 'not_configured') return { configured: false, connected: false };
    throw err;
  }
}

/** Starts Google's consent flow by navigating away. Comes back to /connect?google=connected or ?google=error&reason=… */
export function connectGoogle(): void {
  if (typeof window !== 'undefined') window.location.assign(`${API}/auth/start`);
}

/** Revokes Drift's access at Google (resetAuthorization) and forgets the connection and local sync state. */
export async function disconnectGoogle(): Promise<{ revoked: boolean }> {
  const res = await api<{ connected: false; revoked: boolean }>('/disconnect', { method: 'POST' });
  resetGoogleSyncInfo();
  return { revoked: res.revoked };
}

/**
 * True when a background sync makes sense now: connected, nothing synced in the last 24 h (Google
 * allows one time-based export per 24 h), or an export is still pending. One-time access allows a
 * single export, so it auto-syncs only if this browser never synced.
 */
export async function shouldAutoSync(status?: GoogleStatusResponse, now = Date.now()): Promise<boolean> {
  const s = status ?? (await getGoogleStatus().catch(() => undefined));
  if (!s?.configured || !s.connected) return false;
  const info = getGoogleSyncInfo();
  if (info.pending && now - Date.parse(info.pending.startedAt) < PENDING_MAX_AGE_MS) return true;
  if (s.accessType === 'one-time') return !info.lastSyncAt && !s.lastExportAt;
  const last = Math.max(info.lastSyncAt ? Date.parse(info.lastSyncAt) : 0, s.lastExportAt ? Date.parse(s.lastExportAt) : 0);
  return now - last > DAY_MS;
}

export interface SyncOptions {
  /** Ignore the last sync time and export everything Google has. */
  full?: boolean;
  signal?: AbortSignal;
  /** First poll delay; grows ×1.6 up to maxPollMs. Defaults 3 s / 60 s. */
  pollMs?: number;
  maxPollMs?: number;
  /** Give up waiting after this long (the job stays pending and resumes next time). Default 3 h. */
  maxWaitMs?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new GoogleSyncError('Sync cancelled.', 'aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new GoogleSyncError('Sync cancelled.', 'aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function sameOrigin(url: string): boolean {
  if (typeof location === 'undefined') return url.startsWith('/');
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

async function readAll(res: Response, onBytes: (n: number) => void): Promise<Uint8Array> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(total);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Downloads one signed URL. Tries the browser first (works if Google's bucket allows CORS, and
 * always for same-origin mock URLs); falls back to the server's streaming proxy when the direct
 * request is blocked.
 */
async function download(url: string, signal: AbortSignal | undefined, onBytes: (n: number) => void): Promise<Uint8Array> {
  let res: Response | undefined;
  if (sameOrigin(url)) {
    res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
  } else {
    try {
      res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal });
    } catch (err) {
      if (signal?.aborted) throw new GoogleSyncError('Sync cancelled.', 'aborted');
      void err; // CORS or network error: use the proxy.
      res = undefined;
    }
    if (!res || !res.ok) {
      res = await fetch(`${API}/download?url=${encodeURIComponent(url)}`, { credentials: 'same-origin', cache: 'no-store', signal });
    }
  }
  if (!res.ok) {
    let msg = `Download failed (HTTP ${res.status}).`;
    try {
      msg = ((await res.json()) as GoogleErrorResponse).message || msg;
    } catch {
      /* not JSON */
    }
    throw new GoogleSyncError(msg, res.status === 410 ? 'not_found' : 'upstream_error');
  }
  return readAll(res, onBytes);
}

function fileNameFromUrl(url: string, i: number): string {
  try {
    const last = new URL(url, 'https://x.invalid').pathname.split('/').pop() ?? '';
    if (/\.(json|html?|csv)$/i.test(last)) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  return `part-${i + 1}.zip`;
}

/**
 * Full sync: start (or resume) a Google export, wait for it, download it into this browser and
 * import it. Incremental after the first run (since = previous export's exportTime).
 * Progress uses stage 'reading' while waiting / downloading, then the pipeline's own stages.
 * Rejects with GoogleSyncError (e.g. code 'already_exported' within 24 h of the last export).
 */
export async function syncGoogle(onProgress?: (p: ImportProgress) => void, opts: SyncOptions = {}): Promise<ImportRecord[]> {
  const report = (message: string, fraction?: number) => onProgress?.({ stage: 'reading', message, fraction });
  const fail = (err: unknown): never => {
    const e = err instanceof GoogleSyncError ? err : new GoogleSyncError(err instanceof Error ? err.message : 'Google sync failed.');
    onProgress?.({ stage: 'error', message: e.message });
    throw e;
  };

  try {
    let info = getGoogleSyncInfo();
    const warnings: string[] = [];

    // 1. Start an export, or resume one started earlier (a reload must not burn the 24 h quota).
    let jobId: string;
    let startedAt: string;
    if (info.pending && Date.now() - Date.parse(info.pending.startedAt) < PENDING_MAX_AGE_MS && !opts.full) {
      ({ jobId, startedAt } = info.pending);
      report('Checking on your Google export');
    } else {
      report('Asking Google for your YouTube and Search history');
      const since = opts.full ? undefined : info.nextSince;
      startedAt = new Date().toISOString();
      const res = await api<GoogleExportResponse>('/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(since ? { since } : {}),
        signal: opts.signal,
      });
      jobId = res.jobId;
      warnings.push(...res.warnings);
      info = { ...info, pending: { jobId, startedAt, since } };
      setSyncInfo(info);
    }

    // 2. Poll with backoff. Google: archives take minutes to hours.
    let delay = opts.pollMs ?? 3000;
    const maxDelay = opts.maxPollMs ?? 60_000;
    const deadline = Date.now() + (opts.maxWaitMs ?? 3 * 3600_000);
    let state: GoogleJobStateResponse;
    for (;;) {
      state = await api<GoogleJobStateResponse>(`/export/${encodeURIComponent(jobId)}`, { signal: opts.signal });
      if (state.state === 'COMPLETE') break;
      if (state.state === 'FAILED' || state.state === 'CANCELLED') {
        setSyncInfo({ ...getGoogleSyncInfo(), pending: undefined });
        throw new GoogleSyncError(`Google could not prepare the export (${state.state.toLowerCase()}). Try again later.`, 'failed');
      }
      if (Date.now() + delay > deadline) {
        throw new GoogleSyncError('Google is still preparing your export. Drift will pick it up next time.', 'failed');
      }
      report('Google is preparing your export. This can take a while.');
      await sleep(delay, opts.signal);
      delay = Math.min(maxDelay, Math.round(delay * 1.6));
    }
    warnings.push(...state.warnings);
    if (!state.urls.length) throw new GoogleSyncError('Google finished the export but sent no files.', 'empty');

    // 3. Download every part into memory (this browser only).
    const parts: { name: string; bytes: Uint8Array }[] = [];
    for (let i = 0; i < state.urls.length; i++) {
      const label = state.urls.length > 1 ? `Downloading part ${i + 1} of ${state.urls.length}` : 'Downloading your Google data';
      report(label, i / state.urls.length);
      const bytes = await download(state.urls[i], opts.signal, (n) => report(`${label} (${(n / 1e6).toFixed(1)} MB)`, i / state.urls.length));
      parts.push({ name: fileNameFromUrl(state.urls[i], i), bytes });
    }
    report('Download complete', 1);

    // 4. Re-shape into a Takeout-style zip the YouTube parser reads, then import.
    const built = buildImportZip(parts);
    warnings.push(...built.warnings);
    if (!built.files.length) throw new GoogleSyncError('The Google export had no YouTube or Search history in it.', 'empty');
    const date = (state.exportTime ?? new Date().toISOString()).slice(0, 10);
    const file = new File([built.zip as BlobPart], `google-sync-${date}.zip`, { type: 'application/zip' });
    const records = await importFiles([file], onProgress);

    // 5. Remember where the next incremental export should start.
    const exportMs = state.exportTime ? Date.parse(state.exportTime) : Date.parse(startedAt);
    setSyncInfo({
      lastSyncAt: new Date().toISOString(),
      nextSince: new Date(exportMs - SINCE_OVERLAP_MS).toISOString(),
    });
    if (warnings.length && records.length) records[0] = { ...records[0], warnings: [...records[0].warnings, ...warnings] };
    return records;
  } catch (err) {
    if (opts.signal?.aborted && !(err instanceof GoogleSyncError)) return fail(new GoogleSyncError('Sync cancelled.', 'aborted'));
    return fail(err);
  }
}
