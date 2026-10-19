// Evaluation metrics: classification reports, chosen% error, drift onset detection, baselines.
// Pure functions, no I/O.
import type { DriftEvent, FollowRecord, Origin, TopicId, TurningPoint } from '@/lib/types';

// ── classification ─────────────────────────────────────────────────

export interface ClassStats { label: string; precision: number; recall: number; f1: number; support: number; predicted: number }

export interface ClassificationReport {
  n: number;
  accuracy: number;
  /** Mean F1 over the union of true and predicted labels (as scikit-learn's default). */
  macroF1: number;
  labels: string[];
  /** matrix[i][j] = count with truth labels[i] predicted labels[j]. */
  matrix: number[][];
  perClass: ClassStats[];
}

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

export function classificationReport(truth: string[], pred: string[], labelOrder?: string[]): ClassificationReport {
  if (truth.length !== pred.length) throw new Error('truth and pred must have the same length');
  const seen = new Set([...truth, ...pred]);
  const labels = labelOrder ? [...labelOrder.filter((l) => seen.has(l)), ...[...seen].filter((l) => !labelOrder.includes(l)).sort()] : [...seen].sort();
  const at = new Map(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => new Array<number>(labels.length).fill(0));
  let correct = 0;
  for (let i = 0; i < truth.length; i++) {
    matrix[at.get(truth[i])!][at.get(pred[i])!]++;
    if (truth[i] === pred[i]) correct++;
  }
  const perClass = labels.map((label, i) => {
    const tp = matrix[i][i];
    const support = matrix[i].reduce((a, b) => a + b, 0);
    const predicted = matrix.reduce((a, row) => a + row[i], 0);
    const precision = safeDiv(tp, predicted);
    const recall = safeDiv(tp, support);
    return { label, precision, recall, f1: safeDiv(2 * precision * recall, precision + recall), support, predicted };
  });
  return {
    n: truth.length,
    accuracy: safeDiv(correct, truth.length),
    macroF1: safeDiv(perClass.reduce((a, c) => a + c.f1, 0), perClass.length),
    labels,
    matrix,
    perClass,
  };
}

/** Most frequent (truth -> predicted) mistakes. */
export function topConfusions(truth: string[], pred: string[], n = 10): { truth: string; pred: string; count: number }[] {
  const m = new Map<string, number>();
  for (let i = 0; i < truth.length; i++) if (truth[i] !== pred[i]) m.set(`${truth[i]}\u0000${pred[i]}`, (m.get(`${truth[i]}\u0000${pred[i]}`) ?? 0) + 1);
  return [...m.entries()]
    .map(([k, count]) => { const [t, p] = k.split('\u0000'); return { truth: t, pred: p, count }; })
    .sort((a, b) => b.count - a.count || a.truth.localeCompare(b.truth) || a.pred.localeCompare(b.pred))
    .slice(0, n);
}

// ── origin ─────────────────────────────────────────────────────────

/** Chosen = chosen or engaged (as in Insights.chosen). */
export const isChosenOrigin = (o: Origin) => o === 'chosen' || o === 'engaged';
export const binaryOrigin = (o: Origin): 'chosen' | 'served' => (isChosenOrigin(o) ? 'chosen' : 'served');

export function chosenPct(origins: Origin[]): number {
  return safeDiv(origins.filter(isChosenOrigin).length, origins.length) * 100;
}

/** Events in the analysis' chosen window: the last `days` days up to the latest event. */
export function inWindow(times: number[], days = 30): boolean[] {
  const now = Math.max(...times);
  const start = now - days * 86_400_000;
  return times.map((t) => t > start && t <= now);
}

// ── origin baselines ───────────────────────────────────────────────
// All baselines use what the export states outright: ads are flagged ("From Google Ads")
// and likes are their own records, so those get pushed/engaged for free.

export type OriginBaseline = 'everything_served' | 'only_searches_chosen' | 'searches_and_subscriptions';

export const ORIGIN_BASELINE_LABELS: Record<OriginBaseline, string> = {
  everything_served: 'Everything served',
  only_searches_chosen: 'Only searches are chosen',
  searches_and_subscriptions: 'Searches + subscribed channels',
};

export function baselineOrigins(kind: OriginBaseline, events: DriftEvent[], follows: FollowRecord[]): Origin[] {
  const subs = new Set(follows.map((f) => f.name.trim().toLowerCase()));
  return events.map((e) => {
    if (e.kind === 'ad' || e.fromAds) return 'pushed';
    if (e.kind === 'like' || e.kind === 'save' || e.kind === 'share' || e.kind === 'comment') return 'engaged';
    if (kind === 'everything_served') return 'served';
    if (e.kind === 'search') return 'chosen';
    if (kind === 'searches_and_subscriptions' && e.channel && subs.has(e.channel.name.trim().toLowerCase())) return 'chosen';
    return 'served';
  });
}

// ── drift ──────────────────────────────────────────────────────────

/** Months from a to b ('YYYY-MM'): positive when b is later. */
export function monthDiff(a: string, b: string): number {
  const n = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
  return n(b) - n(a);
}

export interface DriftScriptTruth {
  /** 'YYYY-MM'; undefined when the persona has no scripted drift. */
  onset?: string;
  target?: TopicId;
  declining?: TopicId;
}

export interface DriftResult {
  scripted: boolean;
  /** Month the detector reported for the target topic, rising. */
  detected?: string;
  /** detected - onset in months (positive = late). */
  delay?: number;
  /** Detected within ±tolerance months of the scripted onset. */
  hit: boolean;
  /** Turning points not explained by the script (all of them for a no-drift persona). */
  falseAlarms: number;
}

/**
 * Score turning points against the script. Expected: the target rising, and any topic
 * falling within [onset-1, onset+2] (shares sum to 100%, so a rise pushes others down).
 * Every other turning point is a false alarm; with no scripted drift, all of them are.
 */
export function evaluateDrift(points: Pick<TurningPoint, 'month' | 'topic' | 'direction'>[], script: DriftScriptTruth, tolerance = 1): DriftResult {
  if (!script.onset || !script.target) return { scripted: false, hit: false, falseAlarms: points.length };
  const onset = script.onset;
  const tp = points.find((p) => p.topic === script.target && p.direction === 'up');
  const expected = (p: Pick<TurningPoint, 'month' | 'topic' | 'direction'>) =>
    (p.topic === script.target && p.direction === 'up') ||
    (p.direction === 'down' && monthDiff(onset, p.month) >= -1 && monthDiff(onset, p.month) <= 2);
  const falseAlarms = points.filter((p) => !expected(p)).length;
  if (!tp) return { scripted: true, hit: false, falseAlarms };
  const delay = monthDiff(script.onset, tp.month);
  return { scripted: true, detected: tp.month, delay, hit: Math.abs(delay) <= tolerance, falseAlarms };
}

/**
 * Baseline "simple monthly counts": count viewing per topic per month, and report the
 * largest month-over-month increase as the onset. Flags a change only when the increase is
 * at least `minIncrease` items and `minRatio` times the previous month (so it can stay quiet).
 */
export function monthlyCountsBaseline(
  items: { month: string; topic: TopicId }[],
  opts: { minIncrease?: number; minRatio?: number; ignore?: TopicId[] } = {},
): { month: string; topic: TopicId; increase: number }[] {
  const minIncrease = opts.minIncrease ?? 10;
  const minRatio = opts.minRatio ?? 1.5;
  const ignore = new Set(opts.ignore ?? ['other', 'unknown']);
  const months = [...new Set(items.map((i) => i.month))].sort();
  const counts = new Map<TopicId, number[]>();
  const at = new Map(months.map((m, i) => [m, i]));
  for (const it of items) {
    if (ignore.has(it.topic)) continue;
    let arr = counts.get(it.topic);
    if (!arr) counts.set(it.topic, (arr = new Array<number>(months.length).fill(0)));
    arr[at.get(it.month)!]++;
  }
  let best: { month: string; topic: TopicId; increase: number } | undefined;
  for (const [topic, arr] of counts) {
    for (let m = 1; m < arr.length; m++) {
      const inc = arr[m] - arr[m - 1];
      if (inc >= minIncrease && arr[m] >= arr[m - 1] * minRatio && (!best || inc > best.increase)) best = { month: months[m], topic, increase: inc };
    }
  }
  return best ? [best] : [];
}

// ── small stats ────────────────────────────────────────────────────

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
