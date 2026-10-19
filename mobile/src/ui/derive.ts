// Copies of the small view-model helpers the web screens keep next to their React code
// (src/components/screens/Home.tsx, Ads.tsx, src/lib/ui/timeline.ts), so mobile need not import DOM modules.
import type { AdvertiserRecord, Insights, Platform, TopicId } from '@/lib/types';
import { dateShort, joinAnd, monthLong, monthShort, PLATFORM_LABEL, plural } from '@/lib/ui/format';
import type { ChartSeries } from './LineChart';
import type { Colors } from './theme';

export function syncedLine(insights: Insights): string {
  if (!insights.platforms.length) return 'No platforms imported yet';
  const labels = insights.platforms.map((p) => PLATFORM_LABEL[p.platform]);
  const latest = insights.platforms.map((p) => p.to).sort().at(-1);
  return `From ${joinAnd(labels)}${latest ? `, up to ${dateShort(latest)}` : ''}`;
}

export function rangeLine(r: Insights['range']): string | null {
  if (!r.monthThen || !r.monthNow || (!r.topicsThen && !r.topicsNow)) return null;
  const then = monthLong(r.monthThen);
  if (r.narrowing) return `Narrowing: ${r.topicsThen} topics made up most of your viewing in ${then}, ${r.topicsNow} now.`;
  if (r.topicsNow > r.topicsThen) return `Widening: ${r.topicsThen} topics made up most of your viewing in ${then}, ${r.topicsNow} now.`;
  return `Steady: about ${r.topicsNow} topics make up most of your viewing, as in ${then}.`;
}

export function adsLine(ads: Insights['ads']): string {
  const names = new Set(ads.advertisers.map((a) => a.name.trim().toLowerCase()).filter(Boolean)).size;
  const tricks = ads.trickyAdItems ?? Math.max(0, ...ads.tactics.map((t) => t.count));
  const parts: string[] = [];
  if (names) parts.push(`${plural(names, 'advertiser')} ${names === 1 ? 'has' : 'have'} your data or targeted you`);
  if (tricks) parts.push(`${plural(tricks, 'ad')} used pressure tricks`);
  return parts.length ? `${parts.join('. ')}.` : 'See who targets you and how to stop it.';
}

/** Same advertiser on several platforms becomes one row. */
export function mergeAdvertisers(list: AdvertiserRecord[]) {
  const map = new Map<string, { name: string; platforms: Platform[]; count?: number }>();
  for (const a of list) {
    const key = a.name.trim().toLowerCase();
    if (!key) continue;
    const cur = map.get(key) ?? { name: a.name.trim(), platforms: [] };
    if (!cur.platforms.includes(a.platform)) cur.platforms.push(a.platform);
    if (typeof a.count === 'number') cur.count = (cur.count ?? 0) + a.count;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name));
}

// ── Timeline ────────────────────────────────────────────

export type RangeKey = '6m' | '1y' | 'all';
export const RANGE_MONTHS: Record<RangeKey, number> = { '6m': 6, '1y': 12, all: Infinity };

export interface TimelineView {
  months: string[];
  labels: string[];
  series: ChartSeries[];
  marker?: { index: number; seriesKey?: string };
  ariaLabel: string;
}

export function focusTopic(ins: Insights): TopicId | undefined {
  const inChart = (t?: TopicId) => !!t && ins.monthly.some((m) => m.topic === t);
  const candidates = [ins.turningPoints[0]?.topic, ins.headline.topic, ins.rising[0]?.topic];
  return candidates.find(inChart);
}

export function buildTimeline(ins: Insights, range: RangeKey, c: Colors, maxSeries = 4): TimelineView | null {
  const styles: Pick<ChartSeries, 'color' | 'dash' | 'emphasis'>[] = [
    { color: c.accent, emphasis: true },
    { color: c.t1 },
    { color: c.mutedLine, dash: true },
    { color: c.served },
  ];
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
  const series: ChartSeries[] = chosen.map((m, i) => ({
    key: m.topic,
    name: m.label,
    values: months.map((_, j) => m.shares[start + j] ?? 0),
    ...styles[i % styles.length],
  }));

  const labels = months.map((m) => monthShort(m, count > 12));
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
