// Drift evaluation CLI. Usage: npm run eval -- [--seeds 1,2,3] [--ml] [--out docs/eval-report.md]
import { writeFileSync } from 'node:fs';
import type { TopicClassifier } from '@/lib/types';
import { DEFAULT_SEEDS, runEvaluation } from '@/lib/eval/run';
import { consoleSummary, renderReport } from '@/lib/eval/report';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const seeds = arg('seeds')?.split(',').map((s) => Number(s.trim())).filter(Number.isFinite) ?? DEFAULT_SEEDS;
  const out = arg('out') ?? 'docs/eval-report.md';
  const extra: TopicClassifier[] = [];
  if (process.argv.includes('--ml')) {
    try {
      const ml = await import('@/lib/ml');
      if (typeof ml.createMlClassifier !== 'function') throw new Error('createMlClassifier is not exported');
      const c = await ml.createMlClassifier();
      await c.classify([{ title: 'test' }]);
      extra.push(c);
      console.log(`ML classifier loaded: ${c.name}`);
    } catch (e) {
      console.warn(`Skipping the ML classifier: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const t0 = Date.now();
  const res = await runEvaluation({ seeds, extraClassifiers: extra });
  console.log(consoleSummary(res));
  const cmd = `npm run eval${process.argv.length > 2 ? ' -- ' + process.argv.slice(2).join(' ') : ''}`;
  writeFileSync(out, renderReport(res, { date: new Date().toISOString().slice(0, 10), command: cmd }));
  console.log(`\nWrote ${out} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
