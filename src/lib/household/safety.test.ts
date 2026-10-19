import { describe, expect, it } from 'vitest';
import type { Insights } from '@/lib/types';
import { SAFETY_THRESHOLDS, detectSafetyAlerts, mergeAlerts } from './safety';
import { ALERT_SHARE_DELAY_MS, buildSharedSummary, shareableAlerts } from './summary';
import { adultInsights, teenInsights } from './testFixtures';

function withDieting(shares: number[], itemCount = 61): Insights {
  const ins = teenInsights();
  ins.monthly = ins.monthly.map((r) => (r.topic === 'dieting' ? { ...r, shares } : r));
  ins.topics.dieting = { ...ins.topics.dieting, itemCount };
  return ins;
}

const NOW = new Date('2026-10-18T12:00:00Z');

describe('detectSafetyAlerts', () => {
  it('flags a sharp dieting rise (Maya: 2% → 19% within 3 months)', () => {
    const [a, ...rest] = detectSafetyAlerts(teenInsights(), NOW);
    expect(rest).toHaveLength(0);
    expect(a).toMatchObject({ id: 'dieting:2026-10', topic: 'dieting', fromShare: 2, toShare: 19, fromMonth: '2026-07', toMonth: '2026-10', rise: 17 });
    expect(a.message).toContain('not a diagnosis');
    expect(a.message).toContain('estimate');
  });

  it('stays quiet below each threshold', () => {
    const { MIN_SHARE, MIN_RISE } = SAFETY_THRESHOLDS;
    // Latest share below MIN_SHARE.
    expect(detectSafetyAlerts(withDieting([0, 0, 0, 0, 1, MIN_SHARE - 1]), NOW)).toHaveLength(0);
    // Rise just under MIN_RISE.
    expect(detectSafetyAlerts(withDieting([5, 5, 5, 5, 5, 5 + MIN_RISE - 1]), NOW)).toHaveLength(0);
    // Exactly at thresholds fires.
    expect(detectSafetyAlerts(withDieting([2, 2, 2, 2, 2, 2 + MIN_RISE]), NOW)).toHaveLength(1);
    // Slow rise over more than 3 months: low point is outside the window.
    expect(detectSafetyAlerts(withDieting([2, 6, 9, 12, 14, 15]), NOW)).toHaveLength(0);
    // Stable high interest is not a sharp change.
    expect(detectSafetyAlerts(withDieting([20, 21, 19, 20, 22, 21]), NOW)).toHaveLength(0);
    // Too few items.
    expect(detectSafetyAlerts(withDieting([1, 1, 2, 6, 12, 19], 10), NOW)).toHaveLength(0);
    // One month of data.
    expect(detectSafetyAlerts({ ...withDieting([30]), months: ['2026-10'] }, NOW)).toHaveLength(0);
  });

  it('never alerts on politics or other unwatched topics', () => {
    expect(detectSafetyAlerts(adultInsights(), NOW)).toHaveLength(0);
  });

  it('keeps the first detection time and updates an open alert instead of repeating it', () => {
    const first = detectSafetyAlerts(teenInsights(), NOW);
    const later = detectSafetyAlerts(teenInsights(), new Date('2026-10-25T00:00:00Z'));
    expect(mergeAlerts(first, later)[0].detectedAt).toBe(NOW.toISOString());
    const next = detectSafetyAlerts({ ...withDieting([1, 2, 6, 12, 19, 24]), months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'] }, new Date('2026-11-20T00:00:00Z'));
    const merged = mergeAlerts(first, next);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'dieting:2026-10', toShare: 24, detectedAt: NOW.toISOString() });
  });
});

describe('teen first: alerts reach others only after the delay', () => {
  const alerts = detectSafetyAlerts(teenInsights(), NOW);

  it('holds alerts back for 48 hours', () => {
    expect(ALERT_SHARE_DELAY_MS).toBe(48 * 3600 * 1000);
    expect(shareableAlerts(alerts, new Date(NOW.getTime() + ALERT_SHARE_DELAY_MS - 1))).toHaveLength(0);
    const out = shareableAlerts(alerts, new Date(NOW.getTime() + ALERT_SHARE_DELAY_MS));
    expect(out).toHaveLength(1);
    expect(out[0].toldMemberAt).toBe(NOW.toISOString());
  });

  it('only with the alerts category, and never once dismissed', () => {
    const later = new Date(NOW.getTime() + 3 * 24 * 3600 * 1000);
    expect(buildSharedSummary(teenInsights(), ['trends'], { alerts, now: later }).alerts).toBeUndefined();
    expect(buildSharedSummary(teenInsights(), ['alerts'], { alerts, now: later }).alerts).toHaveLength(1);
    const dismissed = alerts.map((a) => ({ ...a, dismissed: true }));
    expect(buildSharedSummary(teenInsights(), ['alerts'], { alerts: dismissed, now: later }).alerts).toEqual([]);
  });
});
