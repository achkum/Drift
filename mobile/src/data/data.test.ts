import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { DriftEvent, ImportProgress, ParseResult } from '@/lib/types';

vi.mock('expo-sqlite', () => import('./fakeSqlite'));
vi.mock('expo-file-system', () => ({}));

const store = await import('./store');
const { bytesSource, collectExportFiles, unzipDataFiles } = await import('./collect');
const { runImport, recomputeInsights, DriftImportError, NOT_AN_EXPORT_MESSAGE } = await import('./import');
const { dedupeEvents, mergeFollows, mergeInterests, mergeAdvertisers } = await import('./merge');
const { exportResultsJson } = await import('./results');
const { utf8 } = await import('./shims');

const ev = (id: string, time = '2026-03-01T10:00:00Z'): DriftEvent => ({ id, platform: 'youtube', kind: 'watch', time, title: id });
const result = (events: DriftEvent[]): ParseResult =>
  ({ platform: 'youtube', events, follows: [], interests: [], advertisers: [], warnings: [], filesUsed: [] });

beforeEach(async () => {
  await store.closeDb();
});

describe('store', () => {
  it('dedupes events by id and keeps time order', async () => {
    expect(await store.addEvents([ev('b', '2026-02-01T00:00:00Z'), ev('a', '2026-01-01T00:00:00Z'), ev('a')])).toBe(2);
    expect(await store.addEvents([ev('a'), ev('c', '2026-03-01T00:00:00Z')])).toBe(1);
    expect((await store.getAllEvents()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(await store.countEvents()).toBe(3);
  });

  it('putEvents overwrites by id', async () => {
    await store.addEvents([ev('a')]);
    await store.putEvents([{ ...ev('a'), title: 'Renamed' }]);
    expect((await store.getAllEvents())[0].title).toBe('Renamed');
  });

  it('merges interests, follows and advertisers; round-trips insights and settings; clearAll keeps settings', async () => {
    await store.addInterests([{ platform: 'tiktok', interests: ['Cats', 'Food'] }]);
    await store.addInterests([{ platform: 'tiktok', interests: ['cats', 'Dogs'] }]);
    await store.addFollows([{ platform: 'youtube', name: 'Run Club' } as never, { platform: 'youtube', name: 'run club' } as never]);
    await store.addAdvertisers([{ platform: 'tiktok', name: 'Acme', count: 1 } as never, { platform: 'tiktok', name: 'ACME', count: 5 } as never]);
    const all = await store.readAll();
    expect(all.interests).toEqual([{ platform: 'tiktok', interests: ['Cats', 'Food', 'Dogs'] }]);
    expect(all.follows).toHaveLength(1);
    expect(all.advertisers).toHaveLength(1);
    expect((all.advertisers[0] as unknown as { count: number }).count).toBe(5);

    await store.saveInsights({ generatedAt: 'x' } as never);
    await store.saveSettings({ smartTopics: true, titleLookup: false });
    await store.addImports([{ id: '1', platform: 'youtube', importedAt: '2026-01-01', fileName: 'a', events: 1, newEvents: 1, warnings: [] },
      { id: '2', platform: 'youtube', importedAt: '2026-02-01', fileName: 'b', events: 1, newEvents: 1, warnings: [] }]);
    expect((await store.getAllImports()).map((r) => r.id)).toEqual(['2', '1']);
    expect(await store.loadInsights()).toEqual({ generatedAt: 'x' });

    await store.clearAll();
    expect(await store.loadInsights()).toBeNull();
    expect((await store.readAll()).interests).toEqual([]);
    expect(await store.loadSettings()).toEqual({ smartTopics: true, titleLookup: false });
  });

  it('inserts 50,000 events quickly', async () => {
    const events = Array.from({ length: 50_000 }, (_, i) => ev(`e${i}`, new Date(1.7e12 + i * 1000).toISOString()));
    const t0 = Date.now();
    expect(await store.addEvents(events)).toBe(50_000);
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(await store.countEvents()).toBe(50_000);
  });
});

describe('merge', () => {
  it('counts only unseen events per result', () => {
    const { fresh, perResultNew } = dedupeEvents([result([ev('a'), ev('b')]), result([ev('b'), ev('c')])], new Set(['a']));
    expect(fresh.map((e) => e.id)).toEqual(['b', 'c']);
    expect(perResultNew).toEqual([1, 1]);
  });
  it('merges lists case-insensitively', () => {
    expect(mergeInterests([{ platform: 'tiktok', interests: ['A'] }], [{ platform: 'tiktok', interests: ['a', 'B'] }])[0].interests).toEqual(['A', 'B']);
    expect(mergeFollows([{ platform: 'youtube', name: 'X' } as never], [{ platform: 'youtube', name: 'x' } as never])).toHaveLength(1);
    expect(mergeAdvertisers([], [{ platform: 'tiktok', name: 'X' } as never])).toHaveLength(1);
  });
});

describe('collect / unzip', () => {
  const zip = zipSync({
    'Takeout/YouTube and YouTube Music/history/watch-history.json': strToU8('[{"title":"Watched é"}]'),
    'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv': strToU8('a,b\n1,2'),
    'Takeout/YouTube and YouTube Music/videos/clip.mp4': new Uint8Array(20_000).fill(9),
    'Takeout/photo.JPG': new Uint8Array(10),
    '__MACOSX/._watch-history.json': strToU8('junk'),
  });

  it('keeps only data files and skips media', async () => {
    const { files, skipped } = await unzipDataFiles(bytesSource(zip), 'takeout.zip');
    expect(files.map((f) => f.path).sort()).toEqual([
      'Takeout/YouTube and YouTube Music/history/watch-history.json',
      'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv',
    ]);
    expect(skipped).toBe(3);
    expect(utf8(files[0].bytes)).toContain('é');
  });

  it('streams in small chunks', async () => {
    let calls = 0;
    const src = bytesSource(zip);
    const wrapped = { ...src, read: (max: number) => { calls++; return src.read(Math.min(max, 64)); } };
    const { files } = await unzipDataFiles(wrapped, 'takeout.zip');
    expect(files).toHaveLength(2);
    expect(calls).toBeGreaterThan(10);
  });

  it('rejects a damaged zip with the web message', async () => {
    const failing = { size: 10, readAll: async () => new Uint8Array(0), read: async () => { throw new Error('io'); } };
    await expect(unzipDataFiles(failing, 'bad.zip'))
      .rejects.toThrow(/Couldn't open "bad.zip"/);
  });

  it('mixes loose files and zips, first path wins', async () => {
    const { files } = await collectExportFiles([
      { name: 'watch-history.json', source: bytesSource(strToU8('[]')) },
      { name: 'x.mp4', source: bytesSource(new Uint8Array(3)) },
      { name: 'takeout.zip', source: bytesSource(zip) },
    ]);
    expect(files.map((f) => f.path)).toContain('watch-history.json');
    expect(files).toHaveLength(3);
  });
});

async function sampleTakeout(): Promise<Uint8Array> {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'drift-'));
  const out = path.join(dir, 'sample.zip');
  execFileSync(process.execPath, [path.resolve(__dirname, '../../../scripts/make-sample-takeout.mjs'), out], { stdio: 'pipe' });
  return new Uint8Array(readFileSync(out));
}

describe('runImport (real parsers + analysis)', () => {
  it('imports the sample takeout, reports stages in order, dedupes a re-import', async () => {
    const zip = await sampleTakeout();
    const stages: ImportProgress['stage'][] = [];
    const onProgress = (p: ImportProgress) => { if (stages[stages.length - 1] !== p.stage) stages.push(p.stage); };

    const records = await runImport([{ name: 'takeout.zip', source: bytesSource(zip) }], onProgress);
    expect(stages).toEqual(['reading', 'unzipping', 'parsing', 'classifying', 'analysing', 'saving', 'done']);
    const newEvents = records.reduce((s, r) => s + r.newEvents, 0);
    expect(newEvents).toBeGreaterThan(1500);
    expect(await store.countEvents()).toBe(newEvents);
    const insights = await store.loadInsights();
    expect(insights?.classifier).toBe('keyword');

    const done: ImportProgress[] = [];
    const again = await runImport([{ name: 'takeout.zip', source: bytesSource(zip) }], (p) => done.push(p));
    expect(again.reduce((s, r) => s + r.newEvents, 0)).toBe(0);
    expect(done[done.length - 1].message).toMatch(/Nothing new/);
    expect(await store.countEvents()).toBe(newEvents);

    const re = await recomputeInsights();
    expect(re?.totals.items).toBe(insights?.totals.items);

    const json = JSON.parse(await exportResultsJson());
    expect(json.app).toBe('drift');
    expect(JSON.stringify(json)).not.toContain('watch?v=');
    expect(Object.values(json.insights.topics as Record<string, { recentItems: unknown[] }>).every((t) => t.recentItems.length === 0)).toBe(true);
  }, 60_000);

  it('errors: no input, no data files, not an export, empty export', async () => {
    await expect(runImport([])).rejects.toThrow('Choose a file or folder to import.');
    await expect(runImport([{ name: 'a.zip', source: bytesSource(zipSync({ 'v.mp4': new Uint8Array(4) })) }]))
      .rejects.toThrow(/couldn't find any data files/);
    await expect(runImport([{ name: 'notes.txt', source: bytesSource(strToU8('hello')) }]))
      .rejects.toThrow(NOT_AN_EXPORT_MESSAGE);
    await expect(runImport([{ name: 'x.zip', source: bytesSource(strToU8('not a zip at all')) }]))
      .rejects.toBeInstanceOf(Error);
    expect(DriftImportError.name).toBe('DriftImportError');
    expect(await store.countEvents()).toBe(0);
  });
});
