import { describe, expect, it } from 'vitest';
import { sampleInsights } from '@/lib/sample/sampleInsights';
import { buildSharedSummary } from './summary';
import { CANARIES, adultInsights, teenInsights } from './testFixtures';
import { SHARE_CATEGORIES, type ShareCategory } from './types';

const ALL_BUT_SENSITIVE: ShareCategory[] = ['trends', 'sources', 'ads', 'questions', 'alerts'];

/** Every string anywhere in the object. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { out.push(k); strings(x, out); });
  return out;
}

describe('buildSharedSummary: privacy boundary', () => {
  for (const [name, ins] of [['teen', teenInsights()], ['adult', adultInsights()], ['sample', sampleInsights]] as const) {
    it(`${name}: never contains items, titles, URLs or search text, even with every category on`, () => {
      const s = buildSharedSummary(ins, [...SHARE_CATEGORIES]);
      const json = JSON.stringify(s);
      for (const c of CANARIES) expect(json).not.toContain(c);
      for (const t of Object.values(ins.topics)) {
        for (const item of t.recentItems) {
          if (item.title) expect(json).not.toContain(item.title);
          if (item.url) expect(json).not.toContain(item.url);
        }
      }
      expect(json).not.toMatch(/recentItems|turningPoints|headline|https?:\/\//);
      expect(strings(s).some((x) => x === 'title' || x === 'url' || x === 'query')).toBe(false);
    });
  }

  it('shares nothing but metadata with no categories', () => {
    const s = buildSharedSummary(teenInsights(), []);
    expect(s).toEqual({ v: 1, generatedAt: '2026-10-18T00:00:00Z', categories: [], allowQuestions: false });
  });

  it('respects each category on its own', () => {
    const ins = teenInsights();
    for (const c of ['trends', 'sources', 'ads'] as const) {
      const s = buildSharedSummary(ins, [c]);
      expect(Object.keys(s).filter((k) => ['trends', 'sources', 'ads', 'alerts'].includes(k))).toEqual([c]);
      expect(s.allowQuestions).toBe(false);
    }
    expect(buildSharedSummary(ins, ['questions']).allowQuestions).toBe(true);
    // Also accepts a ShareSettings object.
    const fromSettings = buildSharedSummary(ins, { trends: true, ads: false, updatedAt: 'x' });
    expect(fromSettings.categories).toEqual(['trends']);
  });

  it('excludes sensitive topics unless allowed, without breaking totals', () => {
    const ins = teenInsights();
    const s = buildSharedSummary(ins, ALL_BUT_SENSITIVE);
    const json = JSON.stringify(s).toLowerCase();
    expect(json).not.toContain('dieting');
    expect(json).not.toContain('weight');
    expect(json).not.toContain('secret-diet-channel');
    expect(s.trends!.monthly.map((r) => r.topic)).toEqual(['gaming', 'fitness', 'music', 'other']);
    // Hidden share is folded into Other: each month still adds up to 100.
    s.trends!.months.forEach((_, i) => {
      expect(Math.round(s.trends!.monthly.reduce((n, r) => n + r.shares[i], 0))).toBe(100);
    });
    expect(s.trends!.rising.map((r) => r.topic)).toEqual(['fitness']);
    expect(s.sources!.topics.map((t) => t.topic)).not.toContain('dieting');
    expect(s.ads!.platformInterests[0].interests.map((i) => i.name)).toEqual(['Fitness', 'Gaming']);

    const withSens = buildSharedSummary(ins, [...ALL_BUT_SENSITIVE, 'sensitive']);
    expect(withSens.trends!.monthly.map((r) => r.topic)).toContain('dieting');
    expect(withSens.sources!.topics.map((t) => t.topic)).toContain('dieting');
    expect(withSens.ads!.platformInterests[0].interests.map((i) => i.name)).toContain('Weight loss');

    const adult = buildSharedSummary(adultInsights(), ['trends', 'sources']);
    expect(JSON.stringify(adult).toLowerCase()).not.toContain('politic');
  });

  it('filters digest lines: no quotes, URLs, searches, hidden topics; channels only with sources', () => {
    const ins = teenInsights();
    const trendsOnly = buildSharedSummary(ins, ['trends']).trends!.digest.lines;
    expect(trendsOnly).toEqual([
      'You watched 120 videos, 10 more than the week before.',
      'You chose 20% of what you watched (25% the week before). The rest was served.',
    ]);
    const withSources = buildSharedSummary(ins, ['trends', 'sources', 'sensitive']).trends!.digest.lines;
    expect(withSources).toContain('New in your feed: [Account B] (12 videos).');
    expect(withSources).toContain('Most watched: dieting and weight loss, 21% of your viewing (18% the week before).');
    expect(withSources.join(' ')).not.toContain('SECRET');
  });

  it('does not leak extra fields added to Insights later', () => {
    const ins = { ...teenInsights(), secretFutureField: CANARIES[0] } as never;
    expect(JSON.stringify(buildSharedSummary(ins, [...SHARE_CATEGORIES]))).not.toContain(CANARIES[0]);
  });
});
