// OWNER: household agent. Conservative safety alerts, detected on the member's own device.
//
// Rule (all must hold, per watched topic):
//   1. the topic is in Insights.monthly (top topics) with at least 2 months of data;
//   2. latest month share ≥ MIN_SHARE (12 %), i.e. roughly 1 in 8 videos;
//   3. it rose by ≥ MIN_RISE (10 percentage points) from the lowest month within
//      the previous WINDOW_MONTHS (3) months, i.e. a sharp change, not a stable interest;
//   4. when Insights.topics has the topic, it has ≥ MIN_ITEMS (20) items, so a
//      handful of videos never triggers an alert.
// Only topics in WATCHED_TOPICS are checked. The current taxonomy has 'dieting';
// the others are listed so they work as soon as the taxonomy adds them.
// Politics is deliberately not watched: a rise in news viewing is not a safety
// signal and alerting on it would be paternalistic.
import type { Insights, TopicId } from '@/lib/types';
import type { SafetyAlert } from './types';

export const WATCHED_TOPICS: { id: TopicId; name: string }[] = [
  { id: 'dieting', name: 'extreme dieting' },
  { id: 'eating_disorder', name: 'eating-disorder' },
  { id: 'self_harm', name: 'self-harm related' },
  { id: 'gambling', name: 'gambling' },
];

export const SAFETY_THRESHOLDS = {
  MIN_SHARE: 12,
  MIN_RISE: 10,
  WINDOW_MONTHS: 3,
  MIN_ITEMS: 20,
} as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m;

export function alertMessage(name: string, from: number, to: number, fromMonth: string, toMonth: string): string {
  return `Your feed is shifting toward ${name} content: from ${Math.round(from)}% of your viewing in ${monthName(fromMonth)} to ${Math.round(to)}% in ${monthName(toMonth)}. ` +
    'This is an estimate from what you watched, not a diagnosis.';
}

/** Pure detection. `now` stamps detectedAt for new alerts. */
export function detectSafetyAlerts(insights: Insights, now = new Date(), thresholds = SAFETY_THRESHOLDS): SafetyAlert[] {
  const months = insights.months ?? [];
  const out: SafetyAlert[] = [];
  for (const w of WATCHED_TOPICS) {
    const row = insights.monthly?.find((r) => r.topic === w.id);
    if (!row) continue;
    const shares = row.shares ?? [];
    const last = Math.min(shares.length, months.length) - 1;
    if (last < 1) continue;
    const latest = shares[last];
    if (!(latest >= thresholds.MIN_SHARE)) continue;
    const detail = insights.topics?.[w.id];
    if (detail && detail.itemCount < thresholds.MIN_ITEMS) continue;
    let lowIdx = last;
    for (let i = Math.max(0, last - thresholds.WINDOW_MONTHS); i < last; i++) if (shares[i] < shares[lowIdx]) lowIdx = i;
    const rise = latest - shares[lowIdx];
    if (rise < thresholds.MIN_RISE) continue;
    out.push({
      id: `${w.id}:${months[last]}`,
      topic: w.id,
      label: detail?.label ?? row.label,
      fromShare: shares[lowIdx],
      toShare: latest,
      fromMonth: months[lowIdx],
      toMonth: months[last],
      rise: Math.round(rise * 10) / 10,
      detectedAt: now.toISOString(),
      message: alertMessage(w.name, shares[lowIdx], latest, months[lowIdx], months[last]),
    });
  }
  return out;
}

/** Keeps first-detection times (and dismissals) for alerts already known, adds new ones. */
export function mergeAlerts(known: SafetyAlert[], detected: SafetyAlert[]): SafetyAlert[] {
  const byId = new Map(known.map((a) => [a.id, a]));
  for (const d of detected) {
    const k = byId.get(d.id);
    if (k) { byId.set(d.id, { ...d, detectedAt: k.detectedAt, dismissed: k.dismissed }); continue; }
    // A still-open alert for the same topic is updated in place, not repeated every month.
    const open = [...byId.values()].find((a) => a.topic === d.topic && !a.dismissed);
    if (open) byId.set(open.id, { ...d, id: open.id, detectedAt: open.detectedAt });
    else byId.set(d.id, d);
  }
  return [...byId.values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}
