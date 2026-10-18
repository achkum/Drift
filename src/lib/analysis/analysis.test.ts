import { describe, expect, it } from 'vitest';
import type { DriftEvent } from '@/lib/types';
import { analyse, createKeywordClassifier, interestTopic, TOPICS } from './index';
import { driftScenario, tiktokOnly, TITLES } from './__fixtures__/generate';

const ev = (p: Partial<DriftEvent> & Pick<DriftEvent, 'kind' | 'time'>): DriftEvent => ({
  id: `${p.kind}:${p.time}:${p.title ?? p.query ?? ''}`, platform: 'youtube', ...p,
});

describe('topics', () => {
  it('has a taxonomy with sensitive topics, other and unknown', () => {
    const ids = TOPICS.map((t) => t.id);
    expect(TOPICS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['politics', 'football', 'fitness', 'dieting', 'other', 'unknown']) expect(ids).toContain(id);
    for (const id of ['politics', 'health', 'religion', 'relationships', 'dieting']) {
      expect(TOPICS.find((t) => t.id === id)?.sensitive).toBe(true);
    }
  });
});

describe('keyword classifier', () => {
  const c = createKeywordClassifier();
  const one = async (item: { title?: string; channel?: string; query?: string; url?: string }) => (await c.classify([item]))[0];

  it.each([
    ['Arsenal vs Chelsea | Premier League Highlights', 'football'],
    ['Allsvenskan: AIK – Hammarby höjdpunkter', 'football'],
    ['Fotbollsmatchen i kväll', 'football'],
    ['Riksdagen: partiledardebatt om budgeten', 'politics'],
    ['Senate debate on the immigration bill', 'politics'],
    ['Recept: kanelbullar på 30 minuter', 'food'],
    ['Styrketräning för nybörjare', 'fitness'],
    ['Marathon training plan for beginners', 'fitness'],
    ['What I eat in a day on a calorie deficit', 'dieting'],
    ['Minecraft survival lets play #12', 'gaming'],
    ['Taylor Swift - Official Music Video', 'music'],
    ['iPhone 17 review after one month', 'tech'],
    ['How black holes work', 'science'],
    ['Bitcoin price prediction', 'finance'],
    ['GRWM: skincare routine', 'beauty'],
    ['Things to do in Tokyo on a budget', 'travel'],
    ['Unsolved murder case: the cold case files', 'true_crime'],
    ['ASMR whispering for sleep', 'lifestyle'],
    ['Peppa Pig full episodes', 'kids'],
    ['Cute cats and kittens', 'animals'],
    ['Sunday sermon: the gospel of John', 'religion'],
    ['Red flags in a new relationship', 'relationships'],
    ['Living with ADHD and anxiety', 'health'],
    ['Volvo XC90 test drive', 'cars'],
  ])('%s -> %s', async (title, topic) => {
    const r = await one({ title });
    expect(r.topic).toBe(topic);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('uses word boundaries, not substrings', async () => {
    expect((await one({ title: 'Breakfast at Tiffanys' })).topic).toBe('food'); // breakfast, not "fast"
    expect((await one({ title: 'Undefined behaviour' })).topic).toBe('other');
  });

  it('uses the channel name and the search query', async () => {
    expect((await one({ title: 'Full episode 4', channel: 'Sky Sports Football' })).topic).toBe('football');
    expect((await one({ query: 'bästa löparskor' })).topic).toBe('fitness');
    expect((await one({ query: 'löpning intervaller' })).topic).toBe('fitness');
  });

  it('says other for text without a match and unknown for no text', async () => {
    const [a, b] = await c.classify([{ title: 'qwerty zxcv' }, { url: 'https://www.tiktokv.com/share/video/1/' }]);
    expect(a.topic).toBe('other');
    expect(b.topic).toBe('unknown');
  });

  it('lets unmatched titles inherit a channel topic with lower confidence', async () => {
    const items = [
      ...TITLES.football.slice(0, 4).map((title) => ({ title, channel: 'Goal Kings' })),
      { title: 'Our trip behind the scenes', channel: 'Goal Kings' },
      { title: 'Something unrelated', channel: 'Goal Kings' },
    ];
    const out = await c.classify(items);
    expect(out[5].topic).toBe('football');
    expect(out[5].confidence).toBeLessThan(out[0].confidence);
  });

  it('maps platform interest names to topics', () => {
    expect(interestTopic('Soccer')).toBe('football');
    expect(interestTopic('Politics')).toBe('politics');
    expect(interestTopic('Hundar')).toBe('animals');
    expect(interestTopic('Cooking & Recipes')).toBe('food');
    expect(interestTopic('Knitting')).toBeUndefined();
  });
});

describe('origin labels', () => {
  it('labels pushed, engaged, chosen and served', async () => {
    const base = Date.UTC(2026, 3, 1, 12);
    const at = (min: number) => new Date(base + min * 60_000).toISOString();
    const events: DriftEvent[] = [
      ev({ kind: 'ad', time: at(0), title: 'Buy shoes' }),
      ev({ kind: 'watch', time: at(1), title: 'Some promo', fromAds: true }),
      ev({ kind: 'like', time: at(2), title: 'A video' }),
      ev({ kind: 'search', time: at(3), platform: 'google_search', query: 'Marathon training' }),
      ev({ kind: 'watch', time: at(10), title: 'My marathon trainingsplan', channel: { name: 'Coach A' } }),
      ev({ kind: 'watch', time: at(50), title: 'Marathon tips', channel: { name: 'Coach B' } }), // > 30 min after
      ev({ kind: 'watch', time: at(51), title: 'Pasta night', channel: { name: 'kitchen stories' } }),
      ev({ kind: 'watch', time: at(52), title: 'Random clip', channel: { name: 'Feed Channel' } }),
    ];
    const { classified } = await analyse({ events, follows: [{ platform: 'youtube', name: 'Kitchen Stories' }], interests: [], advertisers: [] });
    const by = (t: string) => classified.find((e) => e.time === t)!;
    expect(by(at(0)).origin).toBe('pushed');
    expect(by(at(1)).origin).toBe('pushed');
    expect(by(at(2))).toMatchObject({ origin: 'engaged', originReason: 'you liked it' });
    expect(by(at(3)).origin).toBe('chosen');
    expect(by(at(10))).toMatchObject({ origin: 'chosen', originReason: "followed a search for 'Marathon training'" });
    expect(by(at(50)).origin).toBe('served');
    expect(by(at(51))).toMatchObject({ origin: 'chosen', originReason: 'subscribed channel' });
    expect(by(at(52))).toMatchObject({ origin: 'served' });
  });

  it('marks a channel the user came back to on 6 days in 30 as chosen, only when it starts a session', async () => {
    const habit = { name: 'Habit Channel', url: 'https://youtube.com/@habit' };
    const at = (d: number, min = 0) => new Date(Date.UTC(2026, 0, 1 + d, 20, min)).toISOString();
    const events = [0, 3, 6, 9, 12, 20, 60].map((d) => ev({ kind: 'watch', time: at(d), title: `Clip ${d}`, channel: habit }));
    // Autoplayed right after another video on day 20: not a deliberate return.
    events.push(ev({ kind: 'watch', time: at(20, 4), title: 'Clip 20b', channel: habit }));
    const { classified } = await analyse({ events, follows: [], interests: [], advertisers: [] });
    expect(classified.map((e) => e.origin)).toEqual(['served', 'served', 'served', 'served', 'served', 'chosen', 'served', 'served']);
    expect(classified[5].originReason).toMatch(/came back to this channel/);
  });
});

describe('insights on a scripted drift', async () => {
  const sc = driftScenario();
  const { classified, insights } = await analyse(sc.input);

  it('covers every month', () => {
    expect(insights.months[0]).toBe('2026-01');
    expect(insights.months).toHaveLength(9);
    expect(insights.totals.items).toBe(sc.input.events.length);
    expect(insights.platforms.map((p) => p.platform).sort()).toEqual(['google_search', 'tiktok', 'youtube']);
  });

  it('classifies the scripted titles', () => {
    const politics = classified.filter((e) => e.channel?.name.startsWith('Daily Brief'));
    expect(politics.every((e) => e.topic === 'politics')).toBe(true);
    expect(classified.filter((e) => e.platform === 'tiktok').every((e) => e.topic === 'unknown')).toBe(true);
  });

  it('finds politics rising and football falling', () => {
    expect(insights.rising[0].topic).toBe('politics');
    expect(insights.rising[0].delta).toBeGreaterThan(30);
    expect(insights.falling.map((d) => d.topic)).toContain('football');
    expect(insights.headline.title).toBe('Your feed drifted toward politics and news');
    expect(insights.headline.detail).toMatch(/^Big shift, based on [\d,]+ videos and searches$/);
  });

  it('builds monthly shares for at most 8 topics plus other', () => {
    expect(insights.monthly.length).toBeLessThanOrEqual(9);
    const pol = insights.monthly.find((m) => m.topic === 'politics')!;
    expect(pol.shares).toHaveLength(9);
    expect(pol.shares[8]).toBeGreaterThan(pol.shares[0]);
    for (let m = 0; m < 9; m++) {
      const sum = insights.monthly.reduce((a, s) => a + s.shares[m], 0);
      expect(sum).toBeGreaterThan(99);
      expect(sum).toBeLessThan(101);
    }
  });

  it('puts the politics turning point in the change month, mostly served', () => {
    const tp = insights.turningPoints.find((t) => t.topic === 'politics')!;
    expect(tp).toBeDefined();
    expect(tp.month).toBe(sc.changeMonth);
    expect(tp.direction).toBe('up');
    expect(tp.explanation).toMatch(/^Mostly served to you/);
    expect(tp.explanation).toContain("You didn't search for it.");
    const fb = insights.turningPoints.find((t) => t.topic === 'football')!;
    expect(fb.direction).toBe('down');
    expect(fb.month).toBe(sc.changeMonth);
  });

  it('computes chosen vs served for the last 30 days', () => {
    const last = Date.parse(classified[classified.length - 1].time);
    const win = classified.filter((e) => Date.parse(e.time) > last - 30 * 86_400_000);
    const expected = Math.round((win.filter((e) => e.origin === 'chosen' || e.origin === 'engaged').length / win.length) * 100);
    expect(insights.chosen.chosenPct).toBe(expected);
    expect(insights.chosen.chosenPct + insights.chosen.servedPct).toBe(100);
    expect(insights.chosen.chosenPct).toBeGreaterThan(15);
    expect(insights.chosen.chosenPct).toBeLessThan(60);
    expect(insights.chosen.byPlatform.find((p) => p.platform === 'google_search')?.chosenPct).toBe(100);
  });

  it('shows the topic narrowing', () => {
    expect(insights.range.narrowing).toBe(true);
    expect(insights.range.topicsNow).toBeLessThan(insights.range.topicsThen);
    expect(insights.range.monthNow).toBe('2026-09');
  });

  it('fills topic details with sources and recent items', () => {
    const pol = insights.topics.politics;
    expect(pol.sensitive).toBe(true);
    expect(pol.servedPct).toBeGreaterThan(70);
    expect(pol.recentItems).toHaveLength(50);
    expect(pol.sources.length).toBeGreaterThan(0);
    const food = insights.topics.food;
    expect(food.sources[0]).toMatchObject({ name: 'Kitchen Stories', subscribed: true, origin: 'chosen' });
    const fit = insights.topics.fitness;
    expect(fit.sources.some((s) => s.name === 'Your searches' && s.origin === 'chosen')).toBe(true);
    expect(insights.topics.unknown.itemCount).toBeGreaterThan(200);
  });

  it('compares platform interests to actual viewing', () => {
    const ig = insights.platformInterests[0];
    expect(ig.interests).toEqual([
      { name: 'Soccer', matches: true },
      { name: 'Politics', matches: true },
      { name: 'Cooking', matches: true },
      { name: 'Knitting', matches: false },
      { name: 'Hundar', matches: false },
    ]);
    expect(insights.actualTopics[0]).toBe('Politics and news');
  });

  it('reports ads and a weekly digest', () => {
    expect(insights.ads.advertisers[0].name).toBe('Volvo');
    expect(insights.ads.adItems).toBeGreaterThan(50);
    expect(insights.digest.weekOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(insights.digest.weekOf).getUTCDay()).toBe(1);
    expect(insights.digest.lines.length).toBeGreaterThanOrEqual(3);
    expect(insights.digest.lines[0]).toMatch(/^You watched \d+ videos/);
  });
});

describe('edge cases', () => {
  it('handles empty input', async () => {
    const { classified, insights } = await analyse({ events: [], follows: [], interests: [], advertisers: [] });
    expect(classified).toEqual([]);
    expect(insights.headline.title).toBe('No history yet');
    expect(insights.months).toEqual([]);
  });

  it('handles one month of data', async () => {
    const sc = driftScenario({ months: 1 });
    const { insights } = await analyse({ ...sc.input, follows: [] });
    expect(insights.months).toEqual(['2026-01']);
    expect(insights.rising).toEqual([]);
    expect(insights.falling).toEqual([]);
    expect(insights.turningPoints).toEqual([]);
    expect(insights.headline.title).toBe('Your feed is mostly football');
    expect(insights.range.narrowing).toBe(false);
  });

  it('handles no searches and no follows', async () => {
    const sc = driftScenario({ months: 4 });
    const events = sc.input.events.filter((e) => e.kind !== 'search');
    const { insights } = await analyse({ events, follows: [], interests: [], advertisers: [] });
    expect(insights.totals.searches).toBe(0);
    expect(insights.rising[0].topic).toBe('politics');
    expect(insights.chosen.servedPct).toBeGreaterThan(50);
  });

  it('handles TikTok only (no titles)', async () => {
    const { classified, insights } = await analyse(tiktokOnly());
    expect(classified.every((e) => e.topic === 'unknown')).toBe(true);
    expect(insights.monthly).toEqual([]);
    expect(insights.rising).toEqual([]);
    expect(insights.headline.title).toBe("We can't see topics yet");
    expect(insights.headline.detail).toContain('TikTok');
    expect(insights.chosen.servedPct).toBe(100);
    expect(insights.digest.lines.length).toBeGreaterThan(0);
  });

  it('skips events with bad timestamps', async () => {
    const { classified } = await analyse({
      events: [ev({ kind: 'watch', time: 'not a date', title: 'x' }), ev({ kind: 'watch', time: '2026-01-01T00:00:00Z', title: 'Arsenal highlights' })],
      follows: [], interests: [], advertisers: [],
    });
    expect(classified).toHaveLength(1);
  });
});

describe('performance', () => {
  it('analyses 100k events in under 3 seconds', async () => {
    const sc = driftScenario({ perDay: 370, seed: 7 });
    expect(sc.input.events.length).toBeGreaterThan(100_000);
    const t0 = performance.now();
    const { insights } = await analyse(sc.input);
    const ms = performance.now() - t0;
    expect(insights.rising[0].topic).toBe('politics');
    expect(ms).toBeLessThan(3000);
  }, 20_000);
});
