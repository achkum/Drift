import { beforeEach, describe, expect, it } from 'vitest';
import type { DriftEvent, ImportProgress } from '@/lib/types';
import { canonicalVideoUrl, lookupMissingTitles, oembedEndpoint, resetLookupCache } from './index';

const YT = 'dQw4w9WgXcQ';
const TT = '6718335390845095173';

function ev(p: Partial<DriftEvent> & Pick<DriftEvent, 'platform'>): DriftEvent {
  return { id: `${p.platform}:${p.time ?? 't'}:${p.url ?? p.itemId}`, kind: 'watch', time: '2024-05-01T10:00:00Z', ...p };
}

type Reply = { status: number; body?: unknown } | Error;

function mockFetch(reply: (url: string) => Reply | Promise<Reply>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let active = 0;
  let maxActive = 0;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise((r) => setTimeout(r, 2));
      const r = await reply(url);
      if (r instanceof Error) throw r;
      return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
    } finally {
      active--;
    }
  }) as typeof fetch;
  return { f, calls, maxActive: () => maxActive };
}

const ok = (title: string, author = 'Someone', authorUrl = 'https://www.youtube.com/@someone') =>
  ({ status: 200, body: { title, author_name: author, author_url: authorUrl } });

beforeEach(() => resetLookupCache());

describe('allow-list', () => {
  it('rebuilds canonical YouTube and TikTok links', () => {
    expect(canonicalVideoUrl({ platform: 'youtube', url: `https://www.youtube.com/watch?v=${YT}&list=x&t=3` })).toBe(`https://www.youtube.com/watch?v=${YT}`);
    expect(canonicalVideoUrl({ platform: 'youtube', url: `https://youtu.be/${YT}?si=tracking` })).toBe(`https://www.youtube.com/watch?v=${YT}`);
    expect(canonicalVideoUrl({ platform: 'youtube', url: `https://m.youtube.com/shorts/${YT}` })).toBe(`https://www.youtube.com/watch?v=${YT}`);
    expect(canonicalVideoUrl({ platform: 'tiktok', url: `https://www.tiktokv.com/share/video/${TT}/` })).toBe(`https://www.tiktok.com/@/video/${TT}`);
    expect(canonicalVideoUrl({ platform: 'tiktok', itemId: TT })).toBe(`https://www.tiktok.com/@/video/${TT}`);
  });

  it('rejects other hosts, platforms and malformed ids', () => {
    expect(canonicalVideoUrl({ platform: 'youtube', url: `https://evil.com/watch?v=${YT}` })).toBeUndefined();
    expect(canonicalVideoUrl({ platform: 'youtube', url: `https://www.youtube.com.evil.com/watch?v=${YT}` })).toBeUndefined();
    expect(canonicalVideoUrl({ platform: 'youtube', url: 'https://www.youtube.com/results?search_query=secret' })).toBeUndefined();
    expect(canonicalVideoUrl({ platform: 'youtube', url: 'javascript:alert(1)' })).toBeUndefined();
    expect(canonicalVideoUrl({ platform: 'tiktok', url: 'https://www.tiktok.com/@me' })).toBeUndefined();
    expect(canonicalVideoUrl({ platform: 'instagram', url: 'https://www.instagram.com/p/abc/' })).toBeUndefined();
    expect(canonicalVideoUrl({ platform: 'google_search', url: `https://www.youtube.com/watch?v=${YT}` })).toBeUndefined();
  });

  it('builds oEmbed requests only for canonical links', () => {
    expect(oembedEndpoint(`https://www.youtube.com/watch?v=${YT}`)).toBe(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${YT}`)}`,
    );
    expect(oembedEndpoint(`https://www.tiktok.com/@/video/${TT}`)).toMatch(/^https:\/\/www\.tiktok\.com\/oembed\?url=/);
    expect(oembedEndpoint(`https://www.youtube.com/watch?v=${YT}&email=me@x.se`)).toBeUndefined();
    expect(oembedEndpoint('https://example.com/')).toBeUndefined();
    expect(oembedEndpoint(`https://www.tiktok.com/@user/video/${TT}?lang=sv`)).toBeUndefined();
  });
});

describe('lookupMissingTitles', () => {
  it('fills titles and channels, dedupes by link and returns only changed events', async () => {
    const m = mockFetch(() => ok('Never Gonna Give You Up', 'Rick Astley'));
    const events = [
      ev({ platform: 'youtube', url: `https://www.youtube.com/watch?v=${YT}`, time: '2024-05-01T10:00:00Z' }),
      ev({ platform: 'youtube', kind: 'like', url: `https://youtu.be/${YT}`, time: '2024-05-02T10:00:00Z', channel: { name: 'Kept' } }),
      ev({ platform: 'youtube', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: 'Has a title' }),
      ev({ platform: 'youtube', kind: 'search', query: 'private search', url: 'https://www.youtube.com/results?search_query=x' }),
      ev({ platform: 'youtube', kind: 'comment', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' }),
    ];
    const progress: ImportProgress[] = [];
    const out = await lookupMissingTitles(events, (p) => progress.push(p), { fetch: m.f, gapMs: 0 });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].init?.credentials).toBe('omit');
    expect(m.calls[0].init?.referrerPolicy).toBe('no-referrer');
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.title === 'Never Gonna Give You Up' && e.titleSource === 'lookup')).toBe(true);
    expect(out.find((e) => e.kind === 'watch')?.channel).toEqual({ name: 'Rick Astley', url: 'https://www.youtube.com/@someone' });
    expect(out.find((e) => e.kind === 'like')?.channel).toEqual({ name: 'Kept' });
    expect(progress.every((p) => p.stage === 'enriching')).toBe(true);
    expect(progress.at(-1)?.fraction).toBe(1);
    // Inputs are not mutated.
    expect(events[0].title).toBeUndefined();
  });

  it('only ever sends the video link', async () => {
    const m = mockFetch(() => ok('t'));
    await lookupMissingTitles(
      [ev({ platform: 'tiktok', url: `https://www.tiktokv.com/share/video/${TT}/?user=me&email=a@b.se` })],
      undefined,
      { fetch: m.f, gapMs: 0 },
    );
    expect(m.calls.map((c) => c.url)).toEqual([
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@/video/${TT}`)}`,
    ]);
  });

  it('caps the run to the newest videos', async () => {
    const m = mockFetch(() => ok('t'));
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ platform: 'tiktok', itemId: String(1_000_000_000 + i), time: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
    const out = await lookupMissingTitles(events, undefined, { fetch: m.f, gapMs: 0, cap: 3 });
    expect(out.map((e) => e.itemId).sort()).toEqual(['1000000007', '1000000008', '1000000009']);
  });

  it('limits concurrency', async () => {
    const m = mockFetch(() => ok('t'));
    const events = Array.from({ length: 20 }, (_, i) => ev({ platform: 'tiktok', itemId: String(2_000_000_000 + i) }));
    const out = await lookupMissingTitles(events, undefined, { fetch: m.f, gapMs: 0, concurrency: 4 });
    expect(out).toHaveLength(20);
    expect(m.maxActive()).toBeLessThanOrEqual(4);
    expect(m.maxActive()).toBeGreaterThan(1);
  });

  it('treats removed/private videos as no title and does not retry them', async () => {
    const statuses: Record<string, number> = { '3000000001': 404, '3000000002': 401, '3000000003': 400, '3000000004': 500 };
    const m = mockFetch((url) => {
      const id = /video%2F(\d+)/.exec(url)![1];
      return { status: statuses[id] ?? 200, body: statuses[id] ? { error: 'x' } : { title: 'ok' } };
    });
    const events = ['3000000001', '3000000002', '3000000003', '3000000004', '3000000005']
      .map((id) => ev({ platform: 'tiktok', itemId: id }));
    const first = await lookupMissingTitles(events, undefined, { fetch: m.f, gapMs: 0 });
    expect(first.map((e) => e.itemId)).toEqual(['3000000005']);
    expect(m.calls).toHaveLength(5);

    const second = await lookupMissingTitles(events, undefined, { fetch: m.f, gapMs: 0 });
    // Found titles come from the session cache, gone videos are skipped, only the 500 is retried.
    expect(second.map((e) => e.itemId)).toEqual(['3000000005']);
    expect(m.calls).toHaveLength(6);
    expect(m.calls[5].url).toContain('3000000004');
  });

  it('never throws on network errors, timeouts or bad JSON', async () => {
    const m = mockFetch((url) => {
      if (url.includes('4000000001')) return new Error('offline');
      if (url.includes('4000000002')) return new Promise(() => {}); // hangs
      if (url.includes('4000000003')) return { status: 200, body: 'not an object' };
      return ok('fine');
    });
    const events = ['4000000001', '4000000002', '4000000003', '4000000004'].map((id) => ev({ platform: 'tiktok', itemId: id }));
    const out = await lookupMissingTitles(events, () => { throw new Error('ui'); }, { fetch: m.f, gapMs: 0, timeoutMs: 20 });
    expect(out.map((e) => e.itemId)).toEqual(['4000000004']);
  });

  it('stops asking a platform that rate-limits', async () => {
    const m = mockFetch(() => ({ status: 429 }));
    const events = Array.from({ length: 10 }, (_, i) => ev({ platform: 'tiktok', itemId: String(5_000_000_000 + i) }));
    const out = await lookupMissingTitles(events, undefined, { fetch: m.f, gapMs: 0, concurrency: 1 });
    expect(out).toEqual([]);
    expect(m.calls).toHaveLength(1);
  });

  it('skips events already looked up and returns [] when there is nothing to do', async () => {
    const m = mockFetch(() => ok('t'));
    const out = await lookupMissingTitles(
      [ev({ platform: 'tiktok', itemId: TT, titleSource: 'lookup' }), ev({ platform: 'instagram', url: 'https://www.instagram.com/p/x/' })],
      undefined,
      { fetch: m.f },
    );
    expect(out).toEqual([]);
    expect(m.calls).toHaveLength(0);
  });
});
