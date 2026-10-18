import { describe, expect, it } from 'vitest';
import { parseExport, detectParsers } from './index';
import { parseTakeoutDate } from './takeoutDate';
import { loadFixture, memFile } from './testUtils';
import { youtubeParser, youtubeVideoId } from './youtube';

describe('youtube parser: Takeout JSON (English)', () => {
  it('parses watches, ads, searches, subscriptions and Google Search', async () => {
    const files = loadFixture('takeout-en-json');
    expect(youtubeParser.detect(files)).toBe(true);
    const res = await youtubeParser.parse(files);

    expect(res.platform).toBe('mixed');
    expect(res.filesUsed).toHaveLength(4);

    const watches = res.events.filter((e) => e.platform === 'youtube' && e.kind === 'watch');
    // duplicate watch is deduped, survey question skipped
    expect(watches).toHaveLength(4);
    const marathon = watches.find((e) => e.itemId === 'abcDEF12345')!;
    expect(marathon).toMatchObject({
      title: 'Marathon training for beginners',
      time: '2026-03-01T12:34:56.789Z',
      url: 'https://www.youtube.com/watch?v=abcDEF12345',
      channel: { name: 'Run Club Demo', url: 'https://www.youtube.com/channel/UCdemo000000000000000001' },
    });
    expect(marathon.id).toBe('youtube:watch:2026-03-01T12:34:56.789Z:abcDEF12345');

    const removed = watches.find((e) => e.time === '2026-03-03T09:00:00.000Z')!;
    expect(removed.title).toBeUndefined();
    expect(removed.url).toBeUndefined();

    const music = watches.find((e) => e.itemId === 'musicID0001')!;
    expect(music.title).toBeUndefined(); // title was just the URL

    expect(watches.find((e) => e.itemId === 'shortID0001')?.title).toBe('Quick tip');

    const ads = res.events.filter((e) => e.kind === 'ad');
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ platform: 'youtube', fromAds: true, itemId: 'adVIDEO0001', title: 'Shiny New Sneakers' });

    const searches = res.events.filter((e) => e.platform === 'youtube' && e.kind === 'search');
    expect(searches.map((s) => s.query).sort()).toEqual(['café & bröd', 'marathon training plan']);

    const google = res.events.filter((e) => e.platform === 'google_search');
    expect(google).toHaveLength(1);
    expect(google[0]).toMatchObject({ kind: 'search', query: 'best running shoes' });

    expect(res.follows).toEqual([
      { platform: 'youtube', name: 'Run Club Demo', url: 'http://www.youtube.com/channel/UCdemo000000000000000001' },
      { platform: 'youtube', name: 'Cooking, Simply', url: 'http://www.youtube.com/channel/UCdemo000000000000000003' },
    ]);
    expect(res.warnings.some((w) => /not videos or searches/.test(w))).toBe(true);
  });

  it('gives identical ids on re-import', async () => {
    const a = await youtubeParser.parse(loadFixture('takeout-en-json'));
    const b = await youtubeParser.parse(loadFixture('takeout-en-json'));
    expect(a.events.map((e) => e.id)).toEqual(b.events.map((e) => e.id));
    expect(new Set(a.events.map((e) => e.id)).size).toBe(a.events.length);
  });
});

describe('youtube parser: Takeout HTML', () => {
  it('parses the English HTML variant with entities, ads and time zones', async () => {
    const res = await youtubeParser.parse(loadFixture('takeout-en-html'));
    expect(res.events).toHaveLength(3);
    const tom = res.events.find((e) => e.itemId === 'htmlVID0001')!;
    expect(tom).toMatchObject({
      kind: 'watch',
      title: 'Tom & Jerry\'s "best" bits',
      time: '2026-03-01T12:34:56.000Z', // 1:34:56 PM CET
      channel: { name: 'Cartoon Demo', url: 'https://www.youtube.com/channel/UCdemo000000000000000010' },
    });
    const ad = res.events.find((e) => e.itemId === 'htmlAD00001')!;
    expect(ad).toMatchObject({ kind: 'ad', fromAds: true, time: '2026-07-04T16:05:00.000Z' });
    const removed = res.events.find((e) => !e.itemId)!;
    expect(removed).toMatchObject({ kind: 'watch', time: '2025-12-31T23:59:59.000Z' });
    expect(removed.title).toBeUndefined();
    expect(res.warnings.some((w) => /HTML format/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /subscriptions\.csv not found/.test(w))).toBe(true);
  });

  it('parses Swedish folder names, titles, dates and subscriptions', async () => {
    const files = loadFixture('takeout-sv-html');
    expect(detectParsers(files).map((p) => p.id)).toEqual(['youtube']);
    const res = await youtubeParser.parse(files);
    expect(res.platform).toBe('youtube');

    const bullar = res.events.find((e) => e.itemId === 'svVIDEO0001')!;
    expect(bullar).toMatchObject({ kind: 'watch', title: 'Så bakar du kanelbullar', time: '2026-03-01T12:34:56.000Z' });
    expect(res.events.find((e) => e.itemId === 'svAD0000001')).toMatchObject({
      kind: 'ad',
      fromAds: true,
      title: 'Köp Demobilen',
      time: '2026-07-15T06:00:00.000Z', // CEST
    });
    const removed = res.events.find((e) => e.kind === 'watch' && !e.itemId)!;
    expect(removed.title).toBeUndefined();
    expect(removed.time).toBe('2026-01-02T09:00:00.000Z');

    const search = res.events.find((e) => e.kind === 'search')!;
    expect(search).toMatchObject({ query: 'kanelbullar recept', time: '2026-02-28T20:00:00.000Z' });

    expect(res.follows).toEqual([
      { platform: 'youtube', name: 'Bageri Demo', url: 'http://www.youtube.com/channel/UCdemo000000000000000020' },
    ]);
  });

  it('classifies Swedish JSON titles without URLs', async () => {
    const json = JSON.stringify([
      { header: 'YouTube', title: 'Tittade på en video som har tagits bort', time: '2026-01-01T00:00:00Z' },
      { header: 'YouTube', title: 'Sökte efter fiskesoppa', time: '2026-01-02T00:00:00Z' },
    ]);
    const res = await youtubeParser.parse([memFile('Takeout/YouTube och YouTube Music/historik/titthistorik.json', json)]);
    expect(res.events.map((e) => [e.kind, e.query ?? e.title ?? null])).toEqual([
      ['watch', null],
      ['search', 'fiskesoppa'],
    ]);
  });
});

describe('youtube parser: partial and broken exports', () => {
  it('accepts a loose watch-history.json and warns about the rest', async () => {
    const json = JSON.stringify([{ header: 'YouTube', title: 'Watched X', titleUrl: 'https://www.youtube.com/watch?v=xxxxxxxxxxx', time: '2026-01-01T00:00:00Z' }]);
    const files = [memFile('watch-history.json', json)];
    expect(youtubeParser.detect(files)).toBe(true);
    const res = await youtubeParser.parse(files);
    expect(res.events).toHaveLength(1);
    expect(res.warnings.some((w) => /search history/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /subscriptions/.test(w))).toBe(true);
  });

  it('never throws on invalid JSON or unexpected shapes', async () => {
    const res = await youtubeParser.parse([
      memFile('Takeout/YouTube and YouTube Music/history/watch-history.json', '{not json'),
      memFile('Takeout/YouTube and YouTube Music/history/search-history.json', '{"a":1}'),
      memFile('Takeout/YouTube and YouTube Music/history/other.html', '<html>nothing</html>'),
    ]);
    expect(res.events).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('is not detected for unrelated files', () => {
    expect(youtubeParser.detect([memFile('notes/readme.txt', 'x'), memFile('Takeout/Drive/a.json', '[]')])).toBe(false);
  });

  it('parseExport returns [] when nothing matches', async () => {
    expect(await parseExport([memFile('foo.txt', 'bar')])).toEqual([]);
  });
});

describe('helpers', () => {
  it('extracts video ids', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=abcDEF12345&t=3')).toBe('abcDEF12345');
    expect(youtubeVideoId('https://youtu.be/abcDEF12345')).toBe('abcDEF12345');
    expect(youtubeVideoId('https://www.youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345');
    expect(youtubeVideoId(undefined)).toBeUndefined();
  });

  it('parses localised Takeout dates', () => {
    expect(parseTakeoutDate('Mar 1, 2026, 1:34:56 PM CET')?.iso).toBe('2026-03-01T12:34:56.000Z');
    expect(parseTakeoutDate('Dec 12, 2025, 12:05:00 AM UTC')?.iso).toBe('2025-12-12T00:05:00.000Z');
    expect(parseTakeoutDate('1 mars 2026 kl. 13:34:56 CET')?.iso).toBe('2026-03-01T12:34:56.000Z');
    expect(parseTakeoutDate('12 okt. 2026 08:00:00 GMT+02:00')?.iso).toBe('2026-10-12T06:00:00.000Z');
    expect(parseTakeoutDate('01.03.2026, 13:34:56 MEZ')?.iso).toBe('2026-03-01T12:34:56.000Z');
    expect(parseTakeoutDate('2026-03-01 13:34:56 CET')?.iso).toBe('2026-03-01T12:34:56.000Z');
    const noZone = parseTakeoutDate('Mar 1, 2026, 12:00:00 PM');
    expect(noZone).toEqual({ iso: '2026-03-01T12:00:00.000Z', zoneKnown: false });
    expect(parseTakeoutDate('yesterday')).toBeUndefined();
  });
});
