import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { AnalysisInput } from '@/lib/analysis';
import type { DriftEvent, ExportFile, ImportProgress, Insights, ParseResult } from '@/lib/types';

const parseExport = vi.fn<(files: ExportFile[]) => Promise<ParseResult[]>>();
const analyse = vi.fn<(input: AnalysisInput) => Promise<{ classified: never[]; insights: Insights }>>();

vi.mock('@/lib/parsers', () => ({ parseExport: (files: ExportFile[]) => parseExport(files) }));
vi.mock('@/lib/analysis', () => ({
  analyse: (input: AnalysisInput) => analyse(input),
  createKeywordClassifier: () => ({ name: 'mock', classify: async () => [] }),
}));

const { importFiles, getInsights, listImports, deleteAllData, exportResults } = await import('./index');

const ev = (id: string, title = id): DriftEvent => ({ id, platform: 'youtube', kind: 'watch', time: '2026-03-01T10:00:00Z', title });

const insightsFor = (n: number) => ({ generatedAt: 'now', totals: { items: n, watches: n, searches: 0 } } as unknown as Insights);

function result(events: DriftEvent[], filesUsed: string[]): ParseResult {
  return { platform: 'youtube', events, follows: [], interests: [], advertisers: [], warnings: [], filesUsed };
}

function makeZip(entries: Record<string, Uint8Array>, name = 'takeout.zip'): File {
  return new File([zipSync(entries)], name, { type: 'application/zip' });
}

function withPath(file: File, rel: string): File {
  Object.defineProperty(file, 'webkitRelativePath', { value: rel });
  return file;
}

describe('importFiles', () => {
  beforeEach(async () => {
    parseExport.mockReset();
    analyse.mockReset();
    analyse.mockImplementation(async (input) => ({ classified: [], insights: insightsFor(input.events.length) }));
    await deleteAllData();
  });

  it('unzips data files, skips media, parses, analyses and stores', async () => {
    const watch = JSON.stringify([{ title: 'Watched a video' }]);
    const zip = makeZip({
      'Takeout/YouTube and YouTube Music/history/watch-history.json': strToU8(watch),
      'Takeout/YouTube and YouTube Music/history/search-history.HTML': strToU8('<html></html>'),
      'Takeout/YouTube and YouTube Music/videos/clip.mp4': new Uint8Array(5000).fill(7),
      'Takeout/YouTube and YouTube Music/photo.JPG': new Uint8Array(100),
      '__MACOSX/._watch-history.json': strToU8('junk'),
      'Takeout/archive_browser.html': strToU8('<html>index</html>'),
    });
    let seen: ExportFile[] = [];
    parseExport.mockImplementation(async (files) => {
      seen = files;
      expect(await files.find((f) => f.path.endsWith('watch-history.json'))!.text()).toBe(watch);
      return [result([ev('a'), ev('b')], ['Takeout/YouTube and YouTube Music/history/watch-history.json'])];
    });

    const progress: ImportProgress[] = [];
    const records = await importFiles([zip], (p) => progress.push(p));

    expect(seen.map((f) => f.path).sort()).toEqual([
      'Takeout/YouTube and YouTube Music/history/search-history.HTML',
      'Takeout/YouTube and YouTube Music/history/watch-history.json',
      'Takeout/archive_browser.html',
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ platform: 'youtube', fileName: 'takeout.zip', events: 2, newEvents: 2 });

    const stages = progress.map((p) => p.stage).filter((s, i, a) => s !== a[i - 1]);
    expect(stages).toEqual(['reading', 'unzipping', 'parsing', 'classifying', 'analysing', 'saving', 'done']);
    for (const p of progress) if (p.fraction !== undefined) expect(p.fraction).toBeGreaterThanOrEqual(0);

    expect((await getInsights())?.totals.items).toBe(2);
    expect(await listImports()).toHaveLength(1);
  });

  it('dedupes on re-import and recomputes from everything stored', async () => {
    parseExport.mockResolvedValueOnce([result([ev('a'), ev('b')], [])]);
    await importFiles([new File(['[]'], 'watch-history.json')]);
    parseExport.mockResolvedValueOnce([result([ev('b'), ev('c')], [])]);
    const [rec] = await importFiles([new File(['[]'], 'watch-history.json')]);
    expect(rec.newEvents).toBe(1);
    expect(analyse.mock.calls[1][0].events.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
    expect((await getInsights())?.totals.items).toBe(3);
    expect(await listImports()).toHaveLength(2);
  });

  it('uses webkitRelativePath for folder uploads and skips media there too', async () => {
    parseExport.mockResolvedValue([result([ev('x')], ['instagram-me/your_instagram_activity/likes/liked_posts.json'])]);
    const files = [
      withPath(new File(['{}'], 'liked_posts.json'), 'instagram-me/your_instagram_activity/likes/liked_posts.json'),
      withPath(new File(['x'], 'photo.jpg'), 'instagram-me/media/posts/photo.jpg'),
    ];
    const [rec] = await importFiles(files);
    expect(parseExport.mock.calls[0][0].map((f) => f.path)).toEqual(['instagram-me/your_instagram_activity/likes/liked_posts.json']);
    expect(rec.fileName).toBe('instagram-me');
  });

  it('accepts a mix of zips and loose files', async () => {
    parseExport.mockResolvedValue([result([ev('x')], [])]);
    const zip = makeZip({ 'TikTok/user_data.json': strToU8('{}') }, 'tiktok.zip');
    await importFiles([zip, new File(['a,b'], 'connections.csv'), new File(['x'], 'movie.mov')]);
    expect(parseExport.mock.calls[0][0].map((f) => f.path).sort()).toEqual(['TikTok/user_data.json', 'connections.csv']);
  });

  it('throws a clear error when no parser matches, and nothing is stored', async () => {
    parseExport.mockResolvedValue([]);
    const progress: ImportProgress[] = [];
    await expect(importFiles([new File(['{}'], 'random.json')], (p) => progress.push(p)))
      .rejects.toThrow("This doesn't look like a YouTube, TikTok or Instagram export.");
    expect(progress[progress.length - 1].stage).toBe('error');
    expect(progress[progress.length - 1].message).toMatch(/doesn't look like/);
    expect(analyse).not.toHaveBeenCalled();
    expect(await getInsights()).toBeNull();
    expect(await listImports()).toEqual([]);
  });

  it('errors without calling parsers when only media was uploaded', async () => {
    await expect(importFiles([makeZip({ 'a/b.mp4': new Uint8Array(10) })])).rejects.toThrow(/couldn't find any data files/);
    expect(parseExport).not.toHaveBeenCalled();
  });

  it('reports a damaged zip clearly', async () => {
    await expect(importFiles([new File([new Uint8Array([1, 2, 3, 4, 5])], 'broken.zip')]))
      .rejects.toThrow(/Couldn't open "broken.zip"|couldn't find any data files/);
  });

  it('saves nothing when analysis fails', async () => {
    parseExport.mockResolvedValue([result([ev('a')], [])]);
    analyse.mockRejectedValue(new Error('boom'));
    await expect(importFiles([new File(['[]'], 'watch-history.json')])).rejects.toThrow(/couldn't analyse/);
    expect(await listImports()).toEqual([]);
  });

  it('exports results without raw events, and deleteAllData wipes everything', async () => {
    parseExport.mockResolvedValue([result([ev('a', 'SECRET TITLE')], [])]);
    await importFiles([new File(['[]'], 'watch-history.json')]);
    const json = JSON.parse(await (await exportResults()).text());
    expect(json.insights.totals.items).toBe(1);
    expect(json.imports).toHaveLength(1);
    expect(JSON.stringify(json)).not.toContain('SECRET TITLE');

    await deleteAllData();
    expect(await getInsights()).toBeNull();
    expect(await listImports()).toEqual([]);
  });
});
