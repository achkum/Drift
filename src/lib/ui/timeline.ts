import type { Insights, TopicId } from '@/lib/types';
import type { ChartSeries } from '@/components/LineChart';
import { monthLong, monthShort } from './format';

export type RangeKey = '6m' | '1y' | 'all';
export const RANGE_MONTHS: Record<RangeKey, number> = { '6m': 6, '1y': 12, all: Infinity };

const STYLES: Pick<ChartSeries, 'color' | 'dash' | 'emphasis'>[] = [
  { color: 'var(--accent)', emphasis: true },
  { color: 'var(--t1)' },
  { color: 'var(--muted-line)', dash: true },
  { color: 'var(--served)' },
];

export interface TimelineView {
  months: string[];
  labels: string[];
  series: ChartSeries[];
  marker?: { index: number; seriesKey?: string };
  ariaLabel: string;
}

/** The topic the chart highlights: top turning point, else the headline topic, else the biggest riser. */
export function focusTopic(ins: Insights): TopicId | undefined {
  const inChart = (t?: TopicId) => !!t && ins.monthly.some((m) => m.topic === t);
  const candidates = [ins.turningPoints[0]?.topic, ins.headline.topic, ins.rising[0]?.topic];
  return candidates.find(inChart);
}

export function buildTimeline(ins: Insights, range: RangeKey, maxSeries = 4): TimelineView | null {
  const total = ins.months.length;
  if (!total || !ins.monthly.length) return null;
  const count = Math.min(total, RANGE_MONTHS[range]);
  const start = total - count;
  const months = ins.months.slice(start);

  const avg = (vals: number[]) => {
    const s = vals.slice(start);
    return s.length ? s.reduce((a, b) => a + (b || 0), 0) / s.length : 0;
  };
  const focus = focusTopic(ins);
  const ranked = ins.monthly
    .filter((m) => m.topic !== 'other' && m.topic !== focus)
    .sort((a, b) => avg(b.shares) - avg(a.shares));
  const chosen = [...ins.monthly.filter((m) => m.topic === focus), ...ranked].slice(0, maxSeries);
  // If there is no focus topic, the first ranked topic takes the accent colour.
  const series: ChartSeries[] = chosen.map((m, i) => ({
    key: m.topic,
    name: m.label,
    values: months.map((_, j) => m.shares[start + j] ?? 0),
    ...STYLES[i % STYLES.length],
  }));

  const withYear = count > 12;
  const labels = months.map((m) => monthShort(m, withYear));

  const tp = ins.turningPoints[0];
  const tpIndex = tp ? months.indexOf(tp.month) : -1;
  const marker = tpIndex >= 0 ? { index: tpIndex, seriesKey: series.some((s) => s.key === tp!.topic) ? tp!.topic : undefined } : undefined;

  const from = monthLong(months[0], true);
  const to = monthLong(months[months.length - 1], true);
  const desc = series.map((s) => `${s.name} goes from ${Math.round(s.values[0])}% to ${Math.round(s.values[s.values.length - 1])}%`).join(', ');
  const ariaLabel = months.length === 1
    ? `Share of viewing by topic in ${from}. ${series.map((s) => `${s.name} ${Math.round(s.values[0])}%`).join(', ')}.`
    : `Share of viewing by topic from ${from} to ${to}. ${desc}.`;

  return { months, labels, series, marker, ariaLabel };
}
