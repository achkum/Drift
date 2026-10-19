// Markdown report and console summary for an evaluation run.
import { classificationReport, mean, ORIGIN_BASELINE_LABELS, type DriftResult } from './metrics';
import { BASELINES, summariseOrigin, type EvalResults, type RunResult } from './run';

const p = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
const n1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
const head = (cells: string[]) => `${row(cells)}\n${row(cells.map(() => '---'))}`;

interface DriftAgg { scripted: number; hits: number; detected: number; meanDelay: number; meanAbsDelay: number; falseAlarms: number; runs: number }

function aggDrift(results: DriftResult[]): DriftAgg {
  const delays = results.filter((r) => r.delay !== undefined).map((r) => r.delay!);
  return {
    runs: results.length,
    scripted: results.filter((r) => r.scripted).length,
    hits: results.filter((r) => r.hit).length,
    detected: delays.length,
    meanDelay: mean(delays),
    meanAbsDelay: mean(delays.map(Math.abs)),
    falseAlarms: results.reduce((a, r) => a + r.falseAlarms, 0),
  };
}

export interface Headline {
  watchAccuracy: number; chosenF1: number; servedF1: number; chosen30Mae: number;
  baselines: Record<string, { watchAccuracy: number; chosenF1: number; chosen30Mae: number }>;
  titleAccuracy: number; titleMacroF1: number; simTopicAccuracy: number;
  driftHitRate: number; driftMeanAbsDelay: number; falseAlarmsPerStableRun: number; extraTurningPointsPerDriftRun: number;
  countsHitRate: number; countsFalseAlarmsPerStableRun: number;
  oracleDriftHitRate: number;
  headlineTargetRate: number; headlineFalseClaimRate: number;
}

export function headline(res: EvalResults, classifier = 'keyword'): Headline {
  const runs = res.runs.filter((r) => r.classifier === classifier);
  const o = summariseOrigin(runs);
  const f1 = (rep: ReturnType<typeof classificationReport>, l: string) => rep.perClass.find((c) => c.label === l)?.f1 ?? 0;
  const baselines: Headline['baselines'] = {};
  for (const b of BASELINES) {
    const s = summariseOrigin(runs, b);
    baselines[b] = { watchAccuracy: s.watch.accuracy, chosenF1: f1(s.watch, 'chosen'), chosen30Mae: s.chosen30Mae };
  }
  const drifting = runs.filter((r) => r.persona.drift);
  const stable = runs.filter((r) => !r.persona.drift);
  const d = aggDrift(drifting.map((r) => r.drift));
  const c = aggDrift(drifting.map((r) => r.countsBaseline));
  const oracle = res.runs.filter((r) => r.classifier === 'oracle' && r.persona.drift);
  const title = res.titles.find((t) => t.classifier === classifier) ?? res.titles[0];
  return {
    watchAccuracy: o.watch.accuracy, chosenF1: f1(o.watch, 'chosen'), servedF1: f1(o.watch, 'served'), chosen30Mae: o.chosen30Mae,
    baselines,
    titleAccuracy: title.report.accuracy, titleMacroF1: title.report.macroF1,
    simTopicAccuracy: classificationReport(runs.flatMap((r) => r.topicTruth), runs.flatMap((r) => r.topicPred)).accuracy,
    driftHitRate: d.hits / Math.max(1, d.scripted), driftMeanAbsDelay: d.meanAbsDelay,
    falseAlarmsPerStableRun: stable.reduce((a, r) => a + r.drift.falseAlarms, 0) / Math.max(1, stable.length),
    extraTurningPointsPerDriftRun: d.falseAlarms / Math.max(1, drifting.length),
    countsHitRate: c.hits / Math.max(1, c.scripted),
    countsFalseAlarmsPerStableRun: stable.reduce((a, r) => a + r.countsBaseline.falseAlarms, 0) / Math.max(1, stable.length),
    oracleDriftHitRate: aggDrift(oracle.map((r) => r.drift)).hits / Math.max(1, oracle.length),
    headlineTargetRate: drifting.filter((r) => r.headlineNamesTarget).length / Math.max(1, drifting.length),
    headlineFalseClaimRate: stable.filter((r) => r.headlineClaimsDrift).length / Math.max(1, stable.length),
  };
}

export function consoleSummary(res: EvalResults): string {
  const lines: string[] = [];
  for (const cls of res.classifiers.filter((c) => c !== 'oracle')) {
    const h = headline(res, cls);
    lines.push(`== ${cls} classifier (${res.personas.length} personas x ${res.seeds.length} seeds) ==`);
    lines.push(`Origin (watches, chosen vs served): accuracy ${p(h.watchAccuracy)}, chosen F1 ${h.chosenF1.toFixed(3)}, served F1 ${h.servedF1.toFixed(3)}, chosen% MAE (30d) ${n1(h.chosen30Mae)} pts`);
    for (const b of BASELINES) {
      const x = h.baselines[b];
      lines.push(`  baseline ${ORIGIN_BASELINE_LABELS[b]}: accuracy ${p(x.watchAccuracy)}, chosen F1 ${x.chosenF1.toFixed(3)}, chosen% MAE ${n1(x.chosen30Mae)} pts`);
    }
    lines.push(`Topics: labelled titles accuracy ${p(h.titleAccuracy)}, macro-F1 ${h.titleMacroF1.toFixed(3)}; simulated watches accuracy ${p(h.simTopicAccuracy)}`);
    lines.push(`Drift: onset hit rate (±1 month) ${p(h.driftHitRate, 0)}, mean |delay| ${n1(h.driftMeanAbsDelay)} months, false alarms per stable run ${n1(h.falseAlarmsPerStableRun)}, extra turning points per drift run ${n1(h.extraTurningPointsPerDriftRun)}`);
    lines.push(`  baseline monthly counts: hit rate ${p(h.countsHitRate, 0)}, false alarms per stable run ${n1(h.countsFalseAlarmsPerStableRun)}`);
    lines.push(`  with true topics (oracle): hit rate ${p(h.oracleDriftHitRate, 0)}`);
    lines.push(`Headline: names the drift topic in ${p(h.headlineTargetRate, 0)} of drift runs; claims a drift in ${p(h.headlineFalseClaimRate, 0)} of no-drift runs`);
  }
  return lines.join('\n');
}

function originSection(res: EvalResults, cls: string): string[] {
  const runs = res.runs.filter((r) => r.classifier === cls);
  const out: string[] = [];
  const methods: { name: string; key: 'drift' | (typeof BASELINES)[number] }[] = [
    { name: `**Drift** (${cls} topics)`, key: 'drift' },
    ...BASELINES.map((b) => ({ name: `Baseline: ${ORIGIN_BASELINE_LABELS[b]}`, key: b })),
  ];
  out.push(head(['Method', 'Watch accuracy', 'Chosen P', 'Chosen R', 'Chosen F1', 'Served F1', 'All-events 4-class acc.', '4-class macro-F1', 'Chosen% MAE, 30 days (pts)', 'Chosen% MAE, all history (pts)']));
  for (const m of methods) {
    const s = summariseOrigin(runs, m.key);
    const ch = s.watch.perClass.find((c) => c.label === 'chosen')!;
    const se = s.watch.perClass.find((c) => c.label === 'served')!;
    out.push(row([m.name, p(s.watch.accuracy), p(ch.precision), p(ch.recall), ch.f1.toFixed(3), se.f1.toFixed(3), p(s.all.accuracy), s.all.macroF1.toFixed(3), n1(s.chosen30Mae), n1(s.chosenAllMae)]));
  }
  out.push('');
  out.push('Accuracy by true route (watches; share labelled on the correct side, chosen vs served):');
  out.push('');
  const drift = summariseOrigin(runs);
  const bases = BASELINES.map((b) => summariseOrigin(runs, b));
  out.push(head(['True route', 'True origin', 'Watches', 'Drift', ...BASELINES.map((b) => ORIGIN_BASELINE_LABELS[b])]));
  for (const r of drift.byReason) {
    const origin = ['search_result', 'subscription', 'return'].includes(r.reason) ? 'chosen' : 'served';
    out.push(row([r.reason, origin, r.n, p(r.correct / r.n), ...bases.map((b) => { const x = b.byReason.find((y) => y.reason === r.reason)!; return p(x.correct / x.n); })]));
  }
  out.push('');
  out.push('Which analysis rule labelled each watch (rows = true route, share of that route’s watches). Errors are chosen routes landing in "feed", and served routes landing in any other column:');
  out.push('');
  const RULES = ['subscribed', 'after_search', 'came_back', 'feed'] as const;
  const tally = new Map<string, Map<string, number>>();
  for (const r of runs) r.watchReasons.forEach((reason, i) => {
    let m = tally.get(reason);
    if (!m) tally.set(reason, (m = new Map()));
    m.set(r.watchRules[i], (m.get(r.watchRules[i]) ?? 0) + 1);
  });
  out.push(head(['True route', ...RULES]));
  for (const [reason, m] of [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    out.push(row([reason, ...RULES.map((k) => p((m.get(k) ?? 0) / total))]));
  }
  out.push('');
  out.push('4-class confusion matrix, Drift, all events (rows = truth, columns = predicted):');
  out.push('');
  const all = drift.all;
  out.push(head(['truth \\ pred', ...all.labels]));
  all.labels.forEach((l, i) => out.push(row([l, ...all.matrix[i]])));
  return out;
}

function personaTable(res: EvalResults, cls: string): string[] {
  const out: string[] = [];
  out.push(head(['Persona', 'Events/run', 'Watch acc.', 'Chosen F1', 'Chosen% 30d truth', 'Chosen% 30d Drift', 'Topic acc. (sim)', 'Script', 'Onset hits', 'Detected months', 'Extra TPs', 'Counts baseline hits / FAs', 'Attribution (truth → said)', 'Headline right', 'Headline (seed 1)']));
  for (const persona of res.personas) {
    const runs = res.runs.filter((r) => r.classifier === cls && r.persona.id === persona.id);
    const o = summariseOrigin(runs);
    const topic = classificationReport(runs.flatMap((r) => r.topicTruth), runs.flatMap((r) => r.topicPred));
    const d = persona.drift;
    const script = d ? `${d.target} ↑ from ${runs[0] ? monthOf(runs[0], d.onset) : ''} (${d.via})` : 'no drift';
    const hits = d ? `${runs.filter((r) => r.drift.hit).length}/${runs.length}` : '–';
    const detected = d ? runs.map((r) => (r.drift.detected ? `${r.drift.detected}${fmtDelay(r.drift.delay)}` : 'miss')).join(', ') : '–';
    const extra = runs.reduce((a, r) => a + r.drift.falseAlarms, 0);
    const counts = `${d ? runs.filter((r) => r.countsBaseline.hit).length : '–'} / ${runs.reduce((a, r) => a + r.countsBaseline.falseAlarms, 0)}`;
    const attr = d ? summariseAttribution(runs) : '–';
    // Drift persona: headline names the target rising. No-drift persona: headline does not claim a drift.
    const hlRight = `${runs.filter((r) => (d ? r.headlineNamesTarget : !r.headlineClaimsDrift)).length}/${runs.length}`;
    out.push(row([
      persona.id, Math.round(mean(runs.map((r) => r.events))), p(o.watch.accuracy),
      (o.watch.perClass.find((c) => c.label === 'chosen')?.f1 ?? 0).toFixed(3),
      n1(mean(runs.map((r) => r.chosen30.truth))), n1(mean(runs.map((r) => r.chosen30.drift))),
      p(topic.accuracy), script, hits, detected, extra, counts, attr, hlRight, `"${runs[0]?.headline ?? ''}"`,
    ]));
  }
  return out;
}

const monthOf = (r: RunResult, offset: number) => {
  const [y, m] = r.persona.start.split('-').map(Number);
  const k = y * 12 + m - 1 + offset;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
};
const fmtDelay = (d?: number) => (d === undefined ? '' : d === 0 ? ' (0)' : ` (${d > 0 ? '+' : ''}${d})`);

function summariseAttribution(runs: RunResult[]): string {
  const said = runs.map((r) => r.attribution?.said ?? 'none');
  const truth = runs[0]?.attribution?.truth ?? '?';
  const counts = new Map<string, number>();
  for (const s of said) counts.set(s, (counts.get(s) ?? 0) + 1);
  return `${truth} → ${[...counts.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`;
}

export function renderReport(res: EvalResults, meta: { date: string; command: string }): string {
  const out: string[] = [];
  const h = headline(res, 'keyword');
  out.push('# Drift evaluation report');
  out.push('');
  out.push(`Generated ${meta.date} by \`${meta.command}\`. Seeds: ${res.seeds.join(', ')}. Personas: ${res.personas.length}. Classifiers: ${res.classifiers.join(', ')}.`);
  out.push('All numbers are on **simulated** histories with known ground truth (see `docs/EVALUATION.md`). Metrics are deterministic for a given seed list; only this date line changes between runs.');
  out.push('Origin metrics pool every event of every persona and seed. "oracle" = the same analysis given the true topic of every item, which isolates origin labelling and drift detection from topic errors.');
  out.push('');
  out.push('## Headline (keyword classifier)');
  out.push('');
  out.push(head(['Question', 'Drift', 'Best baseline', 'Baseline value']));
  const bestChosen = BASELINES.map((b) => [b, h.baselines[b]] as const).sort((a, b) => b[1].chosenF1 - a[1].chosenF1)[0];
  const bestMae = BASELINES.map((b) => [b, h.baselines[b]] as const).sort((a, b) => a[1].chosen30Mae - b[1].chosen30Mae)[0];
  out.push(row(['Chosen vs served, watch accuracy', p(h.watchAccuracy), ORIGIN_BASELINE_LABELS[bestChosen[0]], p(bestChosen[1].watchAccuracy)]));
  out.push(row(['Chosen vs served, chosen-class F1', h.chosenF1.toFixed(3), ORIGIN_BASELINE_LABELS[bestChosen[0]], bestChosen[1].chosenF1.toFixed(3)]));
  out.push(row(['Chosen % (last 30 days), mean abs. error', `${n1(h.chosen30Mae)} pts`, ORIGIN_BASELINE_LABELS[bestMae[0]], `${n1(bestMae[1].chosen30Mae)} pts`]));
  out.push(row(['Drift onset found within ±1 month', p(h.driftHitRate, 0), 'Simple monthly counts', p(h.countsHitRate, 0)]));
  out.push(row(['False drift alarms per no-drift run', n1(h.falseAlarmsPerStableRun), 'Simple monthly counts', n1(h.countsFalseAlarmsPerStableRun)]));
  out.push(row(['Headline names the scripted drift topic (drift runs)', p(h.headlineTargetRate, 0), '–', '–']));
  out.push(row(['Headline claims a drift that was not scripted (no-drift runs)', p(h.headlineFalseClaimRate, 0), '–', '–']));
  out.push(row(['Topic accuracy, labelled titles', p(h.titleAccuracy), '–', '–']));
  out.push(row(['Topic macro-F1, labelled titles', h.titleMacroF1.toFixed(3), '–', '–']));
  out.push(row(['Topic accuracy, simulated watches (with channel)', p(h.simTopicAccuracy), '–', '–']));
  out.push(row(['Drift onset hit rate with true topics (oracle)', p(h.oracleDriftHitRate, 0), '–', '–']));
  out.push('');

  out.push('## Origin labelling (chosen vs served)');
  out.push('');
  out.push('Origin labelling does not use topics, so these numbers are the same for every classifier. "Watch" metrics cover watch events without ads (the hard part); "all events" adds searches, likes and ads, which the export marks outright.');
  out.push('');
  out.push(...originSection(res, 'keyword'));
  out.push('');

  for (const cls of res.classifiers) {
    out.push(`## Per persona: ${cls}`);
    out.push('');
    out.push(`Aggregated over ${res.seeds.length} seeds. "Detected months" lists the target's rising turning point per seed with the delay in months. "Extra TPs" counts false alarms: turning points the script does not explain (any topic rising other than the target, any fall outside onset-1..onset+2; for no-drift personas every turning point). "Headline right": drift runs whose headline says the feed drifted toward the target; no-drift runs whose headline does not claim a drift. Counts baseline: largest month-over-month count increase (≥10 items and ≥1.5×), hits / unexplained flags.`);
    out.push('');
    out.push(...personaTable(res, cls));
    out.push('');
  }

  out.push('## Turning points, seed ' + res.seeds[0] + ' (keyword)');
  out.push('');
  out.push(head(['Persona', 'Turning points (month topic direction)']));
  for (const persona of res.personas) {
    const r = res.runs.find((x) => x.classifier === 'keyword' && x.persona.id === persona.id && x.seed === res.seeds[0]);
    out.push(row([persona.id, r?.turningPoints.map((t) => `${t.month} ${t.topic} ${t.direction}`).join('; ') || 'none']));
  }
  out.push('');

  for (const t of res.titles) {
    out.push(`## Topic classifier on labelled titles: ${t.classifier}`);
    out.push('');
    out.push(`${t.report.n} hand-labelled titles (\`src/lib/eval/labelled-titles.ts\`). Accuracy ${p(t.report.accuracy)}, macro-F1 ${t.report.macroF1.toFixed(3)}. Coverage (not 'other') ${p(t.coverage)}. English ${p(t.accuracyEn)}, Swedish ${p(t.accuracySv)}. Easy ${p(t.accuracyEasy)}, hard ${p(t.accuracyHard)}.`);
    out.push('');
    out.push(head(['Topic', 'Precision', 'Recall', 'F1', 'Support']));
    for (const c of t.report.perClass) out.push(row([c.label, p(c.precision, 0), p(c.recall, 0), c.f1.toFixed(2), c.support]));
    out.push('');
    out.push('Top confusions (truth → predicted):');
    out.push('');
    out.push(head(['Truth', 'Predicted', 'Count']));
    for (const c of t.confusions) out.push(row([c.truth, c.pred, c.count]));
    out.push('');
  }
  out.push('## Simulated persona descriptions');
  out.push('');
  for (const persona of res.personas) out.push(`- **${persona.id}** (${persona.start}, ${persona.months} months): ${persona.description}`);
  out.push('');
  return out.join('\n');
}
