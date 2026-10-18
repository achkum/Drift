import { describe, expect, it } from 'vitest';
import { instagramItemId, instagramParser } from './instagram';
import { detectParsers } from './index';
import { loadFixture, memFile } from './testUtils';
import { fixMojibake } from './util';

describe('instagram parser', () => {
  it('parses a full JSON export, old and new record shapes, with mojibake repaired', async () => {
    const files = loadFixture('instagram');
    expect(detectParsers(files).map((p) => p.id)).toEqual(['instagram']);
    const res = await instagramParser.parse(files);
    expect(res.platform).toBe('instagram');

    const watches = res.events.filter((e) => e.kind === 'watch');
    expect(watches.map((e) => e.channel?.name).sort()).toEqual(['café_demo', 'göteborg_demo', 'surf_demo']);
    expect(watches.find((e) => e.channel?.name === 'café_demo')?.time).toBe('2026-01-01T00:00:00.000Z');
    const reel = watches.find((e) => e.channel?.name === 'surf_demo')!;
    expect(reel).toMatchObject({ url: 'https://www.instagram.com/reel/ReelDemo001/', itemId: 'ReelDemo001', time: '2026-01-01T02:00:00.000Z' });

    const ads = res.events.filter((e) => e.kind === 'ad');
    expect(ads).toHaveLength(3);
    expect(ads.every((e) => e.fromAds)).toBe(true);

    expect(res.events.find((e) => e.kind === 'like')).toMatchObject({
      url: 'https://www.instagram.com/p/PostDemo001/',
      itemId: 'PostDemo001',
      channel: { name: 'surf_demo' },
      time: '2026-01-01T06:46:40.000Z',
    });
    expect(res.events.find((e) => e.kind === 'save')).toMatchObject({ itemId: 'SavedDemo01', channel: { name: 'recipe_demo' } });
    expect(res.events.find((e) => e.kind === 'comment')).toMatchObject({ channel: { name: 'recipe_demo' } });
    expect(res.events.find((e) => e.kind === 'search')?.query).toBe('köttbullar');

    expect(res.follows.map((f) => f.name)).toEqual(['surf_demo', 'recipe_demo']);
    expect(res.follows[0].since).toBe('2023-11-14T22:13:20.000Z');

    expect(res.interests).toEqual([{ platform: 'instagram', interests: ['Surfing', 'Cafés'] }]);

    const adv = Object.fromEntries(res.advertisers.map((a) => [a.name, a.count]));
    expect(adv).toEqual({ 'Demo Sneakers': undefined, 'Café Chain Demo': undefined, demo_sneakers: 2, demo_bank: 1 });

    expect(res.warnings.some((w) => /without a date/.test(w))).toBe(true);
    // ids deterministic and unique
    expect(new Set(res.events.map((e) => e.id)).size).toBe(res.events.length);
  });

  it('warns on an HTML export', async () => {
    const files = [memFile('instagram-x/your_instagram_activity/likes/liked_posts.html', '<html></html>')];
    expect(instagramParser.detect(files)).toBe(true);
    const res = await instagramParser.parse(files);
    expect(res.events).toEqual([]);
    expect(res.warnings[0]).toMatch(/HTML/);
  });

  it('handles a partial export (only following.json) without throwing', async () => {
    const res = await instagramParser.parse([
      memFile('connections/followers_and_following/following.json', JSON.stringify({ relationships_following: [{ title: 'a_demo', string_list_data: [{ href: 'https://www.instagram.com/_u/a_demo', timestamp: 1700000000 }] }] })),
      memFile('your_instagram_activity/likes/liked_posts.json', 'not json'),
    ]);
    expect(res.follows.map((f) => f.name)).toEqual(['a_demo']);
    expect(res.warnings.some((w) => /not valid JSON/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /viewing history skipped/.test(w))).toBe(true);
  });

  it('does not claim Facebook exports', () => {
    expect(instagramParser.detect([memFile('your_facebook_activity/likes/liked_posts.json', '{}')])).toBe(false);
  });

  it('repairs mojibake and leaves proper text alone', () => {
    expect(fixMojibake('cafÃ©')).toBe('café');
    expect(fixMojibake('ð\u009f\u008c\u008a')).toBe('🌊');
    expect(fixMojibake('café')).toBe('café');
    expect(fixMojibake('plain')).toBe('plain');
  });

  it('extracts item ids', () => {
    expect(instagramItemId('https://www.instagram.com/p/AbC_123/')).toBe('AbC_123');
    expect(instagramItemId('https://www.instagram.com/reel/AbC_123/')).toBe('AbC_123');
    expect(instagramItemId('https://www.instagram.com/someone')).toBeUndefined();
  });
});
