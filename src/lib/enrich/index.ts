// OWNER: MVP2 enrich agent. Opt-in title lookup: fills missing titles by sending only video ids/links.
//
// Both YouTube and TikTok oEmbed endpoints answer cross-origin requests (YouTube echoes the Origin in
// Access-Control-Allow-Origin, TikTok sends `*`), so the browser/worker calls them directly. No Drift
// server is involved. Each request carries one rebuilt public video link and nothing else:
// no cookies (credentials: 'omit'), no referrer.
import type { DriftEvent, EventKind, ImportProgress } from '@/lib/types';
import { canonicalVideoUrl, oembedEndpoint, readOembed, type OembedInfo } from './oembed';

export { canonicalVideoUrl, oembedEndpoint } from './oembed';

export interface LookupOptions {
  /** Max distinct videos looked up per run, newest first. */
  cap?: number;
  /** Parallel requests. */
  concurrency?: number;
  /** Pause each lane takes between requests, ms. */
  gapMs?: number;
  /** Per-request timeout, ms. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULTS = { cap: 3000, concurrency: 4, gapMs: 150, timeoutMs: 8000 };

const KINDS = new Set<EventKind>(['watch', 'like', 'save', 'share', 'ad']);

/** Results remembered for this session: found titles, and videos that are gone/private (not retried). */
const found = new Map<string, OembedInfo>();
const missing = new Set<string>();

/** Test hook. */
export function resetLookupCache(): void {
  found.clear();
  missing.clear();
}

type Outcome = { kind: 'ok'; info: OembedInfo } | { kind: 'gone' } | { kind: 'retry' } | { kind: 'throttled' };

async function fetchOne(videoUrl: string, f: typeof fetch, timeoutMs: number): Promise<Outcome> {
  const endpoint = oembedEndpoint(videoUrl);
  if (!endpoint) return { kind: 'gone' };
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced, so a request that ignores the abort signal still can't stall the run.
  const timeout = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => { ctrl?.abort(); resolve({ kind: 'retry' }); }, timeoutMs);
  });
  const request = (async (): Promise<Outcome> => {
    const res = await f(endpoint, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: ctrl?.signal,
    });
    if (res.status === 429) return { kind: 'throttled' };
    // 400 = unknown/removed id, 401/403 = private or embedding off, 404/410 = removed.
    if ([400, 401, 403, 404, 410].includes(res.status)) return { kind: 'gone' };
    if (!res.ok) return { kind: 'retry' };
    const info = readOembed(await res.json());
    return info.title ? { kind: 'ok', info } : { kind: 'gone' };
  })().catch((): Outcome => ({ kind: 'retry' }));
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function needsTitle(e: DriftEvent): boolean {
  return KINDS.has(e.kind) && !e.title?.trim() && e.titleSource !== 'lookup' && (e.platform === 'youtube' || e.platform === 'tiktok');
}

function applyInfo(e: DriftEvent, info: OembedInfo): DriftEvent {
  const out: DriftEvent = { ...e, title: info.title, titleSource: 'lookup' };
  if (!e.channel?.name && info.authorName) {
    out.channel = info.authorUrl ? { name: info.authorName, url: info.authorUrl } : { name: info.authorName };
  }
  return out;
}

/**
 * Returns the events whose title was filled in (with titleSource 'lookup'), for the caller to save.
 * Never throws: network failures are skipped.
 */
export async function lookupMissingTitles(
  events: DriftEvent[],
  onProgress?: (p: ImportProgress) => void,
  options: LookupOptions = {},
): Promise<DriftEvent[]> {
  const report = (p: ImportProgress) => { try { onProgress?.(p); } catch { /* ignore UI errors */ } };
  try {
    const f = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    if (!f) return [];
    const cap = Math.max(0, options.cap ?? DEFAULTS.cap);
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULTS.concurrency));
    const gapMs = Math.max(0, options.gapMs ?? DEFAULTS.gapMs);
    const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;

    // Group events by video link, remembering the newest time per link.
    const byUrl = new Map<string, { newest: number; events: DriftEvent[] }>();
    for (const e of events) {
      if (!e || !needsTitle(e)) continue;
      const url = canonicalVideoUrl(e);
      if (!url || missing.has(url)) continue;
      const t = Date.parse(e.time) || 0;
      const g = byUrl.get(url);
      if (g) { g.events.push(e); if (t > g.newest) g.newest = t; } else byUrl.set(url, { newest: t, events: [e] });
    }
    if (byUrl.size === 0) return [];

    const changed: DriftEvent[] = [];
    const toFetch: string[] = [];
    for (const [url, g] of byUrl) {
      const known = found.get(url);
      if (known) for (const e of g.events) changed.push(applyInfo(e, known));
      else toFetch.push(url);
    }
    toFetch.sort((a, b) => byUrl.get(b)!.newest - byUrl.get(a)!.newest);
    const queue = toFetch.slice(0, cap);
    if (queue.length === 0) return changed;

    const total = queue.length;
    let done = 0;
    let next = 0;
    const throttled = { youtube: false, tiktok: false };
    const message = 'Looking up missing video titles (only video links are sent)';
    report({ stage: 'enriching', message, fraction: 0 });

    const lane = async () => {
      while (next < queue.length) {
        const url = queue[next++];
        const host = url.startsWith('https://www.youtube.com/') ? 'youtube' : 'tiktok';
        if (!throttled[host]) {
          const out = await fetchOne(url, f, timeoutMs);
          if (out.kind === 'ok') {
            found.set(url, out.info);
            for (const e of byUrl.get(url)!.events) changed.push(applyInfo(e, out.info));
          } else if (out.kind === 'gone') {
            missing.add(url);
          } else if (out.kind === 'throttled') {
            // Asked to slow down: leave this platform alone for the rest of the run.
            throttled[host] = true;
          }
          if (gapMs && next < queue.length) await sleep(gapMs);
        }
        done++;
        if (done === total || done % 10 === 0) report({ stage: 'enriching', message, fraction: done / total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, lane));
    return changed;
  } catch {
    return [];
  }
}
