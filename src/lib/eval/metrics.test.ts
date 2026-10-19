import { describe, expect, it } from 'vitest';
import type { DriftEvent } from '@/lib/types';
import {
  baselineOrigins, binaryOrigin, chosenPct, classificationReport, evaluateDrift, inWindow, monthDiff,
  monthlyCountsBaseline, topConfusions,
} from './metrics';

describe('classificationReport', () => {
  it('computes accuracy, per-class precision/recall/F1 and the confusion matrix', () => {
    const truth = ['a', 'a', 'a', 'b', 'b', 'c'];
    const pred = ['a', 'a', 'b', 'b', 'c', 'c'];
    const r = classificationReport(truth, pred);
    expect(r.accuracy).toBeCloseTo(4 / 6);
    expect(r.labels).toEqual(['a', 'b', 'c']);
    expect(r.matrix).toEqual([[2, 1, 0], [0, 1, 1], [0, 0, 1]]);
    const a = r.perClass.find((c) => c.label === 'a')!;
    expect(a.precision).toBe(1);
    expect(a.recall).toBeCloseTo(2 / 3);
    expect(a.f1).toBeCloseTo(0.8);
    const b = r.perClass.find((c) => c.label === 'b')!;
    expect(b.precision).toBeCloseTo(0.5);
    expect(b.recall).toBeCloseTo(0.5);
    const c = r.perClass.find((x) => x.label === 'c')!;
    expect(c.f1).toBeCloseTo(2 / 3);
    expect(r.macroF1).toBeCloseTo((0.8 + 0.5 + 2 / 3) / 3);
  });

  it('includes predicted-only labels in macro-F1 (scikit-learn default) and handles empty classes', () => {
    const r = classificationReport(['a', 'a'], ['a', 'x']);
    expect(r.labels).toEqual(['a', 'x']);
    expect(r.perClass.find((c) => c.label === 'x')!.f1).toBe(0);
    expect(r.macroF1).toBeCloseTo((2 / 3 + 0) / 2);
  });

  it('respects a label order and rejects mismatched lengths', () => {
    expect(classificationReport(['b', 'a'], ['b', 'a'], ['b', 'a', 'z']).labels).toEqual(['b', 'a']);
    expect(() => classificationReport(['a'], [])).toThrow();
  });
});

describe('topConfusions', () => {
  it('ranks the most frequent mistakes', () => {
    const c = topConfusions(['a', 'a', 'a', 'b', 'b'], ['x', 'x', 'a', 'y', 'b'], 5);
    expect(c[0]).toEqual({ truth: 'a', pred: 'x', count: 2 });
    expect(c).toHaveLength(2);
  });
});

describe('origin helpers', () => {
  it('counts engaged as chosen', () => {
    expect(chosenPct(['chosen', 'engaged', 'served', 'pushed'])).toBe(50);
    expect(binaryOrigin('engaged')).toBe('chosen');
    expect(binaryOrigin('pushed')).toBe('served');
  });

  it('selects the last N days up to the latest event', () => {
    const day = 86_400_000;
    expect(inWindow([0, 10 * day, 45 * day, 50 * day], 30)).toEqual([false, false, true, true]);
  });

  it('baselines use the ad flag and likes, then their own rule', () => {
    const ev = (kind: DriftEvent['kind'], extra: Partial<DriftEvent> = {}): DriftEvent => ({ id: kind + Math.random(), platform: 'youtube', kind, time: '2026-01-01T00:00:00Z', ...extra });
    const events = [ev('search', { query: 'x' }), ev('watch', { channel: { name: 'Sub' } }), ev('watch', { channel: { name: 'Other' } }), ev('watch', { fromAds: true }), ev('like')];
    const follows = [{ platform: 'youtube' as const, name: 'sub' }];
    expect(baselineOrigins('everything_served', events, follows)).toEqual(['served', 'served', 'served', 'pushed', 'engaged']);
    expect(baselineOrigins('only_searches_chosen', events, follows)).toEqual(['chosen', 'served', 'served', 'pushed', 'engaged']);
    expect(baselineOrigins('searches_and_subscriptions', events, follows)).toEqual(['chosen', 'chosen', 'served', 'pushed', 'engaged']);
  });
});

describe('drift', () => {
  it('monthDiff counts months across years', () => {
    expect(monthDiff('2025-11', '2026-02')).toBe(3);
    expect(monthDiff('2026-05', '2026-04')).toBe(-1);
  });

  it('scores a hit with its delay and ignores falls caused by the rise', () => {
    const r = evaluateDrift(
      [
        { month: '2026-06', topic: 'politics', direction: 'up' },
        { month: '2026-06', topic: 'football', direction: 'down' },
        { month: '2026-02', topic: 'food', direction: 'down' },
        { month: '2026-07', topic: 'gaming', direction: 'up' },
      ],
      { onset: '2026-05', target: 'politics', declining: 'football' },
    );
    expect(r).toEqual({ scripted: true, detected: '2026-06', delay: 1, hit: true, falseAlarms: 2 });
  });

  it('misses when late beyond the tolerance or absent', () => {
    expect(evaluateDrift([{ month: '2026-08', topic: 'politics', direction: 'up' }], { onset: '2026-05', target: 'politics' }).hit).toBe(false);
    expect(evaluateDrift([{ month: '2026-05', topic: 'politics', direction: 'down' }], { onset: '2026-05', target: 'politics' }).detected).toBeUndefined();
  });

  it('counts every turning point as a false alarm when nothing was scripted', () => {
    const r = evaluateDrift([{ month: '2026-03', topic: 'gaming', direction: 'up' }, { month: '2026-04', topic: 'tech', direction: 'down' }], {});
    expect(r).toEqual({ scripted: false, hit: false, falseAlarms: 2 });
  });

  it('monthly counts baseline flags the largest month-over-month increase above thresholds', () => {
    const items = [
      ...Array.from({ length: 20 }, () => ({ month: '2026-01', topic: 'a' })),
      ...Array.from({ length: 22 }, () => ({ month: '2026-02', topic: 'a' })),
      ...Array.from({ length: 2 }, () => ({ month: '2026-01', topic: 'b' })),
      ...Array.from({ length: 30 }, () => ({ month: '2026-02', topic: 'b' })),
      ...Array.from({ length: 50 }, () => ({ month: '2026-02', topic: 'other' })),
    ];
    expect(monthlyCountsBaseline(items)).toEqual([{ month: '2026-02', topic: 'b', increase: 28 }]);
    expect(monthlyCountsBaseline(items.filter((i) => i.topic !== 'b'))).toEqual([]);
  });
});
