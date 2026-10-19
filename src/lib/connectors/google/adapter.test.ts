import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildImportZip, normalisePortabilityEntries } from './adapter';
import { parseExport } from '@/lib/parsers';
import type { ExportFile } from '@/lib/types';

const yt = [
  { header: 'YouTube', title: 'Watched Marathon training', titleUrl: 'https://www.youtube.com/watch?v=abcDEF12345', subtitles: [{ name: 'Run Club', url: 'https://www.youtube.com/channel/UC1' }], time: '2026-10-01T10:00:00Z', products: ['YouTube'] },
  { header: 'YouTube', title: 'Searched for pasta', titleUrl: 'https://www.youtube.com/results?search_query=pasta', time: '2026-10-01T11:00:00Z', products: ['YouTube'] },
];
const search = [{ header: 'Search', title: 'Searched for weather', titleUrl: 'https://www.google.com/search?q=weather', time: '2026-10-01T12:00:00Z', products: ['Search'] }];
const csv = 'Channel Id,Channel Url,Channel Title\nUC1,http://www.youtube.com/channel/UC1,Run Club\n';

const enc = (v: unknown) => strToU8(typeof v === 'string' ? v : JSON.stringify(v));

async function parseZip(zip: Uint8Array) {
  const files: ExportFile[] = Object.entries(unzipSync(zip)).map(([path, b]) => ({ path, text: async () => strFromU8(b) }));
  return parseExport(files);
}

describe('portability archive adapter', () => {
  it.each([
    ['Portability/My Activity/YouTube/MyActivity.json', 'Portability/My Activity/Search/MyActivity.json', 'Portability/YouTube and YouTube Music/subscriptions/subscriptions.csv'],
    ['My Activity/YouTube/MyActivity.json', 'My Activity/Search/MyActivity.json', 'YouTube/subscriptions.csv'],
    ['myactivity.youtube/MyActivity.json', 'myactivity.search/MyActivity.json', 'youtube.subscriptions/subscriptions.csv'],
  ])('reads layout %s', async (ytPath, searchPath, subsPath) => {
    const zip = zipSync({ [ytPath]: enc(yt), [searchPath]: enc(search), [subsPath]: enc(csv), 'Portability/archive_browser.html': enc('<html/>'), 'Portability/My Activity/YouTube/thumb.jpg': new Uint8Array([1]) });
    const built = buildImportZip([{ name: 'a.zip', bytes: zip }]);
    const [res] = await parseZip(built.zip);
    expect(res.events.map((e) => `${e.platform}:${e.kind}`).sort()).toEqual(['google_search:search', 'youtube:search', 'youtube:watch']);
    expect(res.follows).toEqual([{ platform: 'youtube', name: 'Run Club', url: 'http://www.youtube.com/channel/UC1' }]);
  });

  it('splits a single mixed MyActivity.json by header', async () => {
    const { entries } = normalisePortabilityEntries([{ path: 'Portability/My Activity/MyActivity.json', bytes: enc([...yt, ...search]) }]);
    expect(entries.map((e) => e.path).sort()).toEqual(['Takeout/My Activity/Search/MyActivity.json', 'Takeout/My Activity/YouTube/MyActivity.json']);
  });

  it('prefers JSON over HTML and keeps HTML when it is all there is', () => {
    const both = normalisePortabilityEntries([
      { path: 'P/My Activity/YouTube/MyActivity.html', bytes: enc('<div class="outer-cell"></div>') },
      { path: 'P/My Activity/YouTube/MyActivity.json', bytes: enc(yt) },
    ]);
    expect(both.entries.map((e) => e.path)).toEqual(['Takeout/My Activity/YouTube/MyActivity.json']);
    const htmlOnly = normalisePortabilityEntries([{ path: 'P/My Activity/Search/MyActivity.html', bytes: enc('<div class="outer-cell"></div>') }]);
    expect(htmlOnly.entries.map((e) => e.path)).toEqual(['Takeout/My Activity/Search/MyActivity.html']);
  });

  it('merges multi-part archives and loose files', async () => {
    const part1 = zipSync({ 'Portability/My Activity/YouTube/MyActivity.json': enc(yt) });
    const built = buildImportZip([
      { name: 'part-1.zip', bytes: part1 },
      { name: 'MyActivity.json', bytes: enc(search) },
    ]);
    expect(built.files.sort()).toEqual(['Takeout/My Activity/Search/MyActivity.json', 'Takeout/My Activity/YouTube/MyActivity.json']);
  });

  it('warns when nothing usable is in the archive', () => {
    const built = buildImportZip([{ name: 'a.zip', bytes: zipSync({ 'Portability/Chrome/History.json': enc([]) }) }]);
    expect(built.files).toEqual([]);
    expect(built.warnings[0]).toMatch(/no YouTube or Search activity/);
  });
});
