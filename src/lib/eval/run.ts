// Runs personas through analyse() and scores the output against ground truth.
import type { ClassifiedEvent, Insights, Origin, TopicClassifier, TopicId } from '@/lib/types';
import { analyse, createKeywordClassifier } from '@/lib/analysis';
import { LABELLED_TITLES } from './labelled-titles';
import {
  baselineOrigins, binaryOrigin, chosenPct, classificationReport, evaluateDrift, inWindow, mean, monthlyCountsBaseline,
  ORIGIN_BASELINE_LABELS, type ClassificationReport, type DriftResult, type OriginBaseline, topConfusions,
} from './metrics';
import { PERSONAS, simulate, type Persona, type Simulation, type TrueReason } from './simulate';

export const DEFAULT_SEEDS = [1, 2, 3, 4, 5];
const ORIGIN_LABELS: Origin[] = ['chosen', 'engaged', 'served', 'pushed'];
const BASELINES: OriginBaseline[] = ['everything_served', 'only_searches_chosen', 'searches_and_subscriptions'];

/** Classifier that returns the true topic: isolates origin and drift logic from topic errors (upper bound). */
export function oracleClassifier(sim: Simulation): TopicClassifier {
  const byKey = new Map<string, TopicId>();
  for (const e of sim.input.events) {
    const key = e.title ?? e.query;
    if (key) byKey.set(key, sim.truth.get(e.id)!.topic);
  }
  return {
    name: 'oracle',
    async classify(items) {
      return items.map((it) => {
        const t = byKey.get(it.title ?? it.query ?? '');
        return t ? { topic: t, confidence: 1 } : { topic: 'other', confidence: 0 };
      });
    },
  };
}

export type AnalysisRule = 'subscribed' | 'after_search' | 'came_back' | 'feed' | 'other';

/** Which labelling rule fired, from the analysis' originReason text. */
export function analysisRule(reason: string): AnalysisRule {
  if (reason.startsWith('subscribed') || reason.startsWith('an account you follow')) return 'subscribed';
  if (reason.startsWith('followed a search')) return 'after_search';
  if (reason.startsWith('came back')) return 'came_back';
  if (reason.startsWith('shown by the feed')) return 'feed';
  return 'other';
}

export interface RunResult {
  persona: Persona;
  seed: number;
  classifier: string;
  events: number;
  months: number;
  /** Per-event pairs, all events. */
  originTruth: Origin[];
  originPred: Origin[];
  /** Watch events (no ads): binary chosen/served. */
  watchTruth: ('chosen' | 'served')[];
  watchPred: ('chosen' | 'served')[];
  watchReasons: TrueReason[];
  /** The analysis' rule behind each watch label. */
  watchRules: AnalysisRule[];
  baselineWatchPred: Record<OriginBaseline, ('chosen' | 'served')[]>;
  baselineAllPred: Record<OriginBaseline, Origin[]>;
  chosen30: { truth: number; drift: number; baselines: Record<OriginBaseline, number> };
  chosenAll: { truth: number; drift: number };
  topicTruth: string[];
  topicPred: string[];
  drift: DriftResult;
  countsBaseline: DriftResult;
  /** Analysis' explanation of the target's turning point vs the true main route. */
  attribution?: { truth: 'served' | 'chosen'; said?: 'served' | 'chosen' };
  headline: string;
  headlineClaimsDrift: boolean;
  headlineNamesTarget: boolean;
  turningPoints: Insights['turningPoints'];
}

export async function runPersona(sim: Simulation, classifier: TopicClassifier): Promise<RunResult> {
  const { persona } = sim;
  const { classified, insights } = await analyse(sim.input, classifier);
  const gt = (e: ClassifiedEvent) => sim.truth.get(e.id)!;

  const originTruth = classified.map((e) => gt(e).origin);
  const originPred = classified.map((e) => e.origin);
  const watches = classified.filter((e) => e.kind === 'watch' && !e.fromAds);
  const watchIdx = new Set(watches.map((e) => e.id));

  const baselineAllPred = {} as Record<OriginBaseline, Origin[]>;
  const baselineWatchPred = {} as Record<OriginBaseline, ('chosen' | 'served')[]>;
  for (const b of BASELINES) {
    baselineAllPred[b] = baselineOrigins(b, classified, sim.input.follows);
    baselineWatchPred[b] = baselineAllPred[b].filter((_, i) => watchIdx.has(classified[i].id)).map(binaryOrigin);
  }

  const times = classified.map((e) => Date.parse(e.time));
  const win = inWindow(times, insights.chosen.windowDays);
  const inWin = <T,>(xs: T[]) => xs.filter((_, i) => win[i]);
  const chosen30 = {
    truth: chosenPct(inWin(originTruth)),
    drift: insights.chosen.chosenPct,
    baselines: Object.fromEntries(BASELINES.map((b) => [b, chosenPct(inWin(baselineAllPred[b]))])) as Record<OriginBaseline, number>,
  };

  const topicEvents = watches.filter((e) => e.title && !gt(e).removed);

  // Drift.
  const d = persona.drift;
  const script = { onset: sim.onsetMonth, target: d?.target, declining: d?.declining };
  const drift = evaluateDrift(insights.turningPoints, script);
  const counts = monthlyCountsBaseline(
    watches.filter((e) => e.topic !== 'unknown').map((e) => ({ month: e.time.slice(0, 7), topic: e.topic })),
  );
  const countsBaseline = evaluateDrift(counts.map((c) => ({ month: c.month, topic: c.topic, direction: 'up' as const })), script);

  let attribution: RunResult['attribution'];
  if (d && sim.onsetMonth) {
    const after = new Set(sim.months.slice(d.onset, d.onset + 3));
    const target = watches.filter((e) => gt(e).topic === d.target && after.has(e.time.slice(0, 7)));
    const servedShare = target.filter((e) => binaryOrigin(gt(e).origin) === 'served').length / Math.max(1, target.length);
    const tp = insights.turningPoints.find((p) => p.topic === d.target && p.direction === 'up');
    const said = tp ? (tp.explanation.startsWith('Mostly served') ? 'served' : tp.explanation.startsWith('Mostly your choice') ? 'chosen' : undefined) : undefined;
    attribution = { truth: servedShare >= 0.5 ? 'served' : 'chosen', said };
  }

  const headline = insights.headline.title;
  return {
    persona,
    seed: sim.seed,
    classifier: classifier.name,
    events: classified.length,
    months: insights.months.length,
    originTruth,
    originPred,
    watchTruth: watches.map((e) => binaryOrigin(gt(e).origin)),
    watchPred: watches.map((e) => binaryOrigin(e.origin)),
    watchReasons: watches.map((e) => gt(e).reason),
    watchRules: watches.map((e) => analysisRule(e.originReason)),
    baselineWatchPred,
    baselineAllPred,
    chosen30,
    chosenAll: { truth: chosenPct(originTruth), drift: chosenPct(originPred) },
    topicTruth: topicEvents.map((e) => gt(e).topic),
    topicPred: topicEvents.map((e) => e.topic),
    drift,
    countsBaseline,
    attribution,
    headline,
    headlineClaimsDrift: headline.startsWith('Your feed drifted'),
    headlineNamesTarget: Boolean(d && insights.headline.topic === d.target && headline.includes('toward')),
    turningPoints: insights.turningPoints,
  };
}

export interface TitleEval {
  classifier: string;
  report: ClassificationReport;
  coverage: number;
  accuracyEn: number;
  accuracySv: number;
  accuracyHard: number;
  accuracyEasy: number;
  confusions: ReturnType<typeof topConfusions>;
}

export async function evaluateTitles(classifier: TopicClassifier): Promise<TitleEval> {
  const preds = await classifier.classify(LABELLED_TITLES.map((t) => ({ title: t.title, channel: t.channel })));
  const truth = LABELLED_TITLES.map((t) => t.topic);
  const pred = preds.map((p) => p.topic);
  const acc = (f: (i: number) => boolean) => {
    const idx = truth.map((_, i) => i).filter(f);
    return idx.filter((i) => truth[i] === pred[i]).length / Math.max(1, idx.length);
  };
  return {
    classifier: classifier.name,
    report: classificationReport(truth, pred),
    coverage: pred.filter((p) => p !== 'other').length / pred.length,
    accuracyEn: acc((i) => LABELLED_TITLES[i].lang === 'en'),
    accuracySv: acc((i) => LABELLED_TITLES[i].lang === 'sv'),
    accuracyHard: acc((i) => Boolean(LABELLED_TITLES[i].hard)),
    accuracyEasy: acc((i) => !LABELLED_TITLES[i].hard),
    confusions: topConfusions(truth, pred, 12),
  };
}

export interface EvalOptions {
  seeds?: number[];
  personas?: Persona[];
  /** Extra classifiers to run besides keyword and oracle (e.g. ML). */
  extraClassifiers?: TopicClassifier[];
}

export interface EvalResults {
  seeds: number[];
  personas: Persona[];
  classifiers: string[];
  runs: RunResult[];
  titles: TitleEval[];
}

export async function runEvaluation(opts: EvalOptions = {}): Promise<EvalResults> {
  const seeds = opts.seeds ?? DEFAULT_SEEDS;
  const personas = opts.personas ?? PERSONAS;
  const extra = opts.extraClassifiers ?? [];
  const runs: RunResult[] = [];
  for (const persona of personas) {
    for (const seed of seeds) {
      const sim = simulate(persona, seed);
      runs.push(await runPersona(sim, createKeywordClassifier()));
      runs.push(await runPersona(sim, oracleClassifier(sim)));
      for (const c of extra) runs.push(await runPersona(sim, c));
    }
  }
  const titles = [await evaluateTitles(createKeywordClassifier())];
  for (const c of extra) titles.push(await evaluateTitles(c));
  return { seeds, personas, classifiers: ['keyword', 'oracle', ...extra.map((c) => c.name)], runs, titles };
}

// ── aggregation ────────────────────────────────────────────────────

export interface OriginSummary {
  all: ClassificationReport;
  watch: ClassificationReport;
  chosen30Mae: number;
  chosenAllMae: number;
  byReason: { reason: TrueReason; n: number; correct: number }[];
}

export function summariseOrigin(runs: RunResult[], which: 'drift' | OriginBaseline = 'drift'): OriginSummary {
  const tAll = runs.flatMap((r) => r.originTruth);
  const pAll = runs.flatMap((r) => (which === 'drift' ? r.originPred : r.baselineAllPred[which]));
  const tW = runs.flatMap((r) => r.watchTruth);
  const pW = runs.flatMap((r) => (which === 'drift' ? r.watchPred : r.baselineWatchPred[which]));
  const reasons = runs.flatMap((r) => r.watchReasons);
  const byReason = new Map<TrueReason, { n: number; correct: number }>();
  reasons.forEach((rs, i) => {
    const b = byReason.get(rs) ?? { n: 0, correct: 0 };
    b.n++;
    if (tW[i] === pW[i]) b.correct++;
    byReason.set(rs, b);
  });
  const c30 = runs.map((r) => Math.abs((which === 'drift' ? r.chosen30.drift : r.chosen30.baselines[which]) - r.chosen30.truth));
  const cAll = runs.map((r) => Math.abs((which === 'drift' ? r.chosenAll.drift : chosenPct(r.baselineAllPred[which])) - r.chosenAll.truth));
  return {
    all: classificationReport(tAll, pAll, ORIGIN_LABELS),
    watch: classificationReport(tW, pW, ['chosen', 'served']),
    chosen30Mae: mean(c30),
    chosenAllMae: mean(cAll),
    byReason: [...byReason.entries()].map(([reason, b]) => ({ reason, ...b })).sort((a, b) => a.reason.localeCompare(b.reason)),
  };
}

export { ORIGIN_BASELINE_LABELS, BASELINES };
