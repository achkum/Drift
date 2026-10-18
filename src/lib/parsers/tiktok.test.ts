import { describe, expect, it } from 'vitest';
import { loadFixture, memFile } from './testUtils';
import { tiktokItemId, tiktokParser } from './tiktok';

describe('tiktok parser', () => {
  it('parses the current user_data_tiktok.json layout', async () => {
    const files = loadFixture('tiktok-new');
    expect(tiktokParser.detect(files)).toBe(true);
    const res = await tiktokParser.parse(files);
    expect(res.platform).toBe('tiktok');

    const watches = res.events.filter((e) => e.kind === 'watch');
    expect(watches).toHaveLength(2); // duplicate deduped, bad date skipped, DM link ignored
    expect(watches[0]).toMatchObject({
      id: 'tiktok:watch:2026-04-01T18:30:00.000Z:7350000000000000001',
      time: '2026-04-01T18:30:00.000Z',
      itemId: '7350000000000000001',
      url: 'https://www.tiktokv.com/share/video/7350000000000000001/',
    });
    expect(watches[0].title).toBeUndefined();

    expect(res.events.filter((e) => e.kind === 'search').map((e) => e.query)).toEqual(['pasta recipe']);
    expect(res.events.filter((e) => e.kind === 'like').map((e) => e.itemId)).toEqual(['7350000000000000004']);
    expect(res.events.filter((e) => e.kind === 'save').map((e) => e.itemId)).toEqual(['7350000000000000005']);
    expect(res.events.filter((e) => e.kind === 'share').map((e) => e.itemId)).toEqual(['7350000000000000006']);
    expect(res.events.some((e) => e.itemId === '7350000000000000009')).toBe(false);

    expect(res.follows).toEqual([
      { platform: 'tiktok', name: 'chef.demo', url: 'https://www.tiktok.com/@chef.demo', since: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(res.interests).toEqual([{ platform: 'tiktok', interests: ['Food & Drink', 'Travel', 'Sports'] }]);
    expect(res.advertisers).toEqual([{ platform: 'tiktok', name: 'Demo Shoe Store' }]);
    expect(res.warnings.some((w) => /without a readable date/.test(w))).toBe(true);
  });

  it('parses the older user_data.json layout', async () => {
    const res = await tiktokParser.parse(loadFixture('tiktok-old'));
    expect(res.events.map((e) => [e.kind, e.itemId ?? e.query])).toEqual([
      ['watch', '7090000000000000001'],
      ['search', 'cat videos'],
      ['like', '7090000000000000002'],
    ]);
    expect(res.follows.map((f) => f.name)).toEqual(['cats.demo']);
    expect(res.interests[0].interests).toEqual(['Pets', 'Comedy']);
  });

  it('parses the TXT export', async () => {
    const files = loadFixture('tiktok-txt');
    expect(tiktokParser.detect(files)).toBe(true);
    const res = await tiktokParser.parse(files);
    expect(res.events.filter((e) => e.kind === 'watch')).toHaveLength(2);
    expect(res.events.find((e) => e.kind === 'search')?.query).toBe('hiking boots');
  });

  it('handles partial and broken files without throwing', async () => {
    const res = await tiktokParser.parse([memFile('user_data_tiktok.json', '{"Your Activity": {}}')]);
    expect(res.events).toEqual([]);
    expect(res.warnings.some((w) => /watch history/.test(w))).toBe(true);

    const broken = await tiktokParser.parse([memFile('user_data_tiktok.json', 'garbage')]);
    expect(broken.events).toEqual([]);
    expect(broken.warnings.some((w) => /not valid JSON/.test(w))).toBe(true);

    const wrong = await tiktokParser.parse([memFile('user_data_tiktok.json', '[1,2]')]);
    expect(wrong.warnings.some((w) => /unexpected structure/.test(w))).toBe(true);
  });

  it('does not claim unrelated files', () => {
    expect(tiktokParser.detect([memFile('Takeout/YouTube and YouTube Music/history/watch-history.json', '[]')])).toBe(false);
    expect(tiktokParser.detect([memFile('some/deep/folder/user_data.json', '{}')])).toBe(false);
  });

  it('extracts item ids from links', () => {
    expect(tiktokItemId('https://www.tiktokv.com/share/video/7350000000000000001/')).toBe('7350000000000000001');
    expect(tiktokItemId('https://www.tiktok.com/@x/video/7350000000000000002?lang=en')).toBe('7350000000000000002');
    expect(tiktokItemId('https://www.tiktok.com/music/sound')).toBeUndefined();
  });
});
